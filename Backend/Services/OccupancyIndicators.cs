using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public static class OccupancyIndicators
{
    private sealed record Occupied(int Id, int RoomId, DateOnly Date, int From, int To, int? ShiftId);
    private sealed record Span(int From, int To);

    public static decimal UnionHours(IEnumerable<RoomOccupation> occupations) => Hours(
        occupations.GroupBy(o => DateOnly.FromDateTime(o.StartsAt)).Sum(g =>
            Union(g.Where(o => o.StartsAt < o.EndsAt && o.StartsAt.Date == o.EndsAt.Date)
                .Select(o => new Span(Seconds(TimeOnly.FromDateTime(o.StartsAt)),
                    Seconds(TimeOnly.FromDateTime(o.EndsAt))))).Sum(s => (long)s.To - s.From)));

    public static async Task<SemesterOccupancyIndicators?> ForSemester(AppDbContext db,
        int semesterId, int? roomId, IndicatorThresholds thresholds)
    {
        var semester = await db.Semesters.AsNoTracking().FirstOrDefaultAsync(s => s.Id == semesterId);
        if (semester is null) return null;
        var rooms = await db.Rooms.AsNoTracking().Where(r => roomId == null || r.Id == roomId)
            .OrderBy(r => r.Name).ToListAsync();
        if (roomId is not null && rooms.Count == 0) return null;
        var shifts = await db.Shifts.AsNoTracking().OrderBy(s => s.StartsAt).ToListAsync();
        var offerings = await db.RoomOperatingShifts.AsNoTracking()
            .Where(x => x.SemesterId == semesterId && (roomId == null || x.RoomId == roomId)).ToListAsync();
        var events = await db.AcademicCalendarEvents.AsNoTracking()
            .Where(e => e.SemesterId == semesterId && e.StartDate <= semester.EndDate &&
                e.EndDate >= semester.StartDate).ToListAsync();
        var start = semester.StartDate.ToDateTime(TimeOnly.MinValue);
        var end = semester.EndDate.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var rows = await db.Occupations.AsNoTracking()
            .Where(o => o.CancelledAtUtc == null && o.StartsAt >= start && o.StartsAt < end &&
                o.EndsAt > o.StartsAt &&
                (roomId == null || o.RoomId == roomId) &&
                (o.BookingRequestId == null || db.Bookings.Any(b => b.Id == o.BookingRequestId &&
                    b.Status == BookingStatus.Aprovada)) &&
                (o.WeeklyClassId == null || db.WeeklyClasses.Any(w => w.Id == o.WeeklyClassId &&
                    w.Schedule.Status == ScheduleStatus.Publicada)) &&
                (o.PlanProposalId == null || db.PlanProposals.Any(p => p.Id == o.PlanProposalId &&
                    p.Status == PlanProposalStatus.Publicada)))
            .Select(o => new { o.Id, o.RoomId, o.StartsAt, o.EndsAt })
            .Take(100001).ToListAsync();
        if (rows.Count > 100000)
            throw new InvalidOperationException("O semestre contém mais de 100000 ocupações; consulte um ambiente por vez");

        var occupied = rows.Select(o =>
        {
            var matching = shifts.Where(s => s.StartsAt == TimeOnly.FromDateTime(o.StartsAt) &&
                s.EndsAt == TimeOnly.FromDateTime(o.EndsAt) &&
                DateOnly.FromDateTime(o.StartsAt) == DateOnly.FromDateTime(o.EndsAt)).ToArray();
            return new Occupied(o.Id, o.RoomId, DateOnly.FromDateTime(o.StartsAt),
                Seconds(TimeOnly.FromDateTime(o.StartsAt)), Seconds(TimeOnly.FromDateTime(o.EndsAt)),
                matching.Length == 1 ? matching[0].Id : null);
        }).ToList();
        var roomResults = new List<RoomOccupancyIndicator>();
        var monthMinutes = new Dictionary<(int Year, int Month), long>();
        var monthDays = new Dictionary<(int Year, int Month), HashSet<DateOnly>>();
        foreach (var room in rooms)
        {
            var uses = occupied.Where(o => o.RoomId == room.Id).ToList();
            var valid = uses.Where(o => o.ShiftId is not null && o.From < o.To).ToList();
            var byDate = valid.GroupBy(o => o.Date).ToDictionary(g => g.Key,
                g => Union(g.Select(o => new Span(o.From, o.To))));
            var physicalMinutes = byDate.Values.Sum(spans => spans.Sum(s => (long)s.To - s.From));
            foreach (var (date, spans) in byDate)
            {
                var key = (date.Year, date.Month);
                monthMinutes[key] = monthMinutes.GetValueOrDefault(key) + spans.Sum(s => (long)s.To - s.From);
            }
            foreach (var date in uses.Select(o => o.Date).Distinct())
            {
                var key = (date.Year, date.Month);
                if (!monthDays.TryGetValue(key, out var days)) monthDays[key] = days = new();
                days.Add(date);
            }
            var roomOfferings = offerings.Where(o => o.RoomId == room.Id).ToArray();
            var warning = new List<string>();
            if (roomOfferings.Length == 0) warning.Add("Turnos oferecidos pelo ambiente não configurados");
            if (!room.Active) warning.Add("Ambiente inativo; capacidade histórica não comprovada");
            var unclassified = uses.Count - valid.Count;
            if (unclassified > 0) warning.Add($"{unclassified} ocupação(ões) sem turno cadastrado único ou intervalo válido; horas não somadas");
            var invalidConfiguration = roomOfferings.Any(o => o.WeekdaysMask is < 1 or > 127 ||
                shifts.All(s => s.Id != o.ShiftId || s.EndsAt <= s.StartsAt)) ||
                roomOfferings.Any(a => roomOfferings.Any(b => a.ShiftId < b.ShiftId &&
                    (a.WeekdaysMask & b.WeekdaysMask) != 0 &&
                    shifts.Any(sa => sa.Id == a.ShiftId && shifts.Any(sb => sb.Id == b.ShiftId &&
                        sa.StartsAt < sb.EndsAt && sb.StartsAt < sa.EndsAt))));
            if (invalidConfiguration) warning.Add("Turnos oferecidos com duração inválida ou sobreposição");
            var known = room.Active && roomOfferings.Length > 0 && !invalidConfiguration;
            var capacityMinutes = 0;
            var withinMinutes = 0;
            var capacitySlots = 0;
            var occupiedCapacitySlots = 0;
            var shiftResults = new List<ShiftOccupancyIndicator>();
            foreach (var shift in shifts)
            {
                var shiftUses = valid.Where(o => o.ShiftId == shift.Id).ToList();
                var shiftMinutes = shiftUses.GroupBy(o => o.Date).Sum(g =>
                    Union(g.Select(o => new Span(o.From, o.To))).Sum(s => (long)s.To - s.From));
                var offering = roomOfferings.FirstOrDefault(o => o.ShiftId == shift.Id);
                var shiftKnown = known && offering is not null;
                var shiftCapacity = 0;
                var shiftWithin = 0;
                var shiftSlots = 0;
                var shiftOccupiedSlots = 0;
                if (shiftKnown)
                {
                    for (var date = semester.StartDate; date <= semester.EndDate; date = date.AddDays(1))
                    {
                        if (!Eligible(date, offering!.WeekdaysMask, events)) continue;
                        var slot = new Span(Seconds(shift.StartsAt), Seconds(shift.EndsAt));
                        shiftCapacity += slot.To - slot.From;
                        shiftSlots++;
                        var overlap = IntersectMinutes(byDate.GetValueOrDefault(date) ?? [], slot);
                        shiftWithin += overlap;
                        if (overlap > 0) shiftOccupiedSlots++;
                    }
                    capacityMinutes += shiftCapacity;
                    withinMinutes += shiftWithin;
                    capacitySlots += shiftSlots;
                    occupiedCapacitySlots += shiftOccupiedSlots;
                }
                if (offering is null && shiftUses.Count == 0) continue;
                var shiftWarnings = offering is null ? new[] { "Turno não configurado para este ambiente" } :
                    shiftKnown ? Array.Empty<string>() : new[] { "Capacidade do turno não comprovada" };
                decimal? shiftPercent = shiftKnown && shiftCapacity > 0 ? Percent(shiftWithin, shiftCapacity) : null;
                shiftResults.Add(new ShiftOccupancyIndicator(shift.Id, shift.Name, Hours(shiftMinutes),
                    shiftKnown ? Hours(shiftCapacity) : null,
                    shiftKnown ? Hours(shiftCapacity - shiftWithin) : null, shiftPercent,
                    shiftUses.Select(o => (o.Date, o.ShiftId)).Distinct().Count(),
                    shiftKnown ? shiftSlots - shiftOccupiedSlots : null,
                    Classification(shiftPercent, thresholds), shiftWarnings));
            }
            var conflictPairs = uses.GroupBy(o => o.Date).Sum(g =>
            {
                var list = g.OrderBy(o => o.From).ToArray();
                var count = 0;
                for (var i = 0; i < list.Length; i++)
                    for (var j = i + 1; j < list.Length && list[j].From < list[i].To; j++)
                        if (list[i].From < list[j].To) count++;
                return count;
            });
            if (conflictPairs > 0) warning.Add($"{conflictPairs} par(es) de ocupações sobrepostas");
            if (known && physicalMinutes > withinMinutes)
                warning.Add("Há ocupação física fora dos dias ou turnos elegíveis; ela não entra no percentual");
            decimal? percent = known && capacityMinutes > 0 ? Percent(withinMinutes, capacityMinutes) : null;
            roomResults.Add(new RoomOccupancyIndicator(room.Id, room.Name, room.Kind,
                Hours(physicalMinutes), known ? Hours(capacityMinutes) : null,
                known ? Hours(withinMinutes) : null,
                known ? Hours(capacityMinutes - withinMinutes) : null, percent,
                known ? Hours(physicalMinutes - withinMinutes) : null,
                uses.Select(o => o.Date).Distinct().Count(),
                valid.Select(o => (o.Date, o.ShiftId)).Distinct().Count(),
                known ? capacitySlots - occupiedCapacitySlots : null,
                conflictPairs, unclassified, Classification(percent, thresholds), warning, shiftResults));
        }
        var unknownRooms = roomResults.Count(r => r.CapacityHours is null);
        var totalKnown = unknownRooms == 0 && roomResults.Count > 0;
        var totalCapacity = roomResults.Sum(r => r.CapacityHours ?? 0);
        var totalWithin = roomResults.Sum(r => r.OccupiedWithinCapacityHours ?? 0);
        decimal? totalPercent = totalKnown && totalCapacity > 0 ?
            decimal.Round(totalWithin / totalCapacity * 100, 2) : null;
        var months = new List<MonthOccupancyIndicator>();
        for (var month = new DateOnly(semester.StartDate.Year, semester.StartDate.Month, 1);
            month <= semester.EndDate; month = month.AddMonths(1))
        {
            var key = (month.Year, month.Month);
            months.Add(new MonthOccupancyIndicator(key.Year, key.Month,
                Hours(monthMinutes.GetValueOrDefault(key)), monthDays.GetValueOrDefault(key)?.Count ?? 0));
        }
        var reportWarnings = unknownRooms > 0 ? new[]
            { $"{unknownRooms} ambiente(s) sem capacidade comprovada; percentual geral indisponível" } : [];
        return new SemesterOccupancyIndicators(semester.Id, semester.StartDate, semester.EndDate,
            thresholds, roomResults.Sum(r => r.PhysicalOccupiedHours),
            totalKnown ? totalCapacity : null, totalKnown ? totalWithin : null,
            totalKnown ? totalCapacity - totalWithin : null, totalPercent,
            totalKnown ? roomResults.Sum(r => r.OutsideCapacityHours ?? 0) : null,
            monthDays.Values.SelectMany(d => d).Distinct().Count(),
            roomResults.Sum(r => r.OccupiedSlots),
            totalKnown ? roomResults.Sum(r => r.UnoccupiedSlots ?? 0) : null,
            unknownRooms, roomResults.Sum(r => r.ConflictPairs),
            Classification(totalPercent, thresholds), roomResults, months, reportWarnings);
    }

    private static bool Eligible(DateOnly date, int mask, List<AcademicCalendarEvent> events) =>
        (mask & (1 << (int)date.DayOfWeek)) != 0 &&
        !events.Any(e => e.StartDate <= date && date <= e.EndDate &&
            e.Kind != AcademicDayKind.Presential);

    private static int Seconds(TimeOnly time) => time.Hour * 3600 + time.Minute * 60 + time.Second;
    private static decimal Hours(long seconds) => decimal.Round(seconds / 3600m, 4);
    private static decimal Percent(int used, int capacity) => decimal.Round(used * 100m / capacity, 2);
    private static string Classification(decimal? percent, IndicatorThresholds thresholds) => percent is null
        ? "Unknown" : percent >= thresholds.BottleneckPercent ? "Bottleneck" :
            percent < thresholds.OpportunityPercent ? "Opportunity" : "Intermediate";

    private static List<Span> Union(IEnumerable<Span> source)
    {
        var result = new List<Span>();
        foreach (var span in source.OrderBy(s => s.From).ThenBy(s => s.To))
        {
            if (result.Count == 0 || span.From > result[^1].To) result.Add(span);
            else result[^1] = new Span(result[^1].From, Math.Max(result[^1].To, span.To));
        }
        return result;
    }

    private static int IntersectMinutes(IEnumerable<Span> spans, Span slot) => spans.Sum(s =>
        Math.Max(0, Math.Min(s.To, slot.To) - Math.Max(s.From, slot.From)));
}
