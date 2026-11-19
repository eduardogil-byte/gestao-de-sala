using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Endpoints;

public record UnitResourceInput(int ResourceCatalogItemId, int Quantity);

public static partial class ApiEndpoints
{
    private static void MapCurricularUnitResources(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/courses/{courseId:int}/modules/{moduleId:int}/curricular-units/{unitId:int}/resources")
            .RequireAuthorization().WithTags("Recursos da unidade curricular");
        api.MapGet("", async (int courseId, int moduleId, int unitId, AppDbContext db) =>
        {
            if (!await UnitExists(db, courseId, moduleId, unitId)) return Results.NotFound();
            return Results.Ok(await db.CurricularUnitResourceRequirements.AsNoTracking()
                .Where(x => x.CurricularUnitId == unitId)
                .OrderBy(x => x.ResourceCatalogItem.Category).ThenBy(x => x.ResourceCatalogItem.Name)
                .Select(x => new { x.ResourceCatalogItemId, x.ResourceCatalogItem.Name,
                    Category = x.ResourceCatalogItem.Category, x.Quantity }).ToListAsync());
        });
        api.MapPut("", async (int courseId, int moduleId, int unitId,
            List<UnitResourceInput> input, AppDbContext db) =>
        {
            if (!await UnitExists(db, courseId, moduleId, unitId)) return Results.NotFound();
            if (input is null || input.Count > 100 || input.Any(x => x is null || x.ResourceCatalogItemId <= 0 || x.Quantity is < 1 or > 100000) ||
                input.Select(x => x.ResourceCatalogItemId).Distinct().Count() != input.Count)
                return Error("Recursos da UC inválidos ou repetidos.");
            var ids = input.Select(x => x.ResourceCatalogItemId).ToArray();
            var existing = await db.CurricularUnitResourceRequirements.Where(x => x.CurricularUnitId == unitId).ToListAsync();
            var allowed = existing.Select(x => x.ResourceCatalogItemId).ToHashSet();
            if (await db.ResourceCatalog.CountAsync(x => ids.Contains(x.Id) && (x.Active || allowed.Contains(x.Id))) != ids.Length)
                return Error("Selecione recursos ativos do catálogo.");
            await using var transaction = await db.Database.BeginTransactionAsync();
            db.CurricularUnitResourceRequirements.RemoveRange(existing.Where(x => !ids.Contains(x.ResourceCatalogItemId)));
            foreach (var item in input)
            {
                var current = existing.FirstOrDefault(x => x.ResourceCatalogItemId == item.ResourceCatalogItemId);
                if (current is null)
                    db.CurricularUnitResourceRequirements.Add(new CurricularUnitResourceRequirement
                    { CurricularUnitId = unitId, ResourceCatalogItemId = item.ResourceCatalogItemId, Quantity = item.Quantity });
                else current.Quantity = item.Quantity;
            }
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }

    private static Task<bool> UnitExists(AppDbContext db, int courseId, int moduleId, int unitId) =>
        db.CurricularUnits.AnyAsync(x => x.Id == unitId && x.CourseModuleId == moduleId &&
            x.CourseModule.CourseId == courseId);
}
