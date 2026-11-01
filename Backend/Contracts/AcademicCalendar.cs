using SalaGest.Api.Models;

namespace SalaGest.Api.Contracts;

public record AcademicCalendarEventInput(DateOnly StartDate, DateOnly EndDate,
    AcademicDayKind Kind, string? Description);
public record AcademicCalendarEventResponse(int Id, int SemesterId, DateOnly StartDate,
    DateOnly EndDate, AcademicDayKind Kind, string Description);
public record ClassEadPatternInput(int? Weekday = null, DateOnly? StartDate = null,
    DateOnly? EndDate = null);
public record ClassCalendarExceptionInput(AcademicDayKind Kind, string? Description);
public record ClassCalendarExceptionResponse(int ClassGroupId, DateOnly Date,
    AcademicDayKind Kind, string Description);
public record CalendarDateResult(DateOnly Date, AcademicDayKind Kind, bool CountsAsPresential,
    string Reason);
public record CalendarPreviewResponse(int SemesterId, int? ClassGroupId, DateOnly From,
    DateOnly To, int WeekdaysMask, IReadOnlyList<CalendarDateResult> Dates,
    int PresentialMeetings, int EadMeetings, int ExcludedDates,
    int? RequiredMeetings, int? MissingMeetings);
