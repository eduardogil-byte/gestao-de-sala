namespace SalaGest.Api.Models;

public sealed class TeacherCourseQualification
{
    public string TeacherId { get; set; } = "";
    public AppUser Teacher { get; set; } = null!;
    public int CourseId { get; set; }
    public Course Course { get; set; } = null!;
}

public sealed class TeacherUnitQualification
{
    public string TeacherId { get; set; } = "";
    public AppUser Teacher { get; set; } = null!;
    public int CurricularUnitId { get; set; }
    public CurricularUnit CurricularUnit { get; set; } = null!;
}

public sealed class TeacherCapabilityQualification
{
    public string TeacherId { get; set; } = "";
    public AppUser Teacher { get; set; } = null!;
    public int CurricularCapabilityId { get; set; }
    public CurricularCapability CurricularCapability { get; set; } = null!;
}
