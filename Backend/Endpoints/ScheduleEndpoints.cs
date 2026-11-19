using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapSchedules(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization(policy => policy.RequireRole("Admin", "Professor")).WithTags("Grade e agenda");
        api.MapGet("/schedules", async (int? semesterId, AppDbContext db) =>
            Results.Ok(await db.Schedules.Where(s => semesterId == null || s.SemesterId == semesterId)
                .OrderByDescending(s => s.CreatedAtUtc)
                .Select(s => new
                {
                    s.Id,
                    s.SemesterId,
                    s.Status,
                    s.UnallocatedMeetings,
                    s.CreatedAtUtc,
                    AllocatedMeetings = s.WeeklyClasses.Count + s.UnitPlans.SelectMany(p => p.Meetings).Count(),
                    UnitPlanCount = s.UnitPlans.Count
                }).ToListAsync()));

        api.MapGet("/schedules/{id:int}", async (int id, AppDbContext db) =>
        {
            var schedule = await db.Schedules.AsNoTracking().Include(s => s.WeeklyClasses)
                .ThenInclude(w => w.Shift).Include(s => s.WeeklyClasses)
                .ThenInclude(w => w.Assignment).Include(s => s.WeeklyClasses)
                .ThenInclude(w => w.Room).Include(s => s.UnitPlans)
                .ThenInclude(p => p.Offering).ThenInclude(o => o.CurricularUnit)
                .Include(s => s.UnitPlans).ThenInclude(p => p.Offering).ThenInclude(o => o.ClassGroup)
                    .ThenInclude(c => c.Course)
                .Include(s => s.UnitPlans).ThenInclude(p => p.Offering).ThenInclude(o => o.ClassGroup)
                    .ThenInclude(c => c.CourseModule)
                .Include(s => s.UnitPlans).ThenInclude(p => p.Meetings).ThenInclude(m => m.Shift)
                .Include(s => s.UnitPlans).ThenInclude(p => p.Meetings).ThenInclude(m => m.Room)
                .AsSplitQuery().FirstOrDefaultAsync(s => s.Id == id);
            if (schedule is null) return Results.NotFound();
            return Results.Ok(new
            {
                schedule.Id,
                schedule.SemesterId,
                schedule.Status,
                schedule.UnallocatedMeetings,
                schedule.CreatedAtUtc,
                UnitPlans = schedule.UnitPlans.Select(p => new
                {
                    p.Id, p.ClassGroupId, ClassName = p.Offering.ClassGroup.Name,
                    CourseName = p.Offering.ClassGroup.Course?.Name,
                    ModuleName = p.Offering.ClassGroup.CourseModule?.Name,
                    p.CurricularUnitId, UnitName = p.Offering.CurricularUnit.Name,
                    p.TeacherId, p.PlannedHours, p.AllocatedHours,
                    UnallocatedHours = p.PlannedHours is decimal total ? Math.Max(0, total - p.AllocatedHours) : (decimal?)null,
                    p.PendingReason, p.Offering.DeliveryMode, p.Offering.EadScheduleMode,
                    Meetings = p.Meetings.OrderBy(m => m.Date).Select(m => new
                    {
                        m.Id, m.Date, m.ShiftId, ShiftName = m.Shift?.Name,
                        Start = m.Shift?.StartsAt, End = m.Shift?.EndsAt,
                        m.RoomId, Room = m.Room?.Name, m.PlannedHours
                    })
                }),
                Lessons = schedule.WeeklyClasses.Select(w => new
                {
                    w.Id,
                    w.Weekday,
                    w.ShiftId,
                    ShiftName = w.Shift.Name,
                    Start = w.Shift.StartsAt,
                    End = w.Shift.EndsAt,
                    w.RoomId,
                    Room = w.Room.Name,
                    w.AssignmentId,
                    w.Assignment.TeacherId,
                    w.Assignment.ClassGroupId,
                    w.Assignment.DisciplineName
                })
            });
        });

        api.MapPost("/schedules/generate/{semesterId:int}", async (int semesterId,
            AppDbContext db, [FromServices] ScheduleGenerator generator) =>
        {
            if (await db.Schedules.AnyAsync(s => s.SemesterId == semesterId
                    && s.Status == ScheduleStatus.Publicada))
                return Results.Conflict(new ApiError("Já há grade publicada nesse semestre. A versão inicial não substitui grades publicadas."));
            var (schedule, error) = await generator.GenerateAsync(semesterId);
            return schedule is null ? Error(error ?? "Não foi possível gerar a grade") :
                Results.Ok(new
                {
                    schedule.Id,
                    schedule.Status,
                    schedule.UnallocatedMeetings,
                    AllocatedMeetings = schedule.WeeklyClasses.Count + schedule.UnitPlans.Sum(p => p.Meetings.Count),
                    UnitPlanCount = schedule.UnitPlans.Count,
                    Note = schedule.UnallocatedMeetings > 0 ? "Grade parcial: ajuste os cadastros e gere novamente" : "Grade pronta para revisão"
                });
        }).RequireAuthorization("Admin");

        api.MapPost("/schedules/{id:int}/publish", async (int id, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var schedule = await db.Schedules.Include(s => s.Semester)
                .Include(s => s.WeeklyClasses).ThenInclude(w => w.Shift)
                .Include(s => s.WeeklyClasses).ThenInclude(w => w.Assignment)
                .Include(s => s.UnitPlans).ThenInclude(p => p.Offering)
                    .ThenInclude(o => o.CurricularUnit).ThenInclude(u => u.ResourceRequirements)
                    .ThenInclude(r => r.ResourceCatalogItem)
                .Include(s => s.UnitPlans).ThenInclude(p => p.Offering).ThenInclude(o => o.ClassGroup)
                .Include(s => s.UnitPlans).ThenInclude(p => p.Meetings).ThenInclude(m => m.Shift)
                .AsSplitQuery()
                .FirstOrDefaultAsync(s => s.Id == id);
            if (schedule is null) return Results.NotFound();
            if (schedule.Status != ScheduleStatus.Rascunho) return Error("A grade não está em rascunho");
            if (schedule.UnallocatedMeetings > 0 ||
                schedule.UnitPlans.Any(p => p.PendingReason != null || p.PlannedHours is null ||
                    p.AllocatedHours != p.PlannedHours || p.Meetings.Count == 0) ||
                schedule.WeeklyClasses.Count == 0 && schedule.UnitPlans.Count == 0)
                return Error("Não é possível publicar uma grade incompleta");
            if (await db.Schedules.AnyAsync(s => s.Id != id && s.SemesterId == schedule.SemesterId
                && s.Status == ScheduleStatus.Publicada))
                return Results.Conflict(new ApiError("Já existe outra grade publicada para esse semestre"));

            var pendingOccupations = new List<RoomOccupation>();
            var events = await EventsFor(db, schedule.SemesterId,
                schedule.Semester.StartDate, schedule.Semester.EndDate);
            var calendars = new Dictionary<(int ClassId, int Weekday), HashSet<DateOnly>>();
            foreach (var weekly in schedule.WeeklyClasses)
            {
                var classId = weekly.Assignment.ClassGroupId;
                var key = (classId, weekly.Weekday);
                if (!calendars.TryGetValue(key, out var eligible))
                {
                    var classGroup = await db.Classes.AsNoTracking().FirstAsync(c => c.Id == classId);
                    var exceptions = await ExceptionsFor(db, classId,
                        schedule.Semester.StartDate, schedule.Semester.EndDate);
                    eligible = AcademicCalendarRules.Preview(schedule.Semester,
                        schedule.Semester.StartDate, schedule.Semester.EndDate,
                        1 << weekly.Weekday, classGroup, events, exceptions).Dates
                        .Where(d => d.CountsAsPresential).Select(d => d.Date).ToHashSet();
                    calendars[key] = eligible;
                }
                foreach (var period in ScheduleGenerator.AllOccurrences(schedule.Semester, weekly.Weekday, weekly.Shift))
                {
                    if (!eligible.Contains(DateOnly.FromDateTime(period.Start))) continue;
                    var conflict = await ReservationRules.ConflictAsync(db, weekly.RoomId,
                        period.Start, period.End, weekly.Assignment.TeacherId,
                        weekly.Assignment.ClassGroupId);
                    if (conflict is not null) return Results.Conflict(new ApiError($"Conflito ao publicar: {conflict} ({period.Start:dd/MM HH:mm})"));
                    if (pendingOccupations.Any(o => ScheduleGenerator.Overlap(o.StartsAt, o.EndsAt,
                            period.Start, period.End) &&
                        (o.RoomId == weekly.RoomId || o.TeacherId == weekly.Assignment.TeacherId
                            || o.ClassGroupId == weekly.Assignment.ClassGroupId)))
                        return Results.Conflict(new ApiError("A própria grade possui horários conflitantes"));
                    pendingOccupations.Add(new RoomOccupation
                    {
                        WeeklyClassId = weekly.Id,
                        RoomId = weekly.RoomId,
                        StartsAt = period.Start,
                        EndsAt = period.End,
                        TeacherId = weekly.Assignment.TeacherId,
                        ClassGroupId = weekly.Assignment.ClassGroupId,
                        Kind = OccupationKind.Aula,
                        Description = weekly.Assignment.DisciplineName
                    });
                }
            }
            var pendingUnitSlots = new List<(DateTime Start, DateTime End, string TeacherId, int ClassId, int? RoomId)>();
            foreach (var plan in schedule.UnitPlans)
            {
                if (plan.TeacherId != plan.Offering.TeacherId || string.IsNullOrWhiteSpace(plan.TeacherId))
                    return Results.Conflict(new ApiError("Instrutor da oferta mudou após a geração"));
                if (!await db.TeacherCourseQualifications.AnyAsync(x => x.TeacherId == plan.TeacherId &&
                    x.CourseId == plan.Offering.ClassGroup.CourseId) ||
                    !await db.TeacherUnitQualifications.AnyAsync(x => x.TeacherId == plan.TeacherId &&
                    x.CurricularUnitId == plan.CurricularUnitId))
                    return Results.Conflict(new ApiError("Habilitação docente mudou após a geração"));
                var offer = plan.Offering;
                if (offer.ClassGroup.SemesterId != schedule.SemesterId ||
                    offer.ClassGroup.CourseModuleId != offer.CurricularUnit.CourseModuleId ||
                    plan.PlannedHours != offer.CurricularUnit.PlannedHours)
                    return Results.Conflict(new ApiError("Oferta não corresponde mais à turma e ao semestre"));
                foreach (var meeting in plan.Meetings)
                {
                    if (meeting.Date is null)
                    {
                        if (offer.DeliveryMode != UnitDeliveryMode.Ead ||
                            offer.EadScheduleMode != EadScheduleMode.SemHorarioFixo ||
                            meeting.ShiftId is not null || meeting.RoomId is not null)
                            return Results.Conflict(new ApiError("Encontro EAD sem horário inválido"));
                        continue;
                    }
                    if (meeting.Shift is null || meeting.Date < schedule.Semester.StartDate ||
                        meeting.Date > schedule.Semester.EndDate || meeting.Shift.PedagogicalHours < meeting.PlannedHours ||
                        offer.ClassGroup.ShiftId != meeting.ShiftId ||
                        (offer.DeliveryMode == UnitDeliveryMode.Presencial) != (meeting.RoomId is not null) ||
                        offer.DeliveryMode == UnitDeliveryMode.Ead && offer.EadScheduleMode != EadScheduleMode.HorarioDefinido)
                        return Results.Conflict(new ApiError("Data, turno ou modalidade da oferta mudou"));
                    var day = AcademicCalendarRules.Preview(schedule.Semester, meeting.Date.Value,
                        meeting.Date.Value, 1 << (int)meeting.Date.Value.DayOfWeek, offer.ClassGroup,
                        events, await ExceptionsFor(db, plan.ClassGroupId, meeting.Date.Value, meeting.Date.Value))
                        .Dates.Single();
                    if (offer.DeliveryMode == UnitDeliveryMode.Presencial ? !day.CountsAsPresential :
                        day.Kind is AcademicDayKind.Holiday or AcademicDayKind.Recess or AcademicDayKind.Planning or AcademicDayKind.NonTeaching)
                        return Results.Conflict(new ApiError($"Calendário não permite encontro em {meeting.Date:dd/MM/yyyy}"));
                    if (!await db.Availabilities.AnyAsync(x => x.TeacherId == plan.TeacherId &&
                        x.Weekday == (int)meeting.Date.Value.DayOfWeek && x.ShiftId == meeting.ShiftId))
                        return Results.Conflict(new ApiError("Disponibilidade do instrutor mudou"));
                    var start = meeting.Date.Value.ToDateTime(meeting.Shift.StartsAt);
                    var end = meeting.Date.Value.ToDateTime(meeting.Shift.EndsAt);
                    if (await ReservationRules.ConflictAsync(db, meeting.RoomId ?? 0, start, end,
                        plan.TeacherId, plan.ClassGroupId) is string conflict)
                        return Results.Conflict(new ApiError(conflict));
                    if (pendingOccupations.Any(x => ScheduleGenerator.Overlap(x.StartsAt, x.EndsAt, start, end) &&
                        (x.TeacherId == plan.TeacherId || x.ClassGroupId == plan.ClassGroupId ||
                         meeting.RoomId is int roomId && x.RoomId == roomId)) ||
                        pendingUnitSlots.Any(x => ScheduleGenerator.Overlap(x.Start, x.End, start, end) &&
                            (x.TeacherId == plan.TeacherId || x.ClassId == plan.ClassGroupId ||
                             meeting.RoomId is int roomId && x.RoomId == roomId)))
                        return Results.Conflict(new ApiError("A própria grade possui horários conflitantes"));
                    if (meeting.RoomId is int physicalRoomId)
                    {
                        var room = await db.Rooms.Include(x => x.Resources).FirstOrDefaultAsync(x => x.Id == physicalRoomId);
                        if (room is null || !room.Active || room.Seats < offer.ClassGroup.Students ||
                            offer.CurricularUnit.ResourceRequirements.Count > 0 &&
                            EnvironmentCompatibility.Evaluate(null, room, offer.ClassGroup.Students,
                                meeting.Date.Value, false, offer.CurricularUnit.ResourceRequirements).Classification != "Compatible")
                            return Results.Conflict(new ApiError("Ambiente deixou de atender aos requisitos da UC"));
                        pendingOccupations.Add(new RoomOccupation { RoomId = physicalRoomId,
                            StartsAt = start, EndsAt = end, TeacherId = plan.TeacherId,
                            ClassGroupId = plan.ClassGroupId, Kind = OccupationKind.Aula,
                            ScheduleUnitMeetingId = meeting.Id, Description = offer.CurricularUnit.Name });
                    }
                    pendingUnitSlots.Add((start, end, plan.TeacherId!, plan.ClassGroupId, meeting.RoomId));
                }
            }
            if (pendingOccupations.Count == 0 && schedule.UnitPlans.Count == 0)
                return Results.Conflict(new ApiError("A grade não possui encontros presenciais elegíveis no calendário das turmas"));
            db.Occupations.AddRange(pendingOccupations);
            schedule.Status = ScheduleStatus.Publicada;
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new
            {
                schedule.Id,
                schedule.Status,
                OccupationsCreated = pendingOccupations.Count
            });
        }).RequireAuthorization("Admin");

        MapScheduleReview(api);
        MapPeriodAgenda(api);

        api.MapPost("/rooms/block", async (BlockRoom input, AppDbContext db) =>
        {
            if (!ReservationRules.LocalTimeRange(input.StartsAt, input.EndsAt) ||
                !await db.Rooms.AnyAsync(r => r.Id == input.RoomId))
                return Error("Sala ou período inválido");
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var conflict = await ReservationRules.ConflictAsync(db, input.RoomId,
                input.StartsAt, input.EndsAt, null, null);
            if (conflict is not null) return Results.Conflict(new ApiError(conflict));
            var occupation = new RoomOccupation
            {
                RoomId = input.RoomId,
                StartsAt = input.StartsAt,
                EndsAt = input.EndsAt,
                Kind = OccupationKind.Bloqueio,
                Description = input.Description
            };
            db.Occupations.Add(occupation);
            await db.SaveChangesAsync(); await tx.CommitAsync();
            return Results.Created($"/api/agenda", new { occupation.Id });
        }).RequireAuthorization("Admin");
        api.MapDelete("/rooms/block/{id:int}", async (int id, AppDbContext db) =>
        {
            var item = await db.Occupations.FirstOrDefaultAsync(o =>
                o.Id == id && o.Kind == OccupationKind.Bloqueio);
            if (item is null) return Results.NotFound();
            db.Occupations.Remove(item); await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }
}
