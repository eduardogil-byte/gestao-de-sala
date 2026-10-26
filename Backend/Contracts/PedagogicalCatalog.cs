namespace SalaGest.Api.Contracts;

public record CourseInput(string Code, string Name, bool? Active);
public record CourseResponse(int Id, string Code, string Name, bool Active);
public record CourseModuleInput(string Name, int Order);
public record CourseModuleResponse(int Id, int CourseId, string Name, int Order);
public record CurricularUnitInput(string Code, string Name);
public record CurricularUnitResponse(int Id, int CourseModuleId, string Code, string Name);
