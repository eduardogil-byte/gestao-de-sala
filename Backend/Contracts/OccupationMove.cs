namespace SalaGest.Api.Contracts;

public record OccupationMovePreviewInput(int RoomId, DateOnly Date, int ShiftId);

public record OccupationMoveConfirmInput(int RoomId, DateOnly Date, int ShiftId,
    int ExpectedRoomId, DateTime ExpectedStartsAt, DateTime ExpectedEndsAt,
    bool Confirm, string? Reason = null);

public record OccupationMoveSlot(int RoomId, string RoomName, DateOnly Date,
    int? ShiftId, string? ShiftName, DateTime StartsAt, DateTime EndsAt);

public record OccupationMovePreview(int OccupationId, OccupationMoveSlot Origin,
    OccupationMoveSlot Destination, bool Allowed, IReadOnlyList<string> Blocks,
    IReadOnlyList<string> Warnings, string TechnicalClassification,
    IReadOnlyList<RequirementFinding> TechnicalFindings, int[] AffectedOccupationIds);

public record OccupationBlockMoveInput(int RoomId, DateOnly StartDate);
public record OccupationBlockMoveConfirmInput(int RoomId, DateOnly StartDate,
    string ExpectedSignature, bool Confirm, string? Reason = null);
public record BlockCapabilityMovePreview(int CapabilityId, string Description, int Order,
    decimal PedagogicalHours, int RequiredMeetings, decimal PhysicalHours,
    IReadOnlyList<DateOnly> PreviousDates, IReadOnlyList<DateOnly> NewDates,
    IReadOnlyList<int> PreviousRoomIds, IReadOnlyList<RequirementFinding> TechnicalFindings);
public record OccupationBlockMovePreview(int OccupationId, int PlanId, int AssignmentId,
    string TeacherName, string ClassGroupName, string CourseName, string ModuleName,
    string CurricularUnitName, int ShiftId, string ShiftName, int DestinationRoomId,
    string DestinationRoomName, DateOnly RequestedStartDate, bool Allowed,
    IReadOnlyList<string> Blocks, IReadOnlyList<string> Warnings,
    IReadOnlyList<BlockCapabilityMovePreview> Capabilities,
    IReadOnlyList<int> AffectedOccupationIds, string Signature);
