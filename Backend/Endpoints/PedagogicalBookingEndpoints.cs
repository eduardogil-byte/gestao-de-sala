using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Contracts;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static async Task ApplyAssignmentNeeds(AppDbContext db, BookingRequest booking)
    {
        var assignments = await db.Assignments.AsNoTracking().Include(a => a.Software)
            .Where(a => a.TeacherId == booking.TeacherId && a.ClassGroupId == booking.ClassGroupId &&
                a.CurricularUnitId == booking.CurricularUnitId && a.EndedAtUtc == null).ToListAsync();
        if (assignments.Count == 0) return;
        booking.Students = await db.Classes.Where(c => c.Id == booking.ClassGroupId).Select(c => c.Students).SingleAsync();
        booking.NeedsProjector |= assignments.Any(a => a.NeedsProjector);
        booking.NeedsTeacherComputer |= assignments.Any(a => a.NeedsTeacherComputer);
        booking.NeedsStudentComputers |= assignments.Any(a => a.NeedsStudentComputers);
        booking.MinRamGb = Math.Max(booking.MinRamGb, assignments.Max(a => a.MinRamGb));
        booking.MinTier = (HardwareTier)Math.Max((int)booking.MinTier, assignments.Max(a => (int)a.MinTier));
        booking.NeedsDedicatedGpu |= assignments.Any(a => a.NeedsDedicatedGpu);
        foreach (var id in assignments.SelectMany(a => a.Software).Select(s => s.SoftwareId).Distinct())
            if (!booking.Software.Any(s => s.SoftwareId == id)) booking.Software.Add(new BookingSoftware { SoftwareId = id });
    }

    private static EnvironmentCompatibilityResponse BookingEnvironment(BookingRequest booking,
        CapabilityEnvironmentRequirement? requirement, Room room, DateOnly date,
        IReadOnlyList<CurricularUnitResourceRequirement> resources)
    {
        // Without a capability there is no type restriction; UC resources and assignment needs still apply.
        var effective = requirement ?? (booking.CurricularCapabilityId is null
            ? new CapabilityEnvironmentRequirement { RoomKind = room.Kind } : null);
        var result = EnvironmentCompatibility.Evaluate(effective, room, booking.Students, date, unitResources: resources);
        var mismatch = booking.CurricularCapabilityId is null
            ? RoomCompatibility.Incompatibility(room, Need(booking), date) : null;
        return mismatch is null ? result : result with { Classification = "Incompatible",
            Findings = result.Findings.Append(new RequirementFinding("assignment", "UnmetCritical", mismatch)).ToArray() };
    }

    private static void MapPedagogicalBookingOptions(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/bookings/pedagogical-options", async (string? teacherId, ClaimsPrincipal current, AppDbContext db) =>
        {
            if (current.IsInRole("Admin"))
            {
                if (string.IsNullOrWhiteSpace(teacherId)) return Results.Ok(Array.Empty<object>());
            }
            else if (teacherId is not null && teacherId != UserId(current)) return Results.Forbid();
            teacherId ??= UserId(current);
            var assignments = await db.Assignments.AsNoTracking()
                .Include(x => x.ClassGroup).Include(x => x.CurricularUnit)
                .Where(x => x.EndedAtUtc == null && x.CurricularUnitId != null &&
                    x.TeacherId == teacherId)
                .OrderBy(x => x.ClassGroup.Name).ThenBy(x => x.CurricularUnit!.Name).ToListAsync();
            var unitIds = assignments.Select(x => x.CurricularUnitId!.Value).Distinct().ToArray();
            var teacherIds = assignments.Select(x => x.TeacherId).Distinct().ToArray();
            var capabilities = await db.CurricularCapabilities.AsNoTracking()
                .Where(x => unitIds.Contains(x.CurricularUnitId)).OrderBy(x => x.Order).ToListAsync();
            var qualifications = await db.TeacherUnitQualifications.AsNoTracking()
                .Where(x => teacherIds.Contains(x.TeacherId) && unitIds.Contains(x.CurricularUnitId))
                .Select(x => new { x.TeacherId, x.CurricularUnitId }).ToListAsync();
            var qualified = qualifications.Select(x => (x.TeacherId, x.CurricularUnitId)).ToHashSet();
            return Results.Ok(assignments.Select(x => new
            {
                x.ClassGroupId, ClassName = x.ClassGroup.Name, x.ClassGroup.Students,
                x.CurricularUnitId, UnitName = x.CurricularUnit!.Name,
                x.Weekday, x.PreferredShiftId,
                QualificationWarning = !qualified.Contains((x.TeacherId, x.CurricularUnitId!.Value)),
                Capabilities = capabilities.Where(c => c.CurricularUnitId == x.CurricularUnitId)
                    .Select(c => new { c.Id, c.Description })
            }));
        }).RequireAuthorization(policy => policy.RequireRole("Admin", "Professor")).WithTags("Reservas por turno");
    }

    private static async Task<Dictionary<DateOnly, CalendarDateResult>> CalendarForBooking(
        AppDbContext db, BookingRequest booking)
    {
        var periods = BookingPeriods.Expand(booking);
        var dates = periods.Select(x => DateOnly.FromDateTime(x.Start)).ToArray();
        var classGroup = await db.Classes.AsNoTracking().Include(x => x.Semester)
            .SingleAsync(x => x.Id == booking.ClassGroupId);
        var from = dates.Min();
        var to = dates.Max();
        var events = await EventsFor(db, classGroup.SemesterId, from, to);
        var exceptions = await ExceptionsFor(db, classGroup.Id, from, to);
        var mask = dates.Aggregate(0, (value, day) => value | (1 << (int)day.DayOfWeek));
        var result = AcademicCalendarRules.Preview(classGroup.Semester, from, to, mask,
            classGroup, events, exceptions).Dates.ToDictionary(x => x.Date);
        if (booking.RecurringEadWeekday is int eadDay)
            foreach (var date in dates.Where(x => (int)x.DayOfWeek == eadDay && result[x].CountsAsPresential))
                result[date] = new CalendarDateResult(date, AcademicDayKind.Ead, false,
                    "Dia EAD informado na solicitação");
        return result;
    }

    private static async Task<bool> PedagogicalAssignmentValid(AppDbContext db,
        BookingRequest booking, int shiftId)
    {
        var days = BookingPeriods.Expand(booking).Select(p => (int)p.Start.DayOfWeek).Distinct().ToArray();
        var assigned = await db.Assignments.AsNoTracking()
            .Where(x => x.TeacherId == booking.TeacherId && x.ClassGroupId == booking.ClassGroupId &&
                x.CurricularUnitId == booking.CurricularUnitId &&
                (x.PreferredShiftId == shiftId || (booking.TurnExceptionConfirmed &&
                    booking.Recurrence == BookingRecurrence.Nenhuma)) &&
                x.EndedAtUtc == null && x.Weekday != null)
            .Select(x => x.Weekday!.Value).Distinct().ToListAsync();
        return days.All(assigned.Contains);
    }
}
