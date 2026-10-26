namespace SalaGest.Api.Models;

public sealed class Course
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string NormalizedCode { get; set; } = "";
    public string Name { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public bool Active { get; set; } = true;
    public List<CourseModule> Modules { get; set; } = new();
}

public sealed class CourseModule
{
    public int Id { get; set; }
    public int CourseId { get; set; }
    public Course Course { get; set; } = null!;
    public string Name { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public int Order { get; set; }
    public List<CurricularUnit> CurricularUnits { get; set; } = new();
}

public sealed class CurricularUnit
{
    public int Id { get; set; }
    public int CourseModuleId { get; set; }
    public CourseModule CourseModule { get; set; } = null!;
    public string Code { get; set; } = "";
    public string NormalizedCode { get; set; } = "";
    public string Name { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public decimal? PlannedHours { get; set; }
    public List<CurricularCapability> Capabilities { get; set; } = new();
}

public sealed class CurricularCapability
{
    public int Id { get; set; }
    public int CurricularUnitId { get; set; }
    public CurricularUnit CurricularUnit { get; set; } = null!;
    public string Description { get; set; } = "";
    public string NormalizedDescription { get; set; } = "";
    public string Contents { get; set; } = "";
    public decimal RequiredHours { get; set; }
    public int Order { get; set; }
}
