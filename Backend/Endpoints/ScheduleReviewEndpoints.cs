using System.Data;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private sealed record MeetingAssessment(decimal Hours, IReadOnlyList<string> Blocks)
    {
        public bool Allowed => Blocks.Count == 0;
    }

    private static void MapScheduleReview(RouteGroupBuilder api)
    {
        api.MapPost("/schedules/{scheduleId:int}/unit-plans/{planId:int}/meeting-preview",
            async (int scheduleId, int planId, ScheduleMeetingAdjustmentInput input, AppDbContext db) =>
            {
                var schedule = await ReviewSchedule(db, scheduleId);
                var plan = schedule?.UnitPlans.FirstOrDefault(x => x.Id == planId);
                if (plan is null) return Results.NotFound();
                var assessment = await AssessMeeting(db, schedule!, plan, input);
                return Results.Ok(new { assessment.Allowed, assessment.Blocks, assessment.Hours });
            }).RequireAuthorization("Admin");

        api.MapPut("/schedules/{scheduleId:int}/unit-plans/{planId:int}/meeting",
            async (int scheduleId, int planId, ScheduleMeetingAdjustmentInput input,
                ClaimsPrincipal current, AppDbContext db) =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
                var schedule = await ReviewSchedule(db, scheduleId);
                var plan = schedule?.UnitPlans.FirstOrDefault(x => x.Id == planId);
                if (plan is null) return Results.NotFound();
                var assessment = await AssessMeeting(db, schedule!, plan, input);
                if (!assessment.Allowed)
                    return Results.Conflict(new { Error = "A aula não pode ser ajustada", assessment.Blocks });
                var oldPending = schedule!.UnitPlans.Count(x =>
                    x.PendingReason != null || x.PlannedHours is null || x.AllocatedHours != x.PlannedHours);
                var legacyPending = Math.Max(0, schedule.UnallocatedMeetings - oldPending);
                var meeting = input.MeetingId is int meetingId
                    ? plan.Meetings.Single(x => x.Id == meetingId) : null;
                var before = meeting is null ? null : new
                {
                    meeting.Date, meeting.ShiftId, meeting.RoomId, meeting.PlannedHours
                };
                if (meeting is null)
                {
                    meeting = new ScheduleUnitMeeting { Plan = plan, PlannedHours = assessment.Hours };
                    plan.Meetings.Add(meeting);
                    plan.AllocatedHours += assessment.Hours;
                }
                meeting.Date = input.Date;
                meeting.ShiftId = input.ShiftId;
                meeting.RoomId = input.RoomId;
                plan.PendingReason = plan.PlannedHours == plan.AllocatedHours ? null :
                    $"Restam {plan.PlannedHours - plan.AllocatedHours:0.##} h para distribuir";
                // A parcela legada continua pendente; somente a pendência desta oferta muda.
                schedule.UnallocatedMeetings = legacyPending + schedule.UnitPlans.Count(x =>
                    x.PendingReason != null || x.PlannedHours is null || x.AllocatedHours != x.PlannedHours);
                AuditTrail.Add(db, "Schedule", schedule.Id.ToString(),
                    before is null ? "EncontroAdicionado" : "EncontroAjustado", UserId(current),
                    before, new { plan.Id, meeting.Date, meeting.ShiftId, meeting.RoomId,
                        meeting.PlannedHours, plan.AllocatedHours });
                await db.SaveChangesAsync();
                await tx.CommitAsync();
                return Results.Ok(new { meeting.Id, plan.AllocatedHours, schedule.UnallocatedMeetings });
            }).RequireAuthorization("Admin");

        api.MapGet("/schedules/{scheduleId:int}/unit-plans/{planId:int}/alternatives",
            async (int scheduleId, int planId, int? meetingId, DateOnly? from,
                AppDbContext db) =>
            {
                var schedule = await ReviewSchedule(db, scheduleId);
                var plan = schedule?.UnitPlans.FirstOrDefault(x => x.Id == planId);
                if (plan is null) return Results.NotFound();
                if (schedule!.Status != ScheduleStatus.Rascunho)
                    return Results.Conflict(new ApiError("Somente rascunhos podem receber sugestões"));
                if (plan.Offering.DeliveryMode == UnitDeliveryMode.Ead &&
                    plan.Offering.EadScheduleMode == EadScheduleMode.SemHorarioFixo)
                    return Results.Ok(Array.Empty<object>());
                var start = from is DateOnly requested && requested > schedule.Semester.StartDate
                    ? requested : schedule.Semester.StartDate;
                var end = start.AddDays(30);
                if (end > schedule.Semester.EndDate) end = schedule.Semester.EndDate;
                var shiftId = plan.Offering.ClassGroup.ShiftId;
                var rooms = plan.Offering.DeliveryMode == UnitDeliveryMode.Presencial
                    ? await db.Rooms.AsNoTracking().Include(x => x.Resources).Where(x => x.Active)
                        .OrderBy(x => x.Id).ToListAsync() : [];
                if (plan.Offering.DeliveryMode == UnitDeliveryMode.Presencial)
                    rooms = rooms.Where(room => room.Seats >= plan.Offering.ClassGroup.Students &&
                        (plan.Offering.CurricularUnit.ResourceRequirements.Count == 0 ||
                         EnvironmentCompatibility.Evaluate(null, room, plan.Offering.ClassGroup.Students,
                             start, false, plan.Offering.CurricularUnit.ResourceRequirements).Classification == "Compatible"))
                        .ToList();
                var availableDays = (await db.Availabilities.AsNoTracking().Where(x =>
                    x.TeacherId == plan.TeacherId && x.ShiftId == shiftId)
                    .Select(x => x.Weekday).ToListAsync()).ToHashSet();
                var events = await EventsFor(db, schedule.SemesterId, start, end);
                var exceptions = await ExceptionsFor(db, plan.ClassGroupId, start, end);
                var eligibleDates = AcademicCalendarRules.Preview(schedule.Semester, start, end, 127,
                    plan.Offering.ClassGroup, events, exceptions).Dates
                    .Where(day => availableDays.Contains((int)day.Date.DayOfWeek) &&
                        (plan.Offering.DeliveryMode == UnitDeliveryMode.Presencial ? day.CountsAsPresential :
                         day.Kind is not (AcademicDayKind.Holiday or AcademicDayKind.Recess or
                             AcademicDayKind.Planning or AcademicDayKind.NonTeaching)))
                    .Select(day => day.Date);
                var candidates = new List<object>();
                foreach (var date in eligibleDates)
                {
                    var roomIds = plan.Offering.DeliveryMode == UnitDeliveryMode.Ead
                        ? new int?[] { null } : rooms.Select(x => (int?)x.Id);
                    foreach (var roomId in roomIds)
                    {
                        var input = new ScheduleMeetingAdjustmentInput(meetingId, date, shiftId ?? 0, roomId);
                        var assessment = await AssessMeeting(db, schedule, plan, input);
                        if (!assessment.Allowed) continue;
                        candidates.Add(new { Date = date, ShiftId = shiftId,
                            RoomId = roomId, RoomName = rooms.FirstOrDefault(x => x.Id == roomId)?.Name,
                            assessment.Hours });
                        if (candidates.Count >= 8) break;
                    }
                    if (candidates.Count >= 8) break;
                }
                return Results.Ok(candidates);
            }).RequireAuthorization("Admin");
    }

    private static Task<Schedule?> ReviewSchedule(AppDbContext db, int id)
        => db.Schedules.Include(s => s.Semester)
            .Include(s => s.WeeklyClasses).ThenInclude(w => w.Shift)
            .Include(s => s.WeeklyClasses).ThenInclude(w => w.Assignment)
            .Include(s => s.UnitPlans).ThenInclude(p => p.Offering).ThenInclude(o => o.ClassGroup)
            .Include(s => s.UnitPlans).ThenInclude(p => p.Offering).ThenInclude(o => o.CurricularUnit)
                .ThenInclude(u => u.ResourceRequirements).ThenInclude(r => r.ResourceCatalogItem)
            .Include(s => s.UnitPlans).ThenInclude(p => p.Offering).ThenInclude(o => o.CurricularUnit)
                .ThenInclude(u => u.CourseModule)
            .Include(s => s.UnitPlans).ThenInclude(p => p.Meetings).ThenInclude(m => m.Shift)
            .AsSplitQuery().FirstOrDefaultAsync(s => s.Id == id);

    private static async Task<MeetingAssessment> AssessMeeting(AppDbContext db, Schedule schedule,
        ScheduleUnitPlan plan, ScheduleMeetingAdjustmentInput input)
    {
        var blocks = new List<string>();
        if (schedule.Status != ScheduleStatus.Rascunho)
            blocks.Add("A grade publicada não pode ser alterada");
        var offer = plan.Offering;
        var cls = offer.ClassGroup;
        var meeting = input.MeetingId is int id ? plan.Meetings.FirstOrDefault(x => x.Id == id) : null;
        if (input.MeetingId is not null && meeting is null)
            blocks.Add("Encontro não pertence a esta oferta");
        if (meeting is not null && meeting.Date is null)
            blocks.Add("EAD sem horário fixo não possui encontro físico para mover");
        if (offer.DeliveryMode == UnitDeliveryMode.Ead &&
            offer.EadScheduleMode == EadScheduleMode.SemHorarioFixo)
            blocks.Add("UC EAD sem horário fixo não bloqueia agenda");
        if (plan.PlannedHours is null or <= 0)
            blocks.Add("Carga horária institucional da UC não informada");
        else if (plan.PlannedHours != offer.CurricularUnit.PlannedHours)
            blocks.Add("Carga horária da UC mudou após a geração; revise a proposta");
        if (string.IsNullOrWhiteSpace(plan.TeacherId) || plan.TeacherId != offer.TeacherId)
            blocks.Add("Instrutor responsável não está atribuído à oferta");
        if (cls.SemesterId != schedule.SemesterId ||
            cls.CourseModuleId != offer.CurricularUnit.CourseModuleId ||
            cls.CourseId != offer.CurricularUnit.CourseModule.CourseId)
            blocks.Add("UC não pertence ao curso e módulo da turma");
        if (plan.TeacherId is string teacher && cls.CourseId is int courseId &&
            (!await db.TeacherCourseQualifications.AnyAsync(x => x.TeacherId == teacher && x.CourseId == courseId) ||
             !await db.TeacherUnitQualifications.AnyAsync(x => x.TeacherId == teacher && x.CurricularUnitId == plan.CurricularUnitId)))
            blocks.Add("Instrutor não está habilitado para o curso e a UC");
        if (await db.Assignments.AnyAsync(x => x.ClassGroupId == plan.ClassGroupId &&
            x.CurricularUnitId == plan.CurricularUnitId && x.EndedAtUtc == null))
            blocks.Add("Esta UC possui atribuição anterior ativa; revise o vínculo antes de ajustar a nova oferta");
        var shift = await db.Shifts.FindAsync(input.ShiftId);
        if (shift is null || cls.ShiftId != shift.Id)
            blocks.Add("Turno não autorizado para esta turma");
        if (shift?.PedagogicalHours is not > 0)
            blocks.Add("Carga pedagógica por turno não configurada");
        var hours = meeting?.PlannedHours ??
            (shift?.PedagogicalHours is > 0 && plan.PlannedHours is decimal planned
                ? Math.Min(shift.PedagogicalHours.Value, planned - plan.AllocatedHours) : 0);
        if (hours <= 0 || shift?.PedagogicalHours < hours)
            blocks.Add("Carga horária do encontro excede a carga disponível no turno ou na UC");
        if (input.Date < schedule.Semester.StartDate || input.Date > schedule.Semester.EndDate)
            blocks.Add("Data fora do semestre");
        else
        {
            var events = await EventsFor(db, schedule.SemesterId, input.Date, input.Date);
            var exceptions = await ExceptionsFor(db, cls.Id, input.Date, input.Date);
            var day = AcademicCalendarRules.Preview(schedule.Semester, input.Date, input.Date,
                1 << (int)input.Date.DayOfWeek, cls, events, exceptions).Dates.Single();
            if (offer.DeliveryMode == UnitDeliveryMode.Presencial ? !day.CountsAsPresential :
                day.Kind is AcademicDayKind.Holiday or AcademicDayKind.Recess or AcademicDayKind.Planning or AcademicDayKind.NonTeaching)
                blocks.Add($"Calendário impede encontro em {input.Date:dd/MM/yyyy}: {day.Reason}");
        }
        if (plan.TeacherId is string assignedTeacher &&
            !await db.Availabilities.AnyAsync(x => x.TeacherId == assignedTeacher &&
                x.Weekday == (int)input.Date.DayOfWeek && x.ShiftId == input.ShiftId))
            blocks.Add("Instrutor indisponível neste dia e turno");
        if (offer.DeliveryMode == UnitDeliveryMode.Presencial)
        {
            if (input.RoomId is not int roomId)
                blocks.Add("Aula presencial exige ambiente físico");
            else
            {
                var room = await db.Rooms.AsNoTracking().Include(x => x.Resources)
                    .FirstOrDefaultAsync(x => x.Id == roomId);
                if (room is null || !room.Active) blocks.Add("Ambiente inexistente ou inativo");
                else
                {
                    if (room.Seats < cls.Students) blocks.Add("Ambiente sem capacidade para os alunos");
                    if (offer.CurricularUnit.ResourceRequirements.Count > 0 &&
                        EnvironmentCompatibility.Evaluate(null, room, cls.Students, input.Date, false,
                            offer.CurricularUnit.ResourceRequirements).Classification != "Compatible")
                        blocks.Add("Recursos obrigatórios insuficientes ou não comprovados no ambiente");
                }
            }
        }
        else if (input.RoomId is not null) blocks.Add("Encontro EAD não reserva ambiente físico");
        if (shift is not null && input.Date >= schedule.Semester.StartDate &&
            input.Date <= schedule.Semester.EndDate)
        {
            var start = input.Date.ToDateTime(shift.StartsAt);
            var end = input.Date.ToDateTime(shift.EndsAt);
            if (schedule.UnitPlans.SelectMany(x => x.Meetings).Any(x => x.Id != meeting?.Id &&
                x.Date is DateOnly date && x.Shift is not null &&
                ScheduleGenerator.Overlap(start, end,
                    date.ToDateTime(x.Shift.StartsAt), date.ToDateTime(x.Shift.EndsAt)) &&
                (x.Plan.TeacherId == plan.TeacherId || x.Plan.ClassGroupId == plan.ClassGroupId ||
                    input.RoomId is int roomId && x.RoomId == roomId)))
                blocks.Add("Conflito com outra aula proposta da grade");
            if (schedule.WeeklyClasses.Any(x => x.Weekday == (int)input.Date.DayOfWeek &&
                ScheduleGenerator.Intersects(x.Shift.StartsAt, x.Shift.EndsAt, shift.StartsAt, shift.EndsAt) &&
                (x.Assignment.TeacherId == plan.TeacherId || x.Assignment.ClassGroupId == plan.ClassGroupId ||
                    input.RoomId is int roomId && x.RoomId == roomId)))
                blocks.Add("Conflito com aula semanal do rascunho");
            if (await ReservationRules.ConflictAsync(db, input.RoomId ?? 0, start, end,
                plan.TeacherId, plan.ClassGroupId) is string conflict)
                blocks.Add(conflict);
        }
        return new MeetingAssessment(hours, blocks);
    }
}
