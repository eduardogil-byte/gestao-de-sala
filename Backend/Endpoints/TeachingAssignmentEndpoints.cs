using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapAssignments(IEndpointRouteBuilder app)
    {
        var assignments = app.MapGroup("/api/assignments").RequireAuthorization()
            .WithTags("Atribuições docentes");

        assignments.MapGet("", async (int? semesterId, int? classGroupId, string? teacherId,
            bool? activeOnly, ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!current.IsInRole("Admin") && !current.IsInRole("Professor")) return Results.Forbid();
            if (!current.IsInRole("Admin") && teacherId is not null && teacherId != UserId(current))
                return Results.Forbid();
            var visibleTeacherId = current.IsInRole("Admin") ? teacherId : UserId(current);
            var items = await db.Assignments.AsNoTracking().Include(a => a.ClassGroup)
                .Include(a => a.Software)
                .Where(a => (semesterId == null || a.ClassGroup.SemesterId == semesterId) &&
                    (classGroupId == null || a.ClassGroupId == classGroupId) &&
                    (visibleTeacherId == null || a.TeacherId == visibleTeacherId) &&
                    (activeOnly != true || a.EndedAtUtc == null))
                .OrderBy(a => a.ClassGroupId).ThenBy(a => a.Weekday).ThenBy(a => a.Id).ToListAsync();
            var teacherIds = items.Select(a => a.TeacherId).Distinct().ToArray();
            var unitIds = items.Where(a => a.CurricularUnitId is not null)
                .Select(a => a.CurricularUnitId!.Value).Distinct().ToArray();
            var qualifications = await db.TeacherUnitQualifications.AsNoTracking()
                .Where(q => teacherIds.Contains(q.TeacherId) && unitIds.Contains(q.CurricularUnitId))
                .Select(q => new { q.TeacherId, q.CurricularUnitId }).ToListAsync();
            var qualified = qualifications.Select(q => (q.TeacherId, q.CurricularUnitId)).ToHashSet();
            return Results.Ok(items.Select(a => AssignmentView(a,
                a.CurricularUnitId is int unitId ? qualified.Contains((a.TeacherId, unitId)) : null)).ToList());
        });

        assignments.MapGet("/{id:int}", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var item = await db.Assignments.AsNoTracking().Include(a => a.ClassGroup)
                .Include(a => a.Software).FirstOrDefaultAsync(a => a.Id == id);
            if (item is null) return Results.NotFound();
            if (!current.IsInRole("Admin") &&
                (!current.IsInRole("Professor") || item.TeacherId != UserId(current))) return Results.Forbid();
            bool? qualified = item.CurricularUnitId is int unitId
                ? await db.TeacherUnitQualifications.AnyAsync(q => q.TeacherId == item.TeacherId &&
                    q.CurricularUnitId == unitId)
                : null;
            return Results.Ok(AssignmentView(item, qualified));
        });

        assignments.MapPost("", async (AssignmentCreate input, AppDbContext db,
            UserManager<AppUser> users) =>
        {
            if (string.IsNullOrWhiteSpace(input.TeacherId)) return Error("Professor não encontrado");
            var teacher = await FindTeacher(users, input.TeacherId);
            if (teacher is null) return Error("Professor não encontrado");
            var classGroup = await db.Classes.FirstOrDefaultAsync(c => c.Id == input.ClassGroupId);
            if (classGroup is null) return Error("Turma não encontrada");
            var softwareIds = input.SoftwareIds?.Distinct().ToArray() ?? [];
            if (input.MeetingsPerWeek is < 1 or > 5 || !Enum.IsDefined(input.MinTier) ||
                input.MinRamGb is < 0 or > 512 ||
                (input.CurricularUnitId is null && (string.IsNullOrWhiteSpace(input.DisciplineName) ||
                    input.Weekday is not null || input.SoftwareIds is null)) ||
                !await SoftwareExists(db, softwareIds))
                return Error("Dados da atribuição inválidos");

            CurricularUnit? unit = null;
            if (input.CurricularUnitId is int unitId)
            {
                if (input.MeetingsPerWeek != 1 || input.Weekday is null || input.PreferredShiftId is null)
                    return Error("Informe um dia e turno por atribuição pedagógica");
                var validation = await ValidatePedagogicalAssignment(db, classGroup, input.TeacherId,
                    unitId, input.Weekday.Value, input.PreferredShiftId.Value);
                if (validation.Error is not null) return validation.Error;
                unit = validation.Unit;
            }
            else if (input.PreferredShiftId is int shiftId &&
                !await db.Shifts.AnyAsync(s => s.Id == shiftId))
                return Error("Turno não encontrado");

            var item = new TeachingAssignment
            {
                ClassGroupId = classGroup.Id, ClassGroup = classGroup, TeacherId = teacher.Id,
                CurricularUnitId = unit?.Id, DisciplineName = unit?.Name ?? input.DisciplineName!.Trim(),
                MeetingsPerWeek = input.MeetingsPerWeek, Weekday = input.Weekday,
                PreferredShiftId = input.PreferredShiftId,
                NeedsProjector = input.NeedsProjector,
                NeedsTeacherComputer = input.NeedsTeacherComputer,
                NeedsStudentComputers = input.NeedsStudentComputers,
                MinTier = input.MinTier, MinRamGb = input.MinRamGb,
                NeedsDedicatedGpu = input.NeedsDedicatedGpu, LessonPlanLink = input.LessonPlanLink,
                Software = softwareIds.Select(id => new AssignmentSoftware { SoftwareId = id }).ToList()
            };
            db.Assignments.Add(item);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Atribuição pedagógica já cadastrada"); }
            bool? qualified = unit is null ? null : await db.TeacherUnitQualifications.AnyAsync(q =>
                q.TeacherId == teacher.Id && q.CurricularUnitId == unit.Id);
            return Results.Created($"/api/assignments/{item.Id}", AssignmentView(item, qualified));
        }).RequireAuthorization("Admin");

        assignments.MapPut("/{id:int}/pedagogical", async (int id, PedagogicalAssignmentUpdate input,
            AppDbContext db, UserManager<AppUser> users) =>
        {
            var item = await db.Assignments.Include(a => a.ClassGroup).Include(a => a.Software)
                .FirstOrDefaultAsync(a => a.Id == id);
            if (item is null) return Results.NotFound();
            if (item.CurricularUnitId is null) return Error("Atribuição anterior sem UC não pode ser alterada por esta rota");
            if (item.EndedAtUtc is not null) return CatalogConflict("Atribuição já encerrada");
            if (await db.WeeklyClasses.AnyAsync(w => w.AssignmentId == id))
                return CatalogConflict("Atribuição utilizada por uma grade não pode ser alterada");
            if (string.IsNullOrWhiteSpace(input.TeacherId)) return Error("Professor não encontrado");
            if (await FindTeacher(users, input.TeacherId) is null) return Error("Professor não encontrado");
            var validation = await ValidatePedagogicalAssignment(db, item.ClassGroup, input.TeacherId,
                input.CurricularUnitId, input.Weekday, input.ShiftId, id);
            if (validation.Error is not null) return validation.Error;
            item.TeacherId = input.TeacherId;
            item.CurricularUnitId = input.CurricularUnitId;
            item.DisciplineName = validation.Unit!.Name;
            item.Weekday = input.Weekday;
            item.PreferredShiftId = input.ShiftId;
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Atribuição pedagógica já cadastrada"); }
            var qualified = await db.TeacherUnitQualifications.AnyAsync(q => q.TeacherId == item.TeacherId &&
                q.CurricularUnitId == item.CurricularUnitId);
            return Results.Ok(AssignmentView(item, qualified));
        }).RequireAuthorization("Admin");

        assignments.MapPost("/{id:int}/end", async (int id, AppDbContext db) =>
        {
            var item = await db.Assignments.FindAsync(id);
            if (item is null) return Results.NotFound();
            if (item.EndedAtUtc is not null) return Results.NoContent();
            if (await db.WeeklyClasses.AnyAsync(w => w.AssignmentId == id &&
                w.Schedule.Status != ScheduleStatus.Arquivada))
                return CatalogConflict("Atribuição utilizada por uma grade ativa não pode ser encerrada");
            item.EndedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }

    private static async Task<(CurricularUnit? Unit, IResult? Error)> ValidatePedagogicalAssignment(
        AppDbContext db, ClassGroup classGroup, string teacherId, int unitId, int weekday,
        int shiftId, int exceptId = 0)
    {
        if (weekday is < 1 or > 5) return (null, Error("Dia deve estar entre 1 e 5"));
        if (!await db.Shifts.AnyAsync(s => s.Id == shiftId)) return (null, Error("Turno não encontrado"));
        if (!await db.Semesters.AnyAsync(s => s.Id == classGroup.SemesterId))
            return (null, Error("Semestre não encontrado"));
        if (classGroup.CourseId is null)
            return (null, Error("Vincule um curso à turma antes de atribuir uma UC"));
        var unit = await db.CurricularUnits.AsNoTracking().Include(u => u.CourseModule)
            .FirstOrDefaultAsync(u => u.Id == unitId);
        if (unit is null) return (null, Results.NotFound());
        if (unit.CourseModule.CourseId != classGroup.CourseId)
            return (null, Error("A UC não pertence ao curso da turma"));
        if (await db.Assignments.AnyAsync(a => a.Id != exceptId && a.EndedAtUtc == null &&
            a.ClassGroupId == classGroup.Id && a.TeacherId == teacherId &&
            a.CurricularUnitId == unitId && a.Weekday == weekday && a.PreferredShiftId == shiftId))
            return (null, CatalogConflict("Atribuição pedagógica já cadastrada"));
        if (await db.Assignments.AnyAsync(a => a.Id != exceptId && a.EndedAtUtc == null &&
            a.CurricularUnitId != null && a.Weekday == weekday && a.PreferredShiftId == shiftId &&
            (a.ClassGroupId == classGroup.Id ||
                (a.TeacherId == teacherId && a.ClassGroup.SemesterId == classGroup.SemesterId))))
            return (null, CatalogConflict("Professor ou turma já possui atribuição neste dia e turno"));
        if (await db.WeeklyClasses.AnyAsync(w => w.Schedule.Status != ScheduleStatus.Arquivada &&
            w.Schedule.SemesterId == classGroup.SemesterId && w.Weekday == weekday && w.ShiftId == shiftId &&
            (w.Assignment.ClassGroupId == classGroup.Id || w.Assignment.TeacherId == teacherId)))
            return (null, CatalogConflict("Professor ou turma já possui aula em uma grade neste dia e turno"));
        return (unit, null);
    }

    private static AssignmentResponse AssignmentView(TeachingAssignment a, bool? qualified) =>
        new(a.Id, a.TeacherId, a.ClassGroupId, a.ClassGroup.SemesterId, a.ClassGroup.CourseId,
            a.CurricularUnitId, a.DisciplineName, a.MeetingsPerWeek, a.Weekday, a.PreferredShiftId,
            a.EndedAtUtc, a.NeedsProjector, a.NeedsTeacherComputer, a.NeedsStudentComputers,
            a.MinTier, a.MinRamGb, a.NeedsDedicatedGpu, a.LessonPlanLink,
            a.Software.Select(s => s.SoftwareId).ToArray(), qualified, qualified == false);
}
