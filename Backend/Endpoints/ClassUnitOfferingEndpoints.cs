using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapClassUnitOfferings(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/classes/{id:int}/units", async (int id, AppDbContext db,
            System.Security.Claims.ClaimsPrincipal current) =>
        {
            var classGroup = await db.Classes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (classGroup is null) return Results.NotFound();
            var units = await db.ClassUnitOfferings.AsNoTracking()
                .Where(x => x.ClassGroupId == id).OrderBy(x => x.CurricularUnit.Code)
                .Select(x => new
                {
                    x.CurricularUnitId, x.CurricularUnit.Code, x.CurricularUnit.Name,
                    x.CurricularUnit.PlannedHours, x.DeliveryMode, x.EadScheduleMode, x.TeacherId,
                    Resources = x.CurricularUnit.ResourceRequirements.Select(r => new
                    { r.ResourceCatalogItemId, r.ResourceCatalogItem.Name,
                        Category = r.ResourceCatalogItem.Category, r.Quantity }).ToList()
                }).ToListAsync();
            return Results.Ok(new
            {
                classGroup.Id, classGroup.CourseId, classGroup.CourseModuleId,
                LegacyWithoutModule = classGroup.CourseModuleId is null,
                Units = units.Select(x => new
                {
                    x.CurricularUnitId, x.Code, x.Name, x.PlannedHours, x.DeliveryMode,
                    x.EadScheduleMode, x.Resources,
                    TeacherId = current.IsInRole("Admin") || x.TeacherId == UserId(current) ? x.TeacherId : null
                }),
                PresentialHours = units.Where(x => x.DeliveryMode == UnitDeliveryMode.Presencial)
                    .Sum(x => x.PlannedHours ?? 0),
                EadHours = units.Where(x => x.DeliveryMode == UnitDeliveryMode.Ead)
                    .Sum(x => x.PlannedHours ?? 0),
                UnitsWithoutHours = units.Count(x => x.PlannedHours is null)
            });
        }).RequireAuthorization();

        app.MapGet("/api/classes/{id:int}/units/{unitId:int}/eligible-teachers",
            async (int id, int unitId, AppDbContext db) =>
        {
            var offering = await db.ClassUnitOfferings.AsNoTracking()
                .Where(x => x.ClassGroupId == id && x.CurricularUnitId == unitId &&
                    x.ClassGroup.CourseModuleId == x.CurricularUnit.CourseModuleId)
                .Select(x => new { CourseId = x.ClassGroup.CourseId,
                    UnitCourseId = x.CurricularUnit.CourseModule.CourseId }).FirstOrDefaultAsync();
            if (offering is null || offering.CourseId != offering.UnitCourseId) return Results.NotFound();
            var teachers = await db.TeacherUnitQualifications.AsNoTracking()
                .Where(x => x.CurricularUnitId == unitId &&
                    db.TeacherCourseQualifications.Any(c => c.TeacherId == x.TeacherId && c.CourseId == offering.CourseId) &&
                    db.UserRoles.Any(role => role.UserId == x.TeacherId &&
                        db.Roles.Any(r => r.Id == role.RoleId && r.Name == "Professor")))
                .OrderBy(x => x.Teacher.DisplayName)
                .Select(x => new { x.TeacherId, x.Teacher.DisplayName }).ToListAsync();
            return Results.Ok(teachers);
        }).RequireAuthorization("Admin");

        app.MapPut("/api/classes/{id:int}/units/{unitId:int}/teacher",
            async (int id, int unitId, ClassUnitTeacherInput input, AppDbContext db,
                Microsoft.AspNetCore.Identity.UserManager<AppUser> users,
                System.Security.Claims.ClaimsPrincipal current) =>
        {
            if (string.IsNullOrWhiteSpace(input.TeacherId)) return Error("Selecione um instrutor habilitado");
            var offering = await db.ClassUnitOfferings.Include(x => x.ClassGroup)
                .Include(x => x.CurricularUnit).ThenInclude(x => x.CourseModule)
                .FirstOrDefaultAsync(x => x.ClassGroupId == id && x.CurricularUnitId == unitId);
            if (offering is null) return Results.NotFound();
            if (offering.ClassGroup.CourseModuleId != offering.CurricularUnit.CourseModuleId ||
                offering.ClassGroup.CourseId != offering.CurricularUnit.CourseModule.CourseId)
                return Error("A UC não pertence ao curso e módulo da turma");
            if (await db.Assignments.AnyAsync(x => x.ClassGroupId == id && x.CurricularUnitId == unitId &&
                x.EndedAtUtc == null))
                return CatalogConflict("A UC já possui atribuição pedagógica ativa; preserve a atribuição existente");
            if (await FindTeacher(users, input.TeacherId) is null ||
                !await db.TeacherCourseQualifications.AnyAsync(x => x.TeacherId == input.TeacherId &&
                    x.CourseId == offering.ClassGroup.CourseId) ||
                !await db.TeacherUnitQualifications.AnyAsync(x => x.TeacherId == input.TeacherId &&
                    x.CurricularUnitId == unitId))
                return Error("Instrutor não habilitado para o curso e a UC");
            if (offering.TeacherId == input.TeacherId)
                return CatalogConflict("Instrutor já atribuído a esta oferta");
            var previous = offering.TeacherId;
            offering.TeacherId = input.TeacherId;
            AuditTrail.Add(db, "ClassUnitOffering", $"{id}:{unitId}", "Instrutor atribuído", UserId(current),
                new { TeacherId = previous }, new { offering.TeacherId });
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }
}
