using SalaGest.Api.Models;

namespace SalaGest.Api.Contracts;

public record PedagogicalAssignmentUpdate(string TeacherId, int CurricularUnitId,
    int Weekday, int ShiftId);

public record AssignmentResponse(int Id, string TeacherId, int ClassGroupId, int SemesterId,
    int? CourseId, int? CurricularUnitId, string DisciplineName, int MeetingsPerWeek,
    int? Weekday, int? PreferredShiftId, DateTime? EndedAtUtc,
    bool NeedsProjector, bool NeedsTeacherComputer, bool NeedsStudentComputers,
    HardwareTier MinTier, int MinRamGb, bool NeedsDedicatedGpu, string? LessonPlanLink,
    IReadOnlyList<int> SoftwareIds, bool? IsQualifiedForUnit, bool QualificationWarning);
