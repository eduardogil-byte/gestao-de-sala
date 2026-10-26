using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public sealed class ScheduleGenerator(AppDbContext db)
{
    public async Task<(Schedule? Schedule, string? Error)> GenerateAsync(int semesterId)
    {
        var semester = await db.Semesters.FindAsync(semesterId);
        if (semester is null) return (null, "Semestre não encontrado");

        var assignments = await db.Assignments.Include(a => a.ClassGroup)
            .Include(a => a.Software).Where(a => a.ClassGroup.SemesterId == semesterId).ToListAsync();
        if (assignments.Count == 0) return (null, "Cadastre pelo menos uma disciplina atribuída a uma turma");
        var availability = await db.Availabilities.ToListAsync();
        var shifts = await db.Shifts.OrderBy(s => s.StartsAt).ToListAsync();
        var rooms = await db.Rooms.Include(r => r.ComputerGroups)
            .ThenInclude(g => g.Software).Where(r => r.Active).ToListAsync();
        var start = semester.StartDate.ToDateTime(TimeOnly.MinValue);
        var end = semester.EndDate.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var existing = await db.Occupations.Where(o => o.StartsAt < end && o.EndsAt > start).ToListAsync();
        var schedule = new Schedule { SemesterId = semesterId };

        // Primeiro alocar requisitos mais difíceis (laboratórios e programas especiais).
        foreach (var assignment in assignments.OrderByDescending(a => a.NeedsStudentComputers || a.Software.Count > 0)
                     .ThenByDescending(a => a.MinTier).ThenByDescending(a => a.Software.Count)
                     .ThenByDescending(a => a.ClassGroup.Students))
        {
            var softwareIds = assignment.Software.Select(x => x.SoftwareId).ToArray();
            var need = new RoomNeed(assignment.ClassGroup.Students, assignment.NeedsProjector,
                assignment.NeedsTeacherComputer, assignment.NeedsStudentComputers,
                assignment.MinTier, softwareIds, assignment.MinRamGb, assignment.NeedsDedicatedGpu);
            var teacherSlots = availability.Where(a => a.TeacherId == assignment.TeacherId
                && (assignment.PreferredShiftId is null || a.ShiftId == assignment.PreferredShiftId))
                .OrderBy(a => a.Weekday).ThenBy(a => a.ShiftId).ToList();
            var placed = new List<WeeklyClass>();

            for (var lesson = 0; lesson < assignment.MeetingsPerWeek; lesson++)
            {
                var possibilities = (from available in teacherSlots
                                     join shift in shifts on available.ShiftId equals shift.Id
                                     where !placed.Any(p => p.Weekday == available.Weekday)
                                     from room in rooms
                                     where RoomCompatibility.Incompatibility(room, need) is null
                                     orderby RoomCompatibility.Score(room, need) descending
                                     select new { available.Weekday, Shift = shift, Room = room }).ToList();
                WeeklyClass? choice = null;
                foreach (var option in possibilities)
                {
                    var collides = AllOccurrences(semester, option.Weekday, option.Shift).Any(range =>
                        existing.Any(o => Overlap(o.StartsAt, o.EndsAt, range.Start, range.End)
                            && (o.RoomId == option.Room.Id || o.TeacherId == assignment.TeacherId
                                || o.ClassGroupId == assignment.ClassGroupId))) ||
                        schedule.WeeklyClasses.Concat(placed).Any(w => w.Weekday == option.Weekday
                            && Intersects(w.Shift.StartsAt, w.Shift.EndsAt,
                                option.Shift.StartsAt, option.Shift.EndsAt)
                            && (w.RoomId == option.Room.Id || w.Assignment.TeacherId == assignment.TeacherId
                                || w.Assignment.ClassGroupId == assignment.ClassGroupId));
                    if (collides) continue;
                    choice = new WeeklyClass
                    {
                        Schedule = schedule,
                        AssignmentId = assignment.Id,
                        Assignment = assignment,
                        ShiftId = option.Shift.Id,
                        Shift = option.Shift,
                        RoomId = option.Room.Id,
                        Room = option.Room,
                        Weekday = option.Weekday
                    };
                    break;
                }
                if (choice is null) break;
                placed.Add(choice);
            }
            if (placed.Count == assignment.MeetingsPerWeek) schedule.WeeklyClasses.AddRange(placed);
            else schedule.UnallocatedMeetings += assignment.MeetingsPerWeek;
        }
        db.Schedules.Add(schedule);
        await db.SaveChangesAsync();
        return (schedule, null);
    }

    public static bool Overlap(DateTime start1, DateTime end1, DateTime start2, DateTime end2)
        => start1 < end2 && start2 < end1;

    public static bool Intersects(TimeOnly start1, TimeOnly end1, TimeOnly start2, TimeOnly end2)
        => start1 < end2 && start2 < end1;

    public static IEnumerable<(DateTime Start, DateTime End)> AllOccurrences(
        Semester semester, int weekday, SchoolShift shift)
    {
        for (var date = semester.StartDate; date <= semester.EndDate; date = date.AddDays(1))
        {
            if ((int)date.DayOfWeek != weekday) continue;
            yield return (date.ToDateTime(shift.StartsAt), date.ToDateTime(shift.EndsAt));
        }
    }
}
