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
    public CapabilityEnvironmentRequirement? EnvironmentRequirement { get; set; }
}

public sealed class CapabilityEnvironmentRequirement
{
    public int CurricularCapabilityId { get; set; }
    public CurricularCapability CurricularCapability { get; set; } = null!;
    public RoomKind? RoomKind { get; set; }
    public bool RequiresProjector { get; set; }
    public int? RequiredComputers { get; set; }
    public int? MinRamGb { get; set; }
    public bool ComputersCritical { get; set; }
    public List<CapabilityResourceRequirement> Resources { get; set; } = new();
    public List<CapabilitySoftwareRequirement> Software { get; set; } = new();
}

public sealed class CapabilityResourceRequirement
{
    public int Id { get; set; }
    public int CurricularCapabilityId { get; set; }
    public CapabilityEnvironmentRequirement EnvironmentRequirement { get; set; } = null!;
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public string NormalizedType { get; set; } = "";
    public int Quantity { get; set; }
    public bool Critical { get; set; }
}

public sealed class CapabilitySoftwareRequirement
{
    public int CurricularCapabilityId { get; set; }
    public CapabilityEnvironmentRequirement EnvironmentRequirement { get; set; } = null!;
    public int SoftwareId { get; set; }
    public Software Software { get; set; } = null!;
    public int? RequiredLicenses { get; set; }
    public bool Critical { get; set; } = true;
}
