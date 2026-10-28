using SalaGest.Api.Models;

namespace SalaGest.Api.Contracts;

public sealed class AgendaOccupation
{
    public int Id { get; init; }
    public int RoomId { get; init; }
    public string RoomName { get; init; } = "";
    public DateTime StartsAt { get; init; }
    public DateTime EndsAt { get; init; }
    public DateOnly Date { get; init; }
    public int? ShiftId { get; init; }
    public string? ShiftName { get; init; }
    public OccupationKind Kind { get; init; }
    public ClassDayStatus DayStatus { get; init; }
    public AcademicDayKind? CalendarKind { get; init; }
    public string? CalendarReason { get; init; }
    public string Status { get; init; } = "";
    public string Source { get; init; } = "";
    public string? Description { get; init; }
    public string? OriginalTeacherId { get; init; }
    public string? ActualTeacherId { get; init; }
    public string? ActualTeacherName { get; init; }
    public int? OriginalClassGroupId { get; init; }
    public int? ActualClassGroupId { get; init; }
    public string? ActualClassGroupName { get; init; }
    public int? CourseId { get; init; }
    public string? CourseName { get; init; }
    public int? CurricularUnitId { get; init; }
    public string? CurricularUnitName { get; init; }
    public int? CurricularCapabilityId { get; init; }
    public string? CurricularCapabilityDescription { get; init; }
    public int? WeeklyClassId { get; init; }
    public int? BookingRequestId { get; init; }
    public int? EffectiveBookingRequestId { get; init; }
    public BookingStatus? BookingStatus { get; init; }
    public bool IsBorrowed { get; init; }
    public int? LoanId { get; init; }
    public OwnerClassDisposition? LoanDisposition { get; init; }
    public List<string> Conflicts { get; } = new();
}
