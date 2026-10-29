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
