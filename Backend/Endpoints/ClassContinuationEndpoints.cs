using System.Data;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapClassContinuation(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/classes/{id:int}/history", async (int id, AppDbContext db) =>
        {
            var identity = await db.Classes.Where(x => x.Id == id)
                .Select(x => (Guid?)x.ContinuityId).SingleOrDefaultAsync();
            if (identity is null) return Results.NotFound();
            return Results.Ok(await db.Classes.AsNoTracking().Where(x => x.ContinuityId == identity)
                .OrderBy(x => x.Semester.StartDate).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.PreviousClassGroupId, x.SemesterId,
                    SemesterName = x.Semester.Name, x.Semester.StartDate,
                    x.Name, x.Code, x.Students, CourseName = x.Course == null ? null : x.Course.Name,
                    ModuleName = x.CourseModule == null ? null : x.CourseModule.Name,
                    ShiftName = x.Shift == null ? null : x.Shift.Name }).ToListAsync());
        }).RequireAuthorization(p => p.RequireRole("Admin", "Professor"));

        app.MapGet("/api/classes/{id:int}/continuation-options", async (int id, int moduleId, AppDbContext db) =>
        {
            var source = await db.Classes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id);
            if (source is null) return Results.NotFound();
            if (source.CourseId is null || !await db.CourseModules.AnyAsync(x =>
                x.Id == moduleId && x.CourseId == source.CourseId))
                return Error("Selecione um módulo do curso da turma.");
            var units = await db.CurricularUnits.AsNoTracking().Where(x => x.CourseModuleId == moduleId)
                .OrderBy(x => x.Code).Select(x => new { x.Id, x.Code, x.Name }).ToListAsync();
            var unitIds = units.Select(x => x.Id).ToArray();
            var teachers = await db.TeacherUnitQualifications.AsNoTracking()
                .Where(x => unitIds.Contains(x.CurricularUnitId) &&
                    db.TeacherCourseQualifications.Any(q => q.TeacherId == x.TeacherId && q.CourseId == source.CourseId) &&
                    db.UserRoles.Any(r => r.UserId == x.TeacherId &&
                        db.Roles.Any(role => role.Id == r.RoleId && role.Name == "Professor")))
                .OrderBy(x => x.Teacher.DisplayName)
                .Select(x => new { x.CurricularUnitId, x.TeacherId, x.Teacher.DisplayName }).ToListAsync();
            return Results.Ok(units.Select(x => new { CurricularUnitId = x.Id, x.Code, x.Name,
                Teachers = teachers.Where(t => t.CurricularUnitId == x.Id)
                    .Select(t => new { t.TeacherId, t.DisplayName }) }));
        }).RequireAuthorization("Admin");

        app.MapPost("/api/classes/{id:int}/continue", async (int id, ClassContinuationCreate input,
            AppDbContext db, ClaimsPrincipal current) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var source = await db.Classes.AsNoTracking().Include(x => x.Semester)
                .SingleOrDefaultAsync(x => x.Id == id);
            if (source is null) return Results.NotFound();
            var semester = await db.Semesters.FindAsync(input.SemesterId);
            if (semester is null) return Error("Semestre não encontrado.");
            if (await db.Classes.AnyAsync(x => x.ContinuityId == source.ContinuityId && x.SemesterId == input.SemesterId))
                return CatalogConflict("Esta turma já possui um registro no semestre selecionado.");
            if (semester.StartDate <= source.Semester.StartDate)
                return Error("Selecione um semestre posterior ao registro de origem.");
            if (source.CourseId is null || !await db.CourseModules.AnyAsync(x =>
                x.Id == input.CourseModuleId && x.CourseId == source.CourseId))
                return Error("Selecione um módulo do curso da turma.");
            if (!await db.Shifts.AnyAsync(x => x.Id == input.ShiftId)) return Error("Turno não encontrado.");
            if (source.NormalizedCode is not null && await db.Classes.AnyAsync(x =>
                x.SemesterId == input.SemesterId && x.NormalizedCode == source.NormalizedCode))
                return CatalogConflict("Já existe uma turma com este código no semestre selecionado.");
            var unitIds = await db.CurricularUnits.Where(x => x.CourseModuleId == input.CourseModuleId)
                .Select(x => x.Id).ToListAsync();
            var teachers = input.Teachers ?? [];
            if (teachers.Any(x => x is null || string.IsNullOrWhiteSpace(x.TeacherId) || !unitIds.Contains(x.CurricularUnitId)) ||
                teachers.Select(x => x.CurricularUnitId).Distinct().Count() != teachers.Count)
                return Error("Selecione no máximo um instrutor por UC do módulo escolhido.");
            foreach (var teacher in teachers)
            {
                if (!await db.TeacherUnitQualifications.AnyAsync(x => x.TeacherId == teacher.TeacherId &&
                        x.CurricularUnitId == teacher.CurricularUnitId) ||
                    !await db.TeacherCourseQualifications.AnyAsync(x => x.TeacherId == teacher.TeacherId && x.CourseId == source.CourseId) ||
                    !await db.UserRoles.AnyAsync(x => x.UserId == teacher.TeacherId &&
                        db.Roles.Any(r => r.Id == x.RoleId && r.Name == "Professor")))
                    return Error("Instrutor não habilitado para o curso e a UC selecionada.");
            }
            var previousOffers = await db.ClassUnitOfferings.AsNoTracking().Where(x =>
                x.ClassGroupId == id && unitIds.Contains(x.CurricularUnitId)).ToListAsync();
            var item = new ClassGroup { ContinuityId = source.ContinuityId, PreviousClassGroupId = source.Id,
                Name = source.Name, Code = source.Code, NormalizedCode = source.NormalizedCode,
                Students = source.Students, CourseId = source.CourseId, CourseModuleId = input.CourseModuleId,
                SemesterId = input.SemesterId, ShiftId = input.ShiftId,
                UnitOfferings = unitIds.Select(unitId => {
                    var previous = previousOffers.Find(x => x.CurricularUnitId == unitId);
                    return new ClassUnitOffering { CurricularUnitId = unitId,
                        DeliveryMode = previous?.DeliveryMode ?? UnitDeliveryMode.Presencial,
                        EadScheduleMode = previous?.EadScheduleMode,
                        TeacherId = teachers.Find(x => x.CurricularUnitId == unitId)?.TeacherId };
                }).ToList() };
            db.Classes.Add(item);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("A turma já foi cadastrada ou continuada neste semestre. Atualize a lista."); }
            AuditTrail.Add(db, "ClassGroup", item.Id.ToString(), "Continuada", UserId(current),
                new { SourceClassGroupId = source.Id },
                new { item.ContinuityId, item.PreviousClassGroupId, item.SemesterId, item.CourseModuleId, item.ShiftId });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/classes/{item.Id}/history", new { item.Id });
        }).RequireAuthorization("Admin");
    }
}
