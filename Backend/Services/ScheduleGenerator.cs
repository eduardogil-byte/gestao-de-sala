using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
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
            .Include(a => a.Software).Where(a => a.ClassGroup.SemesterId == semesterId &&
                a.EndedAtUtc == null && (a.CurricularUnitId == null || a.ClassGroup.CourseModuleId == null ||
                    a.CurricularUnit!.CourseModuleId == a.ClassGroup.CourseModuleId)).ToListAsync();
        var offerings = await db.ClassUnitOfferings.Include(x => x.ClassGroup)
            .Include(x => x.CurricularUnit).ThenInclude(x => x.ResourceRequirements)
            .ThenInclude(x => x.ResourceCatalogItem)
            .Include(x => x.CurricularUnit).ThenInclude(x => x.CourseModule)
            .Where(x => x.ClassGroup.SemesterId == semesterId &&
                x.CurricularUnit.CourseModuleId == x.ClassGroup.CourseModuleId).ToListAsync();
        if (assignments.Count == 0 && offerings.Count == 0)
            return (null, "Cadastre pelo menos uma disciplina atribuída a uma turma");
        var availability = await db.Availabilities.ToListAsync();
        var shifts = await db.Shifts.OrderBy(s => s.StartsAt).ToListAsync();
        var rooms = await db.Rooms.Include(r => r.Resources).Include(r => r.ComputerGroups)
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
                && (assignment.PreferredShiftId is null || a.ShiftId == assignment.PreferredShiftId)
                && (assignment.Weekday is null || a.Weekday == assignment.Weekday))
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
        if (offerings.Count > 0)
            await GenerateOfferedUnits(semester, schedule, offerings, availability, shifts, rooms);
        db.Schedules.Add(schedule);
        await db.SaveChangesAsync();
        return (schedule, null);
    }

    private async Task GenerateOfferedUnits(Semester semester, Schedule schedule,
        List<ClassUnitOffering> offerings, List<TeacherAvailability> availability,
        List<SchoolShift> shifts, List<Room> rooms)
    {
        var events = await db.AcademicCalendarEvents.AsNoTracking()
            .Where(x => x.SemesterId == semester.Id).OrderBy(x => x.StartDate).ToListAsync();
        var classIds = offerings.Select(x => x.ClassGroupId).Distinct().ToArray();
        var exceptions = await db.ClassCalendarExceptions.AsNoTracking()
            .Where(x => classIds.Contains(x.ClassGroupId)).ToListAsync();
        var qualifiedCourses = (await db.TeacherCourseQualifications.AsNoTracking()
            .Select(x => new { x.TeacherId, x.CourseId }).ToListAsync())
            .Select(x => (x.TeacherId, x.CourseId)).ToHashSet();
        var qualifiedUnits = (await db.TeacherUnitQualifications.AsNoTracking()
            .Select(x => new { x.TeacherId, x.CurricularUnitId }).ToListAsync())
            .Select(x => (x.TeacherId, x.CurricularUnitId)).ToHashSet();
        var teacherRoleIds = await db.Roles.AsNoTracking().Where(x => x.Name == "Professor")
            .Select(x => x.Id).ToListAsync();
        var teacherIds = (await db.UserRoles.AsNoTracking().Where(x => teacherRoleIds.Contains(x.RoleId))
            .Select(x => x.UserId).ToListAsync()).ToHashSet();
        var oldAssignmentOffers = (await db.Assignments.AsNoTracking()
            .Where(x => classIds.Contains(x.ClassGroupId) && x.CurricularUnitId != null && x.EndedAtUtc == null)
            .Select(x => new { x.ClassGroupId, x.CurricularUnitId }).ToListAsync())
            .Select(x => (x.ClassGroupId, x.CurricularUnitId!.Value)).ToHashSet();
        var calendar = new Dictionary<int, Dictionary<DateOnly, CalendarDateResult>>();
        foreach (var cls in offerings.Select(x => x.ClassGroup).DistinctBy(x => x.Id))
            calendar[cls.Id] = AcademicCalendarRules.Preview(semester, semester.StartDate,
                semester.EndDate, 127, cls, events, exceptions.Where(x => x.ClassGroupId == cls.Id).ToList())
                .Dates.ToDictionary(x => x.Date);
        var plans = offerings.OrderBy(x => x.ClassGroupId).ThenBy(x => x.CurricularUnitId)
            .Select(x => new ScheduleUnitPlan { Schedule = schedule, Offering = x,
                ClassGroupId = x.ClassGroupId, CurricularUnitId = x.CurricularUnitId,
                TeacherId = x.TeacherId, PlannedHours = x.CurricularUnit.PlannedHours }).ToList();
        schedule.UnitPlans.AddRange(plans);
        var byKey = offerings.ToDictionary(x => (x.ClassGroupId, x.CurricularUnitId));
        var compatibleButOccupied = new HashSet<(int ClassId, int UnitId)>();
        var slotObstacles = new Dictionary<(int ClassId, int UnitId), HashSet<string>>();
        void Note(ScheduleUnitPlan plan, string reason)
        {
            var key = (plan.ClassGroupId, plan.CurricularUnitId);
            if (!slotObstacles.TryGetValue(key, out var reasons))
                slotObstacles[key] = reasons = new HashSet<string>();
            reasons.Add(reason);
        }
        var slotReservations = new List<(DateOnly Date, SchoolShift Shift, string TeacherId, int ClassId, int? RoomId)>();
        foreach (var plan in plans)
        {
            var offer = byKey[(plan.ClassGroupId, plan.CurricularUnitId)];
            if (plan.PlannedHours is not > 0) { plan.PendingReason = "Carga horária da UC não informada"; continue; }
            if (string.IsNullOrWhiteSpace(plan.TeacherId)) { plan.PendingReason = "Instrutor responsável não atribuído"; continue; }
            if (oldAssignmentOffers.Contains((plan.ClassGroupId, plan.CurricularUnitId)))
            { plan.PendingReason = "Atribuição pedagógica anterior ativa para esta UC; revise antes de gerar a nova oferta"; continue; }
            if (offer.ClassGroup.CourseId is not int courseId ||
                offer.ClassGroup.CourseModuleId != offer.CurricularUnit.CourseModuleId ||
                offer.CurricularUnit.CourseModule.CourseId != courseId)
            { plan.PendingReason = "UC não pertence ao curso e módulo da turma"; continue; }
            if (!teacherIds.Contains(plan.TeacherId) ||
                !qualifiedCourses.Contains((plan.TeacherId, courseId)) ||
                !qualifiedUnits.Contains((plan.TeacherId, plan.CurricularUnitId)))
            { plan.PendingReason = "Instrutor sem habilitação vigente para curso e UC"; continue; }
            if (offer.DeliveryMode == UnitDeliveryMode.Ead && offer.EadScheduleMode == EadScheduleMode.SemHorarioFixo)
            {
                plan.Meetings.Add(new ScheduleUnitMeeting { Plan = plan, PlannedHours = plan.PlannedHours.Value });
                plan.AllocatedHours = plan.PlannedHours.Value;
            }
        }
        // Percorre o calendário antes das UCs para permitir alternância entre elas ao longo da semana.
        for (var date = semester.StartDate; date <= semester.EndDate; date = date.AddDays(1))
        {
            foreach (var shift in shifts.Where(x => x.PedagogicalHours is > 0))
            {
                foreach (var plan in plans.Where(x => x.PendingReason is null && x.AllocatedHours < x.PlannedHours &&
                    !(byKey[(x.ClassGroupId, x.CurricularUnitId)].DeliveryMode == UnitDeliveryMode.Ead &&
                      byKey[(x.ClassGroupId, x.CurricularUnitId)].EadScheduleMode == EadScheduleMode.SemHorarioFixo))
                    .OrderBy(x => x.AllocatedHours == 0 ? 0 : x.AllocatedHours / x.PlannedHours!.Value)
                    .ThenBy(x => x.ClassGroupId).ThenBy(x => x.CurricularUnitId))
                {
                    var offer = byKey[(plan.ClassGroupId, plan.CurricularUnitId)];
                    var cls = offer.ClassGroup;
                    if (cls.ShiftId != shift.Id || !availability.Any(x => x.TeacherId == plan.TeacherId &&
                        x.Weekday == (int)date.DayOfWeek && x.ShiftId == shift.Id)) continue;
                    var day = calendar[cls.Id][date];
                    if (offer.DeliveryMode == UnitDeliveryMode.Presencial ? !day.CountsAsPresential :
                        day.Kind is AcademicDayKind.Holiday or AcademicDayKind.Recess or AcademicDayKind.Planning or AcademicDayKind.NonTeaching)
                        continue;
                    var start = date.ToDateTime(shift.StartsAt);
                    var end = date.ToDateTime(shift.EndsAt);
                    var bookedSlots = slotReservations.Where(x => x.Date == date &&
                        Intersects(x.Shift.StartsAt, x.Shift.EndsAt,
                            shift.StartsAt, shift.EndsAt)).ToList();
                    if (bookedSlots.Any(x => x.TeacherId == plan.TeacherId))
                    { Note(plan, "Instrutor já programado neste turno"); continue; }
                    if (bookedSlots.Any(x => x.ClassId == cls.Id))
                    { Note(plan, "Turma já programada neste turno"); continue; }
                    if (schedule.WeeklyClasses.Any(x => x.Weekday == (int)date.DayOfWeek &&
                        Intersects(x.Shift.StartsAt, x.Shift.EndsAt, shift.StartsAt, shift.EndsAt) &&
                        x.Assignment.TeacherId == plan.TeacherId))
                    { Note(plan, "Instrutor já programado na grade semanal"); continue; }
                    if (schedule.WeeklyClasses.Any(x => x.Weekday == (int)date.DayOfWeek &&
                        Intersects(x.Shift.StartsAt, x.Shift.EndsAt, shift.StartsAt, shift.EndsAt) &&
                        x.Assignment.ClassGroupId == cls.Id))
                    { Note(plan, "Turma já programada na grade semanal"); continue; }
                    if (await ReservationRules.ConflictAsync(db, 0, start, end, plan.TeacherId, cls.Id) is string occupied)
                    { Note(plan, occupied); continue; }
                    Room? room = null;
                    if (offer.DeliveryMode == UnitDeliveryMode.Presencial)
                    {
                        var candidates = rooms.Where(x => x.Seats >= cls.Students &&
                            (offer.CurricularUnit.ResourceRequirements.Count == 0 ||
                             EnvironmentCompatibility.Evaluate(null, x, cls.Students, date, false,
                                 offer.CurricularUnit.ResourceRequirements).Classification == "Compatible")).ToList();
                        foreach (var candidate in candidates.OrderBy(x => x.Seats - cls.Students).ThenBy(x => x.Id))
                        {
                            if (slotReservations.Any(x => x.Date == date && x.RoomId == candidate.Id &&
                                Intersects(x.Shift.StartsAt, x.Shift.EndsAt, shift.StartsAt, shift.EndsAt))) continue;
                            if (schedule.WeeklyClasses.Any(x => x.Weekday == (int)date.DayOfWeek &&
                                x.RoomId == candidate.Id && Intersects(x.Shift.StartsAt, x.Shift.EndsAt,
                                    shift.StartsAt, shift.EndsAt))) continue;
                            if (await ReservationRules.ConflictAsync(db, candidate.Id, start, end,
                                plan.TeacherId, cls.Id) is null) { room = candidate; break; }
                            Note(plan, "Ambiente compatível ocupado no período");
                        }
                        if (room is null)
                        {
                            if (candidates.Count > 0) compatibleButOccupied.Add((plan.ClassGroupId, plan.CurricularUnitId));
                            continue;
                        }
                    }
                    var hours = Math.Min(shift.PedagogicalHours!.Value, plan.PlannedHours!.Value - plan.AllocatedHours);
                    plan.Meetings.Add(new ScheduleUnitMeeting { Plan = plan, Date = date,
                        Shift = shift, ShiftId = shift.Id, Room = room, RoomId = room?.Id, PlannedHours = hours });
                    plan.AllocatedHours += hours;
                    slotReservations.Add((date, shift, plan.TeacherId!, cls.Id, room?.Id));
                }
            }
        }
        foreach (var plan in plans.Where(x => x.AllocatedHours < x.PlannedHours || x.PlannedHours is null))
        {
            schedule.UnallocatedMeetings++;
            if (plan.PendingReason is not null) continue;
            var offer = byKey[(plan.ClassGroupId, plan.CurricularUnitId)];
            var shift = shifts.FirstOrDefault(x => x.Id == offer.ClassGroup.ShiftId);
            if (shift?.PedagogicalHours is null) plan.PendingReason = "Equivalência institucional de horas pedagógicas por turno não configurada";
            else if (!availability.Any(x => x.TeacherId == plan.TeacherId && x.ShiftId == shift.Id))
                plan.PendingReason = "Instrutor sem disponibilidade no turno da turma";
            else if (offer.DeliveryMode == UnitDeliveryMode.Presencial && !rooms.Any(x => x.Seats >= offer.ClassGroup.Students))
                plan.PendingReason = "Nenhum ambiente ativo tem capacidade suficiente para a turma";
            else if (offer.DeliveryMode == UnitDeliveryMode.Presencial && !rooms.Any(x => x.Seats >= offer.ClassGroup.Students &&
                (offer.CurricularUnit.ResourceRequirements.Count == 0 ||
                 EnvironmentCompatibility.Evaluate(null, x, offer.ClassGroup.Students, semester.StartDate, false,
                     offer.CurricularUnit.ResourceRequirements).Classification == "Compatible")))
                plan.PendingReason = "Recursos obrigatórios da UC insuficientes ou não comprovados nos ambientes";
            else if (plan.AllocatedHours == 0 && compatibleButOccupied.Contains((plan.ClassGroupId, plan.CurricularUnitId)))
                plan.PendingReason = "Ambientes tecnicamente compatíveis, mas ocupados nos períodos disponíveis";
            else if (!calendar[offer.ClassGroupId].Values.Any(x => offer.DeliveryMode == UnitDeliveryMode.Presencial ?
                x.CountsAsPresential : x.Kind is not (AcademicDayKind.Holiday or AcademicDayKind.Recess or
                    AcademicDayKind.Planning or AcademicDayKind.NonTeaching)))
                plan.PendingReason = "Não há períodos letivos elegíveis para esta oferta no semestre";
            else if (!calendar[offer.ClassGroupId].Values.Any(x =>
                (offer.DeliveryMode == UnitDeliveryMode.Presencial ? x.CountsAsPresential :
                    x.Kind is not (AcademicDayKind.Holiday or AcademicDayKind.Recess or
                        AcademicDayKind.Planning or AcademicDayKind.NonTeaching)) &&
                availability.Any(a => a.TeacherId == plan.TeacherId && a.ShiftId == shift!.Id &&
                    a.Weekday == (int)x.Date.DayOfWeek)))
                plan.PendingReason = "Instrutor indisponível nas datas letivas do semestre";
            else if (slotObstacles.GetValueOrDefault((plan.ClassGroupId, plan.CurricularUnitId)) is { Count: > 0 } reasons)
                plan.PendingReason = string.Join("; ", reasons.Take(3));
            else plan.PendingReason = "Datas letivas, disponibilidade ou horários livres insuficientes no semestre";
        }
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
