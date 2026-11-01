using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public static class RoomOpportunities
{
    public static async Task<IReadOnlyList<CapabilityOpportunity>?> Capabilities(AppDbContext db,
        int semesterId, int roomId, int students, int? courseId)
    {
        var semester = await db.Semesters.AsNoTracking().FirstOrDefaultAsync(x => x.Id == semesterId);
        if (semester is null) return null;
        var room = await RoomQuery(db).FirstOrDefaultAsync(x => x.Id == roomId);
        if (room is null) return null;
        var capabilities = await db.CurricularCapabilities.AsNoTracking().AsSplitQuery()
            .Include(x => x.CurricularUnit).ThenInclude(x => x.CourseModule).ThenInclude(x => x.Course)
            .Include(x => x.EnvironmentRequirement).ThenInclude(x => x!.Resources)
            .Include(x => x.EnvironmentRequirement).ThenInclude(x => x!.Software).ThenInclude(x => x.Software)
            .Where(x => courseId == null || x.CurricularUnit.CourseModule.CourseId == courseId)
            .OrderBy(x => x.Id).Take(201).ToListAsync();
        if (capabilities.Count > 200)
            throw new InvalidOperationException("Mais de 200 capacidades; filtre por curso");
        return capabilities.Select(capability =>
        {
            var result = EnvironmentCompatibility.Evaluate(capability.EnvironmentRequirement,
                room, students, semester.EndDate, oneComputerPerStudent: true);
            return new CapabilityOpportunity(capability.Id,
                capability.CurricularUnit.CourseModule.CourseId,
                capability.CurricularUnit.CourseModule.Course.Name,
                capability.CurricularUnit.Name, capability.Description, capability.RequiredHours,
                result.Classification, result.Findings);
        }).OrderBy(x => x.Classification switch
        { "Compatible" => 0, "Partial" => 1, _ => 2 })
            .ThenBy(x => x.CourseName).ThenBy(x => x.UnitName).ThenBy(x => x.CapabilityId)
            .ToArray();
    }

    public static async Task<OpportunityPeriods?> Periods(AppDbContext db, int semesterId,
        int roomId, int capabilityId, int shiftId, int students, DateOnly from, DateOnly to,
        int weekdaysMask, IndicatorThresholds thresholds)
    {
        var semester = await db.Semesters.AsNoTracking().FirstOrDefaultAsync(x => x.Id == semesterId);
        if (semester is null) return null;
        if (from < semester.StartDate || to > semester.EndDate)
            throw new ArgumentOutOfRangeException(nameof(from), "O período deve estar dentro do semestre");
        var room = await RoomQuery(db).FirstOrDefaultAsync(x => x.Id == roomId);
        var shift = await db.Shifts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == shiftId);
        var capability = await db.CurricularCapabilities.AsNoTracking().AsSplitQuery()
            .Include(x => x.EnvironmentRequirement).ThenInclude(x => x!.Resources)
            .Include(x => x.EnvironmentRequirement).ThenInclude(x => x!.Software).ThenInclude(x => x.Software)
            .FirstOrDefaultAsync(x => x.Id == capabilityId);
        if (room is null || shift is null || capability is null) return null;
        if (shift.EndsAt <= shift.StartsAt || capability.RequiredHours <= 0)
            throw new ArgumentOutOfRangeException(nameof(shiftId), "Turno ou carga horária inválida");
        var report = await OccupancyIndicators.ForSemester(db, semesterId, roomId, thresholds);
        var roomIndicator = report!.Rooms.Single();
        var offering = await db.RoomOperatingShifts.AsNoTracking().FirstOrDefaultAsync(x =>
            x.SemesterId == semesterId && x.RoomId == roomId && x.ShiftId == shiftId);
        var events = await db.AcademicCalendarEvents.AsNoTracking()
            .Where(x => x.SemesterId == semesterId && x.StartDate <= to && x.EndDate >= from)
            .OrderBy(x => x.StartDate).ToListAsync();
        var start = from.ToDateTime(TimeOnly.MinValue);
        var end = to.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var occupations = await OccupancyIndicators.EffectiveOccupations(db)
            .Where(x => x.RoomId == roomId && x.StartsAt < end && x.EndsAt > start &&
                x.EndsAt > x.StartsAt)
            .Select(x => new RoomOccupation { StartsAt = x.StartsAt, EndsAt = x.EndsAt })
            .Take(10001).ToListAsync();
        if (occupations.Count > 10000)
            throw new InvalidOperationException("Mais de 10000 ocupações; consulte um intervalo menor");
        return Analyze(semester, room, capability, shift, offering, roomIndicator, events,
            occupations, students, from, to, weekdaysMask);
    }

    public static OpportunityPeriods Analyze(Semester semester, Room room,
        CurricularCapability capability, SchoolShift shift, RoomOperatingShift? offering,
        RoomOccupancyIndicator indicator, IReadOnlyList<AcademicCalendarEvent> events,
        IReadOnlyList<RoomOccupation> occupations, int students, DateOnly from, DateOnly to,
        int weekdaysMask)
    {
        var compatibility = EnvironmentCompatibility.Evaluate(capability.EnvironmentRequirement,
            room, students, to, oneComputerPerStudent: true);
        var durationTicks = shift.EndsAt.Ticks - shift.StartsAt.Ticks;
        var duration = decimal.Round(durationTicks / (decimal)TimeSpan.TicksPerHour, 4);
        var estimated = Math.Ceiling(capability.RequiredHours * TimeSpan.TicksPerHour / durationTicks);
        if (estimated > int.MaxValue)
            throw new InvalidOperationException("Carga horária excede o limite de encontros calculáveis");
        var required = (int)estimated;
        var physical = decimal.Round(required * durationTicks / (decimal)TimeSpan.TicksPerHour, 4);
        var available = room.Active && indicator.CapacityHours is not null && offering is not null &&
            indicator.Shifts.Any(x => x.ShiftId == shift.Id && x.CapacityHours is not null);
        if (!available)
            return new OpportunityPeriods(semester.Id, room.Id, capability.Id, shift.Id,
                capability.RequiredHours, duration, required, physical, 0, 0,
                compatibility.Classification, "UnknownCapacity", compatibility.Findings, []);

        var calendar = AcademicCalendarRules.Preview(semester, from, to, weekdaysMask,
            null, events, []).Dates;
        var dates = new List<OpportunityDate>();
        foreach (var day in calendar)
        {
            if ((offering!.WeekdaysMask & (1 << (int)day.Date.DayOfWeek)) == 0)
            {
                dates.Add(new(day.Date, "NotOffered", "Turno não oferecido neste dia"));
                continue;
            }
            if (!day.CountsAsPresential)
            {
                dates.Add(new(day.Date, "NotEligible", day.Reason));
                continue;
            }
            var slotStart = day.Date.ToDateTime(shift.StartsAt);
            var slotEnd = day.Date.ToDateTime(shift.EndsAt);
            dates.Add(occupations.Any(x => x.StartsAt < slotEnd && x.EndsAt > slotStart)
                ? new(day.Date, "Occupied", "Ocupação efetiva registrada")
                : new(day.Date, "Potential", "Sem ocupação registrada; revalidar ao reservar"));
        }
        var free = dates.Count(x => x.Status == "Potential");
        return new OpportunityPeriods(semester.Id, room.Id, capability.Id, shift.Id,
            capability.RequiredHours, duration, required, physical, free,
            compatibility.Classification == "Compatible" ? free : 0,
            compatibility.Classification, "Known", compatibility.Findings, dates);
    }

    private static IQueryable<Room> RoomQuery(AppDbContext db) => db.Rooms.AsNoTracking()
        .AsSplitQuery().Include(x => x.Resources)
        .Include(x => x.ComputerGroups).ThenInclude(x => x.Software).ThenInclude(x => x.Software);
}
