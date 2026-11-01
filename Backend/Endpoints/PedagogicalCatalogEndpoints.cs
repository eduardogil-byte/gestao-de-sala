using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapPedagogicalCatalog(IEndpointRouteBuilder app)
    {
        var courses = app.MapGroup("/api/courses").RequireAuthorization().WithTags("Catálogo pedagógico");

        courses.MapGet("", async (AppDbContext db) => Results.Ok(await db.Courses.AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => new CourseResponse(x.Id, x.Code, x.Name, x.Active)).ToListAsync()));

        courses.MapGet("/{courseId:int}", async (int courseId, AppDbContext db) =>
        {
            var item = await db.Courses.AsNoTracking().Where(x => x.Id == courseId)
                .Select(x => new CourseResponse(x.Id, x.Code, x.Name, x.Active)).FirstOrDefaultAsync();
            return item is null ? Results.NotFound() : Results.Ok(item);
        });

        courses.MapPost("", async (CourseInput input, AppDbContext db) =>
        {
            var error = PedagogicalCatalogRules.ValidateCourse(input.Code, input.Name, input.Active);
            if (error is not null) return Error(error);
            var code = input.Code.Trim();
            var name = input.Name.Trim();
            var codeKey = PedagogicalCatalogRules.NormalizeKey(code);
            var nameKey = PedagogicalCatalogRules.NormalizeKey(name);
            if (await db.Courses.AnyAsync(x => x.NormalizedCode == codeKey || x.NormalizedName == nameKey))
                return CatalogConflict("Curso com código ou nome já cadastrado");
            var item = new Course
            {
                Code = code, NormalizedCode = codeKey, Name = name, NormalizedName = nameKey,
                Active = input.Active!.Value
            };
            db.Courses.Add(item);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Curso com código ou nome já cadastrado"); }
            return Results.Created($"/api/courses/{item.Id}", CourseView(item));
        }).RequireAuthorization("Admin");

        courses.MapPut("/{courseId:int}", async (int courseId, CourseInput input, AppDbContext db) =>
        {
            var item = await db.Courses.FindAsync(courseId);
            if (item is null) return Results.NotFound();
            var error = PedagogicalCatalogRules.ValidateCourse(input.Code, input.Name, input.Active);
            if (error is not null) return Error(error);
            var code = input.Code.Trim();
            var name = input.Name.Trim();
            var codeKey = PedagogicalCatalogRules.NormalizeKey(code);
            var nameKey = PedagogicalCatalogRules.NormalizeKey(name);
            if (await db.Courses.AnyAsync(x => x.Id != courseId &&
                (x.NormalizedCode == codeKey || x.NormalizedName == nameKey)))
                return CatalogConflict("Curso com código ou nome já cadastrado");
            item.Code = code; item.NormalizedCode = codeKey;
            item.Name = name; item.NormalizedName = nameKey; item.Active = input.Active!.Value;
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Curso com código ou nome já cadastrado"); }
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        courses.MapGet("/{courseId:int}/modules", async (int courseId, AppDbContext db) =>
        {
            if (!await db.Courses.AnyAsync(x => x.Id == courseId)) return Results.NotFound();
            return Results.Ok(await db.CourseModules.AsNoTracking().Where(x => x.CourseId == courseId)
                .OrderBy(x => x.Order).ThenBy(x => x.Id)
                .Select(x => new CourseModuleResponse(x.Id, x.CourseId, x.Name, x.Order)).ToListAsync());
        });

        courses.MapGet("/{courseId:int}/modules/{moduleId:int}",
            async (int courseId, int moduleId, AppDbContext db) =>
        {
            var item = await db.CourseModules.AsNoTracking()
                .Where(x => x.Id == moduleId && x.CourseId == courseId)
                .Select(x => new CourseModuleResponse(x.Id, x.CourseId, x.Name, x.Order))
                .FirstOrDefaultAsync();
            return item is null ? Results.NotFound() : Results.Ok(item);
        });

        courses.MapPost("/{courseId:int}/modules", async (int courseId,
            CourseModuleInput input, AppDbContext db) =>
        {
            if (!await db.Courses.AnyAsync(x => x.Id == courseId)) return Results.NotFound();
            var error = PedagogicalCatalogRules.ValidateModule(input.Name, input.Order);
            if (error is not null) return Error(error);
            var name = input.Name.Trim();
            var nameKey = PedagogicalCatalogRules.NormalizeKey(name);
            if (await db.CourseModules.AnyAsync(x => x.CourseId == courseId &&
                (x.NormalizedName == nameKey || x.Order == input.Order)))
                return CatalogConflict("Módulo com nome ou ordem já cadastrado neste curso");
            var item = new CourseModule
            {
                CourseId = courseId, Name = name, NormalizedName = nameKey, Order = input.Order
            };
            db.CourseModules.Add(item);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Módulo com nome ou ordem já cadastrado neste curso"); }
            return Results.Created($"/api/courses/{courseId}/modules/{item.Id}", ModuleView(item));
        }).RequireAuthorization("Admin");

        courses.MapPut("/{courseId:int}/modules/{moduleId:int}", async (int courseId,
            int moduleId, CourseModuleInput input, AppDbContext db) =>
        {
            var item = await db.CourseModules.FirstOrDefaultAsync(x => x.Id == moduleId && x.CourseId == courseId);
            if (item is null) return Results.NotFound();
            var error = PedagogicalCatalogRules.ValidateModule(input.Name, input.Order);
            if (error is not null) return Error(error);
            var name = input.Name.Trim();
            var nameKey = PedagogicalCatalogRules.NormalizeKey(name);
            if (await db.CourseModules.AnyAsync(x => x.CourseId == courseId && x.Id != moduleId &&
                (x.NormalizedName == nameKey || x.Order == input.Order)))
                return CatalogConflict("Módulo com nome ou ordem já cadastrado neste curso");
            item.Name = name; item.NormalizedName = nameKey; item.Order = input.Order;
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Módulo com nome ou ordem já cadastrado neste curso"); }
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        courses.MapGet("/{courseId:int}/modules/{moduleId:int}/curricular-units",
            async (int courseId, int moduleId, AppDbContext db) =>
        {
            if (!await db.CourseModules.AnyAsync(x => x.Id == moduleId && x.CourseId == courseId))
                return Results.NotFound();
            return Results.Ok(await db.CurricularUnits.AsNoTracking()
                .Where(x => x.CourseModuleId == moduleId).OrderBy(x => x.Code)
                .Select(x => new CurricularUnitResponse(x.Id, x.CourseModuleId, x.Code, x.Name, x.PlannedHours))
                .ToListAsync());
        });

        courses.MapGet("/{courseId:int}/modules/{moduleId:int}/curricular-units/{unitId:int}",
            async (int courseId, int moduleId, int unitId, AppDbContext db) =>
        {
            var item = await db.CurricularUnits.AsNoTracking()
                .Where(x => x.Id == unitId && x.CourseModuleId == moduleId && x.CourseModule.CourseId == courseId)
                .Select(x => new CurricularUnitResponse(x.Id, x.CourseModuleId, x.Code, x.Name, x.PlannedHours))
                .FirstOrDefaultAsync();
            return item is null ? Results.NotFound() : Results.Ok(item);
        });

        courses.MapPost("/{courseId:int}/modules/{moduleId:int}/curricular-units",
            async (int courseId, int moduleId, CurricularUnitInput input, AppDbContext db) =>
        {
            if (!await db.CourseModules.AnyAsync(x => x.Id == moduleId && x.CourseId == courseId))
                return Results.NotFound();
            var error = PedagogicalCatalogRules.ValidateCurricularUnit(input.Code, input.Name);
            if (error is not null) return Error(error);
            var code = input.Code.Trim();
            var name = input.Name.Trim();
            var codeKey = PedagogicalCatalogRules.NormalizeKey(code);
            var nameKey = PedagogicalCatalogRules.NormalizeKey(name);
            if (await db.CurricularUnits.AnyAsync(x => x.CourseModuleId == moduleId &&
                (x.NormalizedCode == codeKey || x.NormalizedName == nameKey)))
                return CatalogConflict("Unidade curricular com código ou nome já cadastrado neste módulo");
            var item = new CurricularUnit
            {
                CourseModuleId = moduleId, Code = code, NormalizedCode = codeKey,
                Name = name, NormalizedName = nameKey
            };
            db.CurricularUnits.Add(item);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Unidade curricular com código ou nome já cadastrado neste módulo"); }
            return Results.Created($"/api/courses/{courseId}/modules/{moduleId}/curricular-units/{item.Id}", UnitView(item));
        }).RequireAuthorization("Admin");

        courses.MapPut("/{courseId:int}/modules/{moduleId:int}/curricular-units/{unitId:int}",
            async (int courseId, int moduleId, int unitId, CurricularUnitInput input, AppDbContext db) =>
        {
            var item = await db.CurricularUnits.FirstOrDefaultAsync(x => x.Id == unitId &&
                x.CourseModuleId == moduleId && x.CourseModule.CourseId == courseId);
            if (item is null) return Results.NotFound();
            var error = PedagogicalCatalogRules.ValidateCurricularUnit(input.Code, input.Name);
            if (error is not null) return Error(error);
            var code = input.Code.Trim();
            var name = input.Name.Trim();
            var codeKey = PedagogicalCatalogRules.NormalizeKey(code);
            var nameKey = PedagogicalCatalogRules.NormalizeKey(name);
            if (await db.CurricularUnits.AnyAsync(x => x.CourseModuleId == moduleId && x.Id != unitId &&
                (x.NormalizedCode == codeKey || x.NormalizedName == nameKey)))
                return CatalogConflict("Unidade curricular com código ou nome já cadastrado neste módulo");
            item.Code = code; item.NormalizedCode = codeKey;
            item.Name = name; item.NormalizedName = nameKey;
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Unidade curricular com código ou nome já cadastrado neste módulo"); }
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }

    private static CourseResponse CourseView(Course item) =>
        new(item.Id, item.Code, item.Name, item.Active);
    private static CourseModuleResponse ModuleView(CourseModule item) =>
        new(item.Id, item.CourseId, item.Name, item.Order);
    private static CurricularUnitResponse UnitView(CurricularUnit item) =>
        new(item.Id, item.CourseModuleId, item.Code, item.Name, item.PlannedHours);
    private static IResult CatalogConflict(string message) => Results.Conflict(new ApiError(message));
    private static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is SqlException { Number: 2601 or 2627 };
}
