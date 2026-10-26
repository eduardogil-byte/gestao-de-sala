using System.Data;
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
        var api = app.MapGroup("/api").RequireAuthorization().WithTags("Grade e agenda");
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
                    AllocatedMeetings = s.WeeklyClasses.Count
                }).ToListAsync()));

        api.MapGet("/schedules/{id:int}", async (int id, AppDbContext db) =>
        {
            var schedule = await db.Schedules.AsNoTracking().Include(s => s.WeeklyClasses)
                .ThenInclude(w => w.Shift).Include(s => s.WeeklyClasses)
                .ThenInclude(w => w.Assignment).Include(s => s.WeeklyClasses)
                .ThenInclude(w => w.Room).FirstOrDefaultAsync(s => s.Id == id);
            if (schedule is null) return Results.NotFound();
            return Results.Ok(new
            {
                schedule.Id,
                schedule.SemesterId,
                schedule.Status,
                schedule.UnallocatedMeetings,
                schedule.CreatedAtUtc,
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
            AppDbContext db, ScheduleGenerator generator) =>
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
                    AllocatedMeetings = schedule.WeeklyClasses.Count,
                    Note = schedule.UnallocatedMeetings > 0 ? "Grade parcial: ajuste os cadastros e gere novamente" : "Grade pronta para revisão"
                });
        }).RequireAuthorization("Admin");

        api.MapPost("/schedules/{id:int}/publish", async (int id, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var schedule = await db.Schedules.Include(s => s.Semester)
                .Include(s => s.WeeklyClasses).ThenInclude(w => w.Shift)
                .Include(s => s.WeeklyClasses).ThenInclude(w => w.Assignment)
                .FirstOrDefaultAsync(s => s.Id == id);
            if (schedule is null) return Results.NotFound();
            if (schedule.Status != ScheduleStatus.Rascunho) return Error("A grade não está em rascunho");
            if (schedule.UnallocatedMeetings > 0 || schedule.WeeklyClasses.Count == 0)
                return Error("Não é possível publicar uma grade incompleta");
            if (await db.Schedules.AnyAsync(s => s.Id != id && s.SemesterId == schedule.SemesterId
                && s.Status == ScheduleStatus.Publicada))
                return Results.Conflict(new ApiError("Já existe outra grade publicada para esse semestre"));

            var pendingOccupations = new List<RoomOccupation>();
            foreach (var weekly in schedule.WeeklyClasses)
            {
                foreach (var period in ScheduleGenerator.AllOccurrences(schedule.Semester, weekly.Weekday, weekly.Shift))
                {
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

        api.MapGet("/agenda", async (DateTime from, DateTime to, int? roomId, AppDbContext db) =>
        {
            if (from >= to || to > from.AddDays(32))
                return Error("Informe período válido de até 32 dias");
            var occupations = await db.Occupations.AsNoTracking()
                .Where(o => o.CancelledAtUtc == null && o.StartsAt < to && o.EndsAt > from &&
                    (roomId == null || o.RoomId == roomId)).OrderBy(o => o.StartsAt).ToListAsync();
            var ids = occupations.Select(x => x.Id).ToArray();
            var loans = await db.Loans.Include(l => l.BookingRequest)
                .Where(l => l.Status == LoanStatus.Aprovado
                && ids.Contains(l.RoomOccupationId)).ToListAsync();
            return Results.Ok(occupations.Select(o => new
            {
                o.Id,
                o.RoomId,
                o.StartsAt,
                o.EndsAt,
                o.Kind,
                o.DayStatus,
                o.Description,
                OriginalTeacherId = o.TeacherId,
                ActualTeacherId = loans.FirstOrDefault(l => l.RoomOccupationId == o.Id)?.BorrowerId ?? o.TeacherId,
                IsBorrowed = loans.Any(l => l.RoomOccupationId == o.Id),
                OriginalClassGroupId = o.ClassGroupId,
                ActualClassGroupId = loans.Any(l => l.RoomOccupationId == o.Id)
                    ? loans.First(l => l.RoomOccupationId == o.Id).BookingRequest.ClassGroupId : o.ClassGroupId,
                o.WeeklyClassId,
                o.BookingRequestId,
                LoanId = loans.FirstOrDefault(l => l.RoomOccupationId == o.Id)?.Id,
                LoanDisposition = loans.FirstOrDefault(l => l.RoomOccupationId == o.Id)?.OwnerDisposition
            }));
        });

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
