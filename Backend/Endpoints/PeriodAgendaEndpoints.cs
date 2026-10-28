using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapPeriodAgenda(RouteGroupBuilder api)
    {
        api.MapGet("/agenda", async (DateTime? from, DateTime? to, int? semesterId,
            int? roomId, string? teacherId, int? classGroupId, int? shiftId,
            OccupationKind? kind, ClassDayStatus? dayStatus, BookingStatus? bookingStatus,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            Semester? requestedSemester = null;
            if (semesterId is int semester)
            {
                requestedSemester = await db.Semesters.AsNoTracking().FirstOrDefaultAsync(s => s.Id == semester);
                if (requestedSemester is null) return Results.NotFound();
                var semesterStart = requestedSemester.StartDate.ToDateTime(TimeOnly.MinValue);
                var semesterEnd = requestedSemester.EndDate.AddDays(1).ToDateTime(TimeOnly.MinValue);
                from ??= semesterStart;
                to ??= semesterEnd;
                if (from < semesterStart || to > semesterEnd)
                    return Error("O período consultado deve estar dentro do semestre informado");
            }
            if (from is null || to is null || from >= to || (to - from).Value.TotalDays > 371 ||
                (kind is not null && !Enum.IsDefined(kind.Value)) ||
                (dayStatus is not null && !Enum.IsDefined(dayStatus.Value)) ||
                (bookingStatus is not null && !Enum.IsDefined(bookingStatus.Value)))
                return Error("Informe um período válido de até 371 dias e filtros válidos");
            if (roomId is int room && !await db.Rooms.AnyAsync(r => r.Id == room)) return Results.NotFound();
            var shifts = await db.Shifts.AsNoTracking().Select(s => new { s.Id, s.Name, s.StartsAt, s.EndsAt })
                .ToListAsync();
            if (shiftId is int shift && shifts.All(s => s.Id != shift)) return Results.NotFound();

            var me = UserId(current);
            var admin = current.IsInRole("Admin");
            if (!admin && teacherId is not null && teacherId != me) return Results.Forbid();
            if (!admin && classGroupId is int classId &&
                !await db.Assignments.AnyAsync(a => a.TeacherId == me && a.ClassGroupId == classId))
                return Results.Forbid();
            if (teacherId is not null && !await db.Users.AnyAsync(u => u.Id == teacherId))
                return Results.NotFound();
            if (classGroupId is int groupId && !await db.Classes.AnyAsync(c => c.Id == groupId))
                return Results.NotFound();
            var readableClasses = admin ? new HashSet<int>() :
                (await db.Assignments.AsNoTracking().Where(a => a.TeacherId == me && a.EndedAtUtc == null)
                    .Select(a => a.ClassGroupId).Distinct().ToListAsync()).ToHashSet();
            var canReadSemesterCalendar = requestedSemester is not null &&
                (admin || await db.Assignments.AsNoTracking().AnyAsync(a => a.TeacherId == me &&
                    a.EndedAtUtc == null && a.ClassGroup.SemesterId == requestedSemester.Id));

            // A ocupação ativa é a fonte da agenda; pedidos pendentes não geram linhas.
            var occupations = await db.Occupations.AsNoTracking()
                .Where(o => o.CancelledAtUtc == null && o.StartsAt < to && o.EndsAt > from)
                .OrderBy(o => o.StartsAt).ThenBy(o => o.Id)
                .Select(o => new { o.Id, o.RoomId, RoomName = o.Room.Name, o.StartsAt, o.EndsAt,
                    o.Kind, o.DayStatus, o.Description, o.TeacherId, o.ClassGroupId,
                    o.WeeklyClassId, o.BookingRequestId }).Take(10001).ToListAsync();
            if (occupations.Count > 10000)
                return Error("O período contém mais de 10000 ocupações; consulte intervalos menores");
            var occupationIds = occupations.Select(o => o.Id).ToArray();
            var loans = await db.Loans.AsNoTracking()
                .Where(l => l.Status == LoanStatus.Aprovado && occupationIds.Contains(l.RoomOccupationId))
                .Select(l => new { l.Id, l.RoomOccupationId, l.BookingRequestId, l.BorrowerId,
                    l.BookingRequest.ClassGroupId, l.OwnerDisposition }).ToListAsync();
            var loansByOccupation = loans.GroupBy(l => l.RoomOccupationId).ToDictionary(g => g.Key,
                g => g.OrderByDescending(l => l.Id).First());
            var loanCounts = loans.GroupBy(l => l.RoomOccupationId).ToDictionary(g => g.Key, g => g.Count());
            var bookingIds = occupations.Where(o => o.BookingRequestId.HasValue)
                .Select(o => o.BookingRequestId!.Value).Concat(loans.Select(l => l.BookingRequestId))
                .Distinct().ToArray();
            var bookings = await db.Bookings.AsNoTracking().Where(b => bookingIds.Contains(b.Id))
                .Select(b => new { b.Id, b.Status, b.CurricularUnitId,
                    UnitName = b.CurricularUnit == null ? null : b.CurricularUnit.Name,
                    b.CurricularCapabilityId,
                    CapabilityDescription = b.CurricularCapability == null ? null : b.CurricularCapability.Description })
                .ToDictionaryAsync(b => b.Id);
            var weeklyIds = occupations.Where(o => o.WeeklyClassId.HasValue)
                .Select(o => o.WeeklyClassId!.Value).Distinct().ToArray();
            var weekly = await db.WeeklyClasses.AsNoTracking().Where(w => weeklyIds.Contains(w.Id))
                .Select(w => new { w.Id, w.Assignment.CurricularUnitId,
                    UnitName = w.Assignment.CurricularUnit == null ? null : w.Assignment.CurricularUnit.Name })
                .ToDictionaryAsync(w => w.Id);
            var classIds = occupations.Where(o => o.ClassGroupId.HasValue).Select(o => o.ClassGroupId!.Value)
                .Concat(loans.Where(l => l.ClassGroupId.HasValue).Select(l => l.ClassGroupId!.Value))
                .Distinct().ToArray();
            var classes = await db.Classes.AsNoTracking().Include(c => c.Course).Include(c => c.Semester)
                .Where(c => classIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id);
            var teacherIds = occupations.Where(o => o.TeacherId != null).Select(o => o.TeacherId!)
                .Concat(loans.Select(l => l.BorrowerId)).Distinct().ToArray();
            var teachers = await db.Users.AsNoTracking().Where(u => teacherIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName }).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
            var firstDate = DateOnly.FromDateTime(from.Value);
            var lastDate = DateOnly.FromDateTime(to.Value.AddTicks(-1));
            var semesterIds = classes.Values.Select(c => c.SemesterId)
                .Concat(requestedSemester is null ? Array.Empty<int>() : new[] { requestedSemester.Id })
                .Distinct().ToArray();
            var events = await db.AcademicCalendarEvents.AsNoTracking()
                .Where(e => semesterIds.Contains(e.SemesterId) && e.StartDate <= lastDate && e.EndDate >= firstDate)
                .OrderBy(e => e.StartDate).ToListAsync();
            var exceptions = await db.ClassCalendarExceptions.AsNoTracking()
                .Where(e => classIds.Contains(e.ClassGroupId) && e.Date >= firstDate && e.Date <= lastDate)
                .ToListAsync();
            var eventsBySemester = events.GroupBy(e => e.SemesterId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<AcademicCalendarEvent>)g.ToArray());
            var exceptionsByClass = exceptions.GroupBy(e => e.ClassGroupId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<ClassCalendarException>)g.ToArray());
            var calendarCache = new Dictionary<(int?, DateOnly), CalendarDateResult>();
            CalendarDateResult? CalendarFor(int? classId, DateOnly date, bool canSeeClass)
            {
                var classGroup = canSeeClass && classId is int id ? classes.GetValueOrDefault(id) : null;
                var semester = classGroup?.Semester ?? (canReadSemesterCalendar ? requestedSemester : null);
                if (semester is null) return null;
                var key = (classGroup?.Id, date);
                if (calendarCache.TryGetValue(key, out var cached)) return cached;
                var calendar = AcademicCalendarRules.Preview(semester, date, date,
                    1 << (int)date.DayOfWeek, classGroup,
                    eventsBySemester.GetValueOrDefault(semester.Id) ?? Array.Empty<AcademicCalendarEvent>(),
                    classGroup is null ? Array.Empty<ClassCalendarException>() :
                        exceptionsByClass.GetValueOrDefault(classGroup.Id) ?? Array.Empty<ClassCalendarException>())
                    .Dates[0];
                calendarCache[key] = calendar;
                return calendar;
            }

            var result = occupations.Select(o =>
            {
                var loan = loansByOccupation.GetValueOrDefault(o.Id);
                var actualTeacher = loan?.BorrowerId ?? o.TeacherId;
                var actualClass = loan is null ? o.ClassGroupId : loan.ClassGroupId;
                var visibleDetails = admin || actualTeacher == me || o.TeacherId == me;
                var bookingId = loan?.BookingRequestId ?? o.BookingRequestId;
                var booking = bookingId is int bid ? bookings.GetValueOrDefault(bid) : null;
                var lesson = o.WeeklyClassId is int wid ? weekly.GetValueOrDefault(wid) : null;
                var classGroup = actualClass is int cid ? classes.GetValueOrDefault(cid) : null;
                var date = DateOnly.FromDateTime(o.StartsAt);
                var calendar = CalendarFor(actualClass, date, admin ||
                    (actualTeacher == me && actualClass is int id && readableClasses.Contains(id)));
                var slot = shifts.FirstOrDefault(s => s.StartsAt == TimeOnly.FromDateTime(o.StartsAt) &&
                    s.EndsAt == TimeOnly.FromDateTime(o.EndsAt));
                return new AgendaOccupation
                {
                    Id = o.Id, RoomId = o.RoomId, RoomName = o.RoomName,
                    StartsAt = o.StartsAt, EndsAt = o.EndsAt, Date = date,
                    ShiftId = slot?.Id, ShiftName = slot?.Name,
                    Kind = o.Kind, DayStatus = o.DayStatus,
                    CalendarKind = calendar?.Kind, CalendarReason = calendar?.Reason,
                    Status = o.Kind == OccupationKind.Bloqueio ? "Blocked" : "Confirmed",
                    Source = o.BookingRequestId != null ? "Booking" : o.WeeklyClassId != null ? "Schedule" :
                        o.Kind == OccupationKind.Bloqueio ? "Block" : "Manual",
                    Description = o.Description,
                    OriginalTeacherId = o.TeacherId, ActualTeacherId = actualTeacher,
                    ActualTeacherName = visibleDetails && actualTeacher is not null
                        ? teachers.GetValueOrDefault(actualTeacher) : null,
                    OriginalClassGroupId = o.ClassGroupId, ActualClassGroupId = actualClass,
                    ActualClassGroupName = visibleDetails ? classGroup?.Name : null,
                    CourseId = visibleDetails ? classGroup?.CourseId : null,
                    CourseName = visibleDetails ? classGroup?.Course?.Name : null,
                    CurricularUnitId = visibleDetails ? booking?.CurricularUnitId ?? lesson?.CurricularUnitId : null,
                    CurricularUnitName = visibleDetails ? booking?.UnitName ?? lesson?.UnitName : null,
                    CurricularCapabilityId = visibleDetails ? booking?.CurricularCapabilityId : null,
                    CurricularCapabilityDescription = visibleDetails ? booking?.CapabilityDescription : null,
                    WeeklyClassId = o.WeeklyClassId, BookingRequestId = o.BookingRequestId,
                    EffectiveBookingRequestId = bookingId, BookingStatus = booking?.Status,
                    IsBorrowed = loan is not null, LoanId = loan?.Id, LoanDisposition = loan?.OwnerDisposition
                };
            }).ToList();

            // Sinaliza dados já inconsistentes sem modificar reservas ou histórico.
            for (var i = 0; i < result.Count; i++)
                for (var j = i + 1; j < result.Count && result[j].StartsAt < result[i].EndsAt; j++)
                {
                    var left = result[i]; var right = result[j];
                    if (left.RoomId == right.RoomId) Mark(left, right, "Room");
                    if (left.ActualTeacherId is not null && left.ActualTeacherId == right.ActualTeacherId)
                        Mark(left, right, "Teacher");
                    if (left.ActualClassGroupId is not null && left.ActualClassGroupId == right.ActualClassGroupId)
                        Mark(left, right, "ClassGroup");
                }
            foreach (var item in result)
            {
                if (loanCounts.GetValueOrDefault(item.Id) > 1) item.Conflicts.Add("Loan");
                if (item.BookingStatus is BookingStatus status && status != BookingStatus.Aprovada)
                    item.Conflicts.Add("BookingStatus");
            }
            var filtered = result.Where(o =>
                (roomId is null || o.RoomId == roomId) &&
                (teacherId is null || o.ActualTeacherId == teacherId) &&
                (classGroupId is null || o.ActualClassGroupId == classGroupId) &&
                (shiftId is null || o.ShiftId == shiftId) &&
                (kind is null || o.Kind == kind) &&
                (dayStatus is null || o.DayStatus == dayStatus) &&
                (bookingStatus is null || o.BookingStatus == bookingStatus));
            return Results.Ok(filtered);
        });
    }

    private static void Mark(AgendaOccupation left, AgendaOccupation right, string reason)
    {
        if (!left.Conflicts.Contains(reason)) left.Conflicts.Add(reason);
        if (!right.Conflicts.Contains(reason)) right.Conflicts.Add(reason);
    }
}
