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
    private static void MapAcademicCalendar(IEndpointRouteBuilder app)
    {
        var semesters = app.MapGroup("/api/semesters/{semesterId:int}/calendar")
            .RequireAuthorization().WithTags("Calendário letivo");
        semesters.MapGet("", async (int semesterId, ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!await CanReadSemesterCalendar(db, current, semesterId)) return Results.Forbid();
            var semester = await db.Semesters.FindAsync(semesterId);
            if (semester is null) return Results.NotFound();
            var events = await db.AcademicCalendarEvents.AsNoTracking()
                .Where(x => x.SemesterId == semesterId).OrderBy(x => x.StartDate).ThenBy(x => x.Id)
                .Select(x => new AcademicCalendarEventResponse(x.Id, x.SemesterId, x.StartDate,
                    x.EndDate, x.Kind, x.Description)).ToListAsync();
            return Results.Ok(new { semester.Id, semester.StartDate, semester.EndDate, Events = events });
        });

        semesters.MapGet("/events/{eventId:int}", async (int semesterId, int eventId,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!await CanReadSemesterCalendar(db, current, semesterId)) return Results.Forbid();
            var item = await db.AcademicCalendarEvents.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == eventId && x.SemesterId == semesterId);
            return item is null ? Results.NotFound() : Results.Ok(EventView(item));
        });

        semesters.MapPost("/events", async (int semesterId, AcademicCalendarEventInput input,
            AppDbContext db) =>
        {
            var semester = await db.Semesters.FindAsync(semesterId);
            if (semester is null) return Results.NotFound();
            var error = ValidateEvent(input, semester);
            if (error is not null) return Error(error);
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            if (await db.AcademicCalendarEvents.AnyAsync(x => x.SemesterId == semesterId &&
                x.StartDate <= input.EndDate && x.EndDate >= input.StartDate))
                return CatalogConflict("O período já possui uma ocorrência institucional");
            var item = new AcademicCalendarEvent { SemesterId = semesterId,
                StartDate = input.StartDate, EndDate = input.EndDate,
                Kind = input.Kind, Description = input.Description!.Trim() };
            db.AcademicCalendarEvents.Add(item);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("O período já possui uma ocorrência institucional"); }
            await tx.CommitAsync();
            return Results.Created($"/api/semesters/{semesterId}/calendar/events/{item.Id}",
                EventView(item));
        }).RequireAuthorization("Admin");

        semesters.MapPut("/events/{eventId:int}", async (int semesterId, int eventId,
            AcademicCalendarEventInput input, AppDbContext db) =>
        {
            var semester = await db.Semesters.FindAsync(semesterId);
            if (semester is null) return Results.NotFound();
            var item = await db.AcademicCalendarEvents.FirstOrDefaultAsync(x => x.Id == eventId &&
                x.SemesterId == semesterId);
            if (item is null) return Results.NotFound();
            var error = ValidateEvent(input, semester);
            if (error is not null) return Error(error);
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            if (await db.AcademicCalendarEvents.AnyAsync(x => x.SemesterId == semesterId &&
                x.Id != eventId && x.StartDate <= input.EndDate && x.EndDate >= input.StartDate))
                return CatalogConflict("O período já possui uma ocorrência institucional");
            item.StartDate = input.StartDate; item.EndDate = input.EndDate;
            item.Kind = input.Kind; item.Description = input.Description!.Trim();
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("O período já possui uma ocorrência institucional"); }
            await tx.CommitAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        var classes = app.MapGroup("/api/classes/{classGroupId:int}/calendar")
            .RequireAuthorization().WithTags("Calendário letivo");
        classes.MapGet("", async (int classGroupId, DateOnly? from, DateOnly? to,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!await CanReadClassCalendar(db, current, classGroupId)) return Results.Forbid();
            var classGroup = await db.Classes.AsNoTracking().Include(x => x.Semester)
                .FirstOrDefaultAsync(x => x.Id == classGroupId);
            if (classGroup is null) return Results.NotFound();
            var first = from ?? classGroup.Semester.StartDate;
            var last = to ?? classGroup.Semester.EndDate;
            if (!ValidPreviewRange(first, last)) return Error("Intervalo inválido ou maior que 370 dias");
            var events = await EventsFor(db, classGroup.SemesterId, first, last);
            var exceptions = await ExceptionsFor(db, classGroupId, first, last);
            var assignmentDays = await db.Assignments.AsNoTracking()
                .Where(a => a.ClassGroupId == classGroupId && a.EndedAtUtc == null && a.Weekday != null)
                .Select(a => a.Weekday!.Value).Distinct().ToListAsync();
            var publishedDays = await db.WeeklyClasses.AsNoTracking()
                .Where(w => w.Assignment.ClassGroupId == classGroupId &&
                    w.Schedule.Status == ScheduleStatus.Publicada)
                .Select(w => w.Weekday).Distinct().ToListAsync();
            var weekdaysMask = assignmentDays.Concat(publishedDays)
                .Where(day => day is >= 0 and <= 6)
                .Aggregate(0, (mask, day) => mask | (1 << day));
            if (classGroup.EadWeekday is int eadDay) weekdaysMask |= 1 << eadDay;
            var preview = AcademicCalendarRules.Preview(classGroup.Semester, first, last,
                weekdaysMask, classGroup, events, exceptions);
            return Results.Ok(new { classGroup.Id, classGroup.SemesterId,
                EadPattern = new ClassEadPatternInput(classGroup.EadWeekday,
                    classGroup.EadStartDate, classGroup.EadEndDate),
                Exceptions = exceptions.Select(ExceptionView), Preview = preview });
        });

        classes.MapPut("/ead-pattern", async (int classGroupId, ClassEadPatternInput input,
            AppDbContext db) =>
        {
            var classGroup = await db.Classes.Include(x => x.Semester)
                .FirstOrDefaultAsync(x => x.Id == classGroupId);
            if (classGroup is null) return Results.NotFound();
            var clear = input.Weekday is null && input.StartDate is null && input.EndDate is null;
            if (!clear && (input.Weekday is null or < 1 or > 5 || input.StartDate is null ||
                input.EndDate is null || input.StartDate > input.EndDate ||
                input.StartDate < classGroup.Semester.StartDate ||
                input.EndDate > classGroup.Semester.EndDate))
                return Error("Informe dia de segunda a sexta e período dentro do semestre, ou limpe os três campos");
            classGroup.EadWeekday = input.Weekday;
            classGroup.EadStartDate = input.StartDate;
            classGroup.EadEndDate = input.EndDate;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        classes.MapPut("/exceptions/{date}", async (int classGroupId, DateOnly date,
            ClassCalendarExceptionInput input, ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!await CanManageClassDate(db, current, classGroupId, date)) return Results.Forbid();
            var classGroup = await db.Classes.Include(x => x.Semester)
                .FirstOrDefaultAsync(x => x.Id == classGroupId);
            if (classGroup is null) return Results.NotFound();
            if (date < classGroup.Semester.StartDate || date > classGroup.Semester.EndDate)
                return Error("Data fora do semestre da turma");
            if (input.Kind is not (AcademicDayKind.Presential or AcademicDayKind.Ead or
                AcademicDayKind.NonTeaching) || !ValidDescription(input.Description))
                return Error("Tipo ou descrição da exceção inválidos");
            if (input.Kind == AcademicDayKind.Presential &&
                await db.AcademicCalendarEvents.AnyAsync(x => x.SemesterId == classGroup.SemesterId &&
                    x.StartDate <= date && x.EndDate >= date &&
                    (x.Kind == AcademicDayKind.Holiday || x.Kind == AcademicDayKind.Recess ||
                     x.Kind == AcademicDayKind.Planning || x.Kind == AcademicDayKind.NonTeaching)))
                return CatalogConflict("Exceção da turma não pode tornar presencial um dia institucional sem aula");
            var item = await db.ClassCalendarExceptions.FindAsync(classGroupId, date);
            if (item is null)
            {
                item = new ClassCalendarException { ClassGroupId = classGroupId, Date = date };
                db.ClassCalendarExceptions.Add(item);
            }
            item.Kind = input.Kind; item.Description = input.Description!.Trim();
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Exceção já cadastrada nesta data"); }
            return Results.Ok(new { Item = ExceptionView(item), RoomReservationsUnchanged = true });
        });

        app.MapGet("/api/academic-calendar/preview", async (int semesterId, DateOnly from,
            DateOnly to, int weekdaysMask, int? classGroupId, int? requiredMeetings,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!ValidPreviewRange(from, to) || weekdaysMask is < 1 or > 127 ||
                requiredMeetings is < 0 or > 10000)
                return Error("Intervalo, dias da semana ou quantidade de encontros inválidos");
            if (classGroupId is int classId)
            {
                if (!await CanReadClassCalendar(db, current, classId)) return Results.Forbid();
            }
            else if (!await CanReadSemesterCalendar(db, current, semesterId)) return Results.Forbid();
            var semester = await db.Semesters.AsNoTracking().FirstOrDefaultAsync(x => x.Id == semesterId);
            if (semester is null) return Results.NotFound();
            ClassGroup? classGroup = null;
            if (classGroupId is int id)
            {
                classGroup = await db.Classes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id &&
                    x.SemesterId == semesterId);
                if (classGroup is null) return Results.NotFound();
            }
            var events = await EventsFor(db, semesterId, from, to);
            var exceptions = classGroup is null ? [] : await ExceptionsFor(db, classGroup.Id, from, to);
            return Results.Ok(AcademicCalendarRules.Preview(semester, from, to, weekdaysMask,
                classGroup, events, exceptions, requiredMeetings));
        }).RequireAuthorization().WithTags("Calendário letivo");
    }

    private static async Task<bool> CanReadSemesterCalendar(AppDbContext db,
        ClaimsPrincipal current, int semesterId) => current.IsInRole("Admin") ||
        (current.IsInRole("Professor") && await db.Assignments.AnyAsync(a =>
            a.TeacherId == UserId(current) && a.EndedAtUtc == null &&
            a.ClassGroup.SemesterId == semesterId));

    private static async Task<bool> CanReadClassCalendar(AppDbContext db,
        ClaimsPrincipal current, int classGroupId) => current.IsInRole("Admin") ||
        (current.IsInRole("Professor") && await db.Assignments.AnyAsync(a =>
            a.TeacherId == UserId(current) && a.EndedAtUtc == null &&
            a.ClassGroupId == classGroupId));

    private static async Task<bool> CanManageClassDate(AppDbContext db,
        ClaimsPrincipal current, int classGroupId, DateOnly date)
    {
        if (current.IsInRole("Admin")) return true;
        if (!current.IsInRole("Professor")) return false;
        var teacherId = UserId(current);
        var weekday = (int)date.DayOfWeek;
        return await db.Assignments.AnyAsync(a => a.TeacherId == teacherId &&
            a.ClassGroupId == classGroupId && a.EndedAtUtc == null && a.Weekday == weekday) &&
            !await db.Assignments.AnyAsync(a => a.TeacherId != teacherId &&
                a.ClassGroupId == classGroupId && a.EndedAtUtc == null && a.Weekday == weekday);
    }

    private static string? ValidateEvent(AcademicCalendarEventInput input, Semester semester)
    {
        if (!Enum.IsDefined(input.Kind) || !ValidDescription(input.Description) ||
            input.StartDate > input.EndDate || input.StartDate < semester.StartDate ||
            input.EndDate > semester.EndDate)
            return "Tipo, descrição ou período da ocorrência inválidos para o semestre";
        return null;
    }

    private static bool ValidDescription(string? description) =>
        !string.IsNullOrWhiteSpace(description) && description.Trim().Length <= 250;

    private static bool ValidPreviewRange(DateOnly from, DateOnly to) =>
        from <= to && to.DayNumber - from.DayNumber <= 370;

    private static async Task<List<AcademicCalendarEvent>> EventsFor(AppDbContext db,
        int semesterId, DateOnly from, DateOnly to) =>
        await db.AcademicCalendarEvents.AsNoTracking()
            .Where(x => x.SemesterId == semesterId && x.StartDate <= to && x.EndDate >= from)
            .OrderBy(x => x.StartDate).ToListAsync();

    private static async Task<List<ClassCalendarException>> ExceptionsFor(AppDbContext db,
        int classGroupId, DateOnly from, DateOnly to) =>
        await db.ClassCalendarExceptions.AsNoTracking()
            .Where(x => x.ClassGroupId == classGroupId && x.Date >= from && x.Date <= to)
            .OrderBy(x => x.Date).ToListAsync();

    private static AcademicCalendarEventResponse EventView(AcademicCalendarEvent x) =>
        new(x.Id, x.SemesterId, x.StartDate, x.EndDate, x.Kind, x.Description);

    private static ClassCalendarExceptionResponse ExceptionView(ClassCalendarException x) =>
        new(x.ClassGroupId, x.Date, x.Kind, x.Description);
}
