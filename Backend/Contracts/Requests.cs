using SalaGest.Api.Models;

namespace SalaGest.Api.Contracts;

public record RegisterTeacher(string Name, string Email, string Password);
public record LoginRequest(string Email, string Password);
public record SoftwareCreate(string Name);
public record GroupSoftwareInput(int SoftwareId, int InstalledQuantity);
public record ComputerGroupInput(string Description, int Quantity, int RamGb, HardwareTier Tier,
    bool DedicatedGpu, List<GroupSoftwareInput> Software);
public record RoomInput(string Name, string Location, RoomKind Kind, int Seats, int Desks,
    bool HasProjector, bool HasTeacherComputer, bool HasInternet, bool Active,
    List<ComputerGroupInput> ComputerGroups, string? Purpose = null);
public record ShiftInput(string Name, TimeOnly StartsAt, TimeOnly EndsAt);
public record SemesterCreate(string Name, DateOnly StartDate, DateOnly EndDate);
public record ClassCreate(int SemesterId, string Name, int Students);
public record AvailabilityInput(int Weekday, int ShiftId);
public record AssignmentCreate(int ClassGroupId, string TeacherId, string DisciplineName,
    int MeetingsPerWeek, int? PreferredShiftId, bool NeedsProjector, bool NeedsTeacherComputer,
    bool NeedsStudentComputers, HardwareTier MinTier, List<int> SoftwareIds, string? LessonPlanLink,
    int MinRamGb = 0, bool NeedsDedicatedGpu = false);
public record BookingCreate(int? ClassGroupId, DateTime StartsAt, DateTime EndsAt, int Students,
    bool NeedsProjector, bool NeedsTeacherComputer, bool NeedsStudentComputers,
    HardwareTier MinTier, List<int> SoftwareIds, string Reason, string? LessonPlanLink,
    BookingRecurrence Recurrence = BookingRecurrence.Nenhuma, DateOnly? RepeatUntil = null,
    int MinRamGb = 0, bool NeedsDedicatedGpu = false, int WeekdaysMask = 0,
    int StudentsPerComputer = 1, int? RecurringEadWeekday = null);
public record ConfirmBooking(int RoomId, bool ConfirmPartial = false, bool ReplaceOwnClassBooking = false);
public record DayStatusChange(ClassDayStatus Status);
public record MoveOccupation(int RoomId, bool NotifyTeachers = true);
public record LoanOffer(List<int> RoomOccupationIds, string BorrowerId, string Reason);
public record LoanFinish(OwnerClassDisposition Disposition, int? ReplacementRoomId = null);
public record ApproveBooking(int RoomId);
public record LoanCreate(int RoomOccupationId, int BookingRequestId, string Reason);
public record OwnerLoanDecision(bool ConfirmsNotUsing);
public record BlockRoom(int RoomId, DateTime StartsAt, DateTime EndsAt, string Description);
public record ApiError(string Error);
public record LoanAccept(int? ClassGroupId, int Students, int StudentsPerComputer,
    bool NeedsProjector, bool NeedsTeacherComputer, bool NeedsStudentComputers,
    HardwareTier MinTier, List<int> SoftwareIds, int MinRamGb = 0, bool NeedsDedicatedGpu = false);
public record ReleaseOccupation(bool Confirm);
public record ReleaseMultiple(List<int> OccupationIds, bool Confirm);
