using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapTeacherPedagogicalProfiles(IEndpointRouteBuilder app)
    {
        var teachers = app.MapGroup("/api/teachers/{teacherId}/pedagogical-profile")
            .RequireAuthorization().WithTags("Perfil pedagógico dos professores");

        teachers.MapGet("", async (string teacherId, ClaimsPrincipal current,
            UserManager<AppUser> users, AppDbContext db) =>
        {
            if (!CanReadTeacherProfile(current, teacherId)) return Results.Forbid();
            var teacher = await FindTeacher(users, teacherId);
            if (teacher is null) return Results.NotFound();
            var courses = await db.TeacherCourseQualifications.AsNoTracking()
                .Where(x => x.TeacherId == teacherId).OrderBy(x => x.Course.Name)
                .Select(x => new TeacherCourseQualificationResponse(x.CourseId, x.Course.Name)).ToListAsync();
            var units = await db.TeacherUnitQualifications.AsNoTracking()
                .Where(x => x.TeacherId == teacherId).OrderBy(x => x.CurricularUnit.Name)
                .Select(x => new TeacherUnitQualificationResponse(x.CurricularUnitId,
                    x.CurricularUnit.Name, x.CurricularUnit.CourseModule.CourseId,
                    x.CurricularUnit.CourseModule.Course.Name)).ToListAsync();
            var capabilities = await db.TeacherCapabilityQualifications.AsNoTracking()
                .Where(x => x.TeacherId == teacherId).OrderBy(x => x.CurricularCapability.Description)
                .Select(x => new TeacherCapabilityQualificationResponse(x.CurricularCapabilityId,
                    x.CurricularCapability.Description, x.CurricularCapability.CurricularUnitId)).ToListAsync();
            return Results.Ok(new TeacherPedagogicalProfileResponse(teacher.Id, teacher.DisplayName,
                teacher.Education, teacher.TechnicalSkills, teacher.ProfessionalKnowledge,
                courses, units, capabilities));
        });

        teachers.MapPut("", async (string teacherId, TeacherPedagogicalProfileInput input,
            UserManager<AppUser> users) =>
        {
            var teacher = await FindTeacher(users, teacherId);
            if (teacher is null) return Results.NotFound();
            if (!ValidTeacherProfile(input))
                return Error("Formação, habilidades e conhecimentos devem ter até 2000 caracteres cada");
            teacher.Education = input.Education?.Trim() ?? "";
            teacher.TechnicalSkills = input.TechnicalSkills?.Trim() ?? "";
            teacher.ProfessionalKnowledge = input.ProfessionalKnowledge?.Trim() ?? "";
            var result = await users.UpdateAsync(teacher);
            return result.Succeeded ? Results.NoContent() : Error("Não foi possível atualizar o perfil");
        }).RequireAuthorization("Admin");

        teachers.MapPost("/courses/{courseId:int}", async (string teacherId, int courseId,
            UserManager<AppUser> users, AppDbContext db) =>
        {
            if (await FindTeacher(users, teacherId) is null) return Results.NotFound();
            if (!await db.Courses.AnyAsync(x => x.Id == courseId)) return Results.NotFound();
            if (await db.TeacherCourseQualifications.AnyAsync(x => x.TeacherId == teacherId && x.CourseId == courseId))
                return CatalogConflict("Professor já habilitado para este curso");
            db.TeacherCourseQualifications.Add(new() { TeacherId = teacherId, CourseId = courseId });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Professor já habilitado para este curso"); }
            return Results.Created($"/api/teachers/{teacherId}/pedagogical-profile/courses/{courseId}",
                new { CourseId = courseId });
        }).RequireAuthorization("Admin");

        teachers.MapDelete("/courses/{courseId:int}", async (string teacherId, int courseId,
            AppDbContext db) =>
        {
            var item = await db.TeacherCourseQualifications.FindAsync(teacherId, courseId);
            if (item is null) return Results.NotFound();
            if (await db.TeacherUnitQualifications.AnyAsync(x => x.TeacherId == teacherId &&
                x.CurricularUnit.CourseModule.CourseId == courseId))
                return CatalogConflict("Remova antes as habilitações de UCs deste curso");
            db.TeacherCourseQualifications.Remove(item);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        teachers.MapPost("/courses/{courseId:int}/curricular-units/{unitId:int}",
            async (string teacherId, int courseId, int unitId, UserManager<AppUser> users, AppDbContext db) =>
        {
            if (await FindTeacher(users, teacherId) is null) return Results.NotFound();
            if (!await db.Courses.AnyAsync(x => x.Id == courseId) ||
                !await db.CurricularUnits.AnyAsync(x => x.Id == unitId && x.CourseModule.CourseId == courseId))
                return Results.NotFound();
            if (!await db.TeacherCourseQualifications.AnyAsync(x => x.TeacherId == teacherId && x.CourseId == courseId))
                return Error("Habilite o professor para o curso antes de vincular a UC");
            if (await db.TeacherUnitQualifications.AnyAsync(x => x.TeacherId == teacherId && x.CurricularUnitId == unitId))
                return CatalogConflict("Professor já habilitado para esta UC");
            db.TeacherUnitQualifications.Add(new() { TeacherId = teacherId, CurricularUnitId = unitId });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Professor já habilitado para esta UC"); }
            return Results.Created($"/api/teachers/{teacherId}/pedagogical-profile/courses/{courseId}/curricular-units/{unitId}",
                new { CourseId = courseId, CurricularUnitId = unitId });
        }).RequireAuthorization("Admin");

        teachers.MapDelete("/courses/{courseId:int}/curricular-units/{unitId:int}",
            async (string teacherId, int courseId, int unitId, AppDbContext db) =>
        {
            var item = await db.TeacherUnitQualifications.FirstOrDefaultAsync(x => x.TeacherId == teacherId &&
                x.CurricularUnitId == unitId && x.CurricularUnit.CourseModule.CourseId == courseId);
            if (item is null) return Results.NotFound();
            db.TeacherUnitQualifications.Remove(item);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        teachers.MapPost("/capabilities/{capabilityId:int}", async (string teacherId, int capabilityId,
            UserManager<AppUser> users, AppDbContext db) =>
        {
            if (await FindTeacher(users, teacherId) is null) return Results.NotFound();
            if (!await db.CurricularCapabilities.AnyAsync(x => x.Id == capabilityId)) return Results.NotFound();
            if (await db.TeacherCapabilityQualifications.AnyAsync(x => x.TeacherId == teacherId &&
                x.CurricularCapabilityId == capabilityId))
                return CatalogConflict("Professor já vinculado a esta capacidade");
            db.TeacherCapabilityQualifications.Add(new() { TeacherId = teacherId, CurricularCapabilityId = capabilityId });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Professor já vinculado a esta capacidade"); }
            return Results.Created($"/api/teachers/{teacherId}/pedagogical-profile/capabilities/{capabilityId}",
                new { CurricularCapabilityId = capabilityId });
        }).RequireAuthorization("Admin");

        teachers.MapDelete("/capabilities/{capabilityId:int}", async (string teacherId,
            int capabilityId, AppDbContext db) =>
        {
            var item = await db.TeacherCapabilityQualifications.FindAsync(teacherId, capabilityId);
            if (item is null) return Results.NotFound();
            db.TeacherCapabilityQualifications.Remove(item);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }

    private static async Task<AppUser?> FindTeacher(UserManager<AppUser> users, string teacherId)
    {
        var user = await users.FindByIdAsync(teacherId);
        return user is not null && await users.IsInRoleAsync(user, "Professor") ? user : null;
    }

    private static bool CanReadTeacherProfile(ClaimsPrincipal current, string teacherId) =>
        current.IsInRole("Admin") || (current.IsInRole("Professor") && UserId(current) == teacherId);

    private static bool ValidTeacherProfile(TeacherPedagogicalProfileInput input) =>
        (input.Education?.Trim().Length ?? 0) <= 2000 &&
        (input.TechnicalSkills?.Trim().Length ?? 0) <= 2000 &&
        (input.ProfessionalKnowledge?.Trim().Length ?? 0) <= 2000;
}
