namespace SalaGest.Api.Contracts;

public record CapabilityOpportunity(int CapabilityId, int CourseId, string CourseName,
    string UnitName, string Description, decimal RequiredHours, string Classification,
    IReadOnlyList<RequirementFinding> Findings);

public record OpportunityDate(DateOnly Date, string Status, string Detail);

public record OpportunityPeriods(int SemesterId, int RoomId, int CapabilityId, int ShiftId,
    decimal PedagogicalHours, decimal ShiftHours, int RequiredMeetings, decimal PhysicalHours,
    int PotentiallyFreeMeetings, int SuitableMeetings, string Compatibility,
    string Availability, IReadOnlyList<RequirementFinding> Findings,
    IReadOnlyList<OpportunityDate> Dates);
