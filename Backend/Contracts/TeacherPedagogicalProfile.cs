namespace SalaGest.Api.Contracts;

public record TeacherPedagogicalProfileInput(string? Education, string? TechnicalSkills,
    string? ProfessionalKnowledge);
public record TeacherCourseQualificationResponse(int CourseId, string CourseName);
public record TeacherUnitQualificationResponse(int CurricularUnitId, string UnitName,
    int CourseId, string CourseName);
public record TeacherCapabilityQualificationResponse(int CurricularCapabilityId, string Description,
    int CurricularUnitId);
public record TeacherPedagogicalProfileResponse(string TeacherId, string DisplayName,
    string Education, string TechnicalSkills, string ProfessionalKnowledge,
    IReadOnlyList<TeacherCourseQualificationResponse> Courses,
    IReadOnlyList<TeacherUnitQualificationResponse> CurricularUnits,
    IReadOnlyList<TeacherCapabilityQualificationResponse> Capabilities);
