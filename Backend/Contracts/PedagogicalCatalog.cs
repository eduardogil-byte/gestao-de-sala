namespace SalaGest.Api.Contracts;

public record CourseInput(string Code, string Name, bool? Active);
public record CourseResponse(int Id, string Code, string Name, bool Active);
public record CourseModuleInput(string Name, int Order);
public record CourseModuleResponse(int Id, int CourseId, string Name, int Order);
public record CurricularUnitInput(string Code, string Name);
public record CurricularUnitResponse(int Id, int CourseModuleId, string Code, string Name,
    decimal? PlannedHours = null);
public record CurricularUnitWorkloadInput(decimal? PlannedHours);
public record CurricularCapabilityInput(string Description, string Contents, decimal RequiredHours, int Order);
public record CurricularCapabilityResponse(int Id, int CurricularUnitId, string Description,
    string Contents, decimal RequiredHours, int Order);
public enum WorkloadStatus { Undefined, Balanced, MissingHours, ExcessHours }
public record CurricularUnitWorkloadSummary(int CurricularUnitId, decimal? PlannedHours,
    decimal CapabilityHours, WorkloadStatus Status, decimal MissingHours, decimal ExcessHours,
    decimal HoursPerShift, int? RequiredMeetings);
