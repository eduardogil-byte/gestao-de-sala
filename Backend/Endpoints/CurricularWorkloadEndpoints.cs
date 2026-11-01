using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapCurricularWorkload(IEndpointRouteBuilder app)
    {
        var units = app.MapGroup("/api/courses/{courseId:int}/modules/{moduleId:int}/curricular-units/{unitId:int}")
            .RequireAuthorization().WithTags("Capacidades e carga horária");

        units.MapPut("/workload", async (int courseId, int moduleId, int unitId,
            CurricularUnitWorkloadInput input, AppDbContext db) =>
        {
            var unit = await db.CurricularUnits.FirstOrDefaultAsync(x => x.Id == unitId &&
                x.CourseModuleId == moduleId && x.CourseModule.CourseId == courseId);
            if (unit is null) return Results.NotFound();
            var error = PedagogicalCatalogRules.ValidateHours(input.PlannedHours, allowUndefined: true);
            if (error is not null) return Error(error);
            unit.PlannedHours = input.PlannedHours;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        units.MapGet("/workload-summary", async (int courseId, int moduleId, int unitId,
            decimal hoursPerShift, AppDbContext db) =>
        {
            if (!PedagogicalCatalogRules.ValidHoursPerShift(hoursPerShift))
                return Error("Horas por turno devem ser positivas, ter até duas casas decimais e não exceder 24");
            var unit = await db.CurricularUnits.AsNoTracking()
                .Where(x => x.Id == unitId && x.CourseModuleId == moduleId && x.CourseModule.CourseId == courseId)
                .Select(x => new { x.Id, x.PlannedHours }).FirstOrDefaultAsync();
            if (unit is null) return Results.NotFound();
            var hours = await db.CurricularCapabilities.AsNoTracking()
                .Where(x => x.CurricularUnitId == unitId).Select(x => x.RequiredHours).ToListAsync();
            return Results.Ok(PedagogicalCatalogRules.SummarizeWorkload(
                unit.Id, unit.PlannedHours, hours, hoursPerShift));
        });

        units.MapGet("/capabilities", async (int courseId, int moduleId, int unitId, AppDbContext db) =>
        {
            if (!await db.CurricularUnits.AnyAsync(x => x.Id == unitId &&
                x.CourseModuleId == moduleId && x.CourseModule.CourseId == courseId))
                return Results.NotFound();
            return Results.Ok(await db.CurricularCapabilities.AsNoTracking()
                .Where(x => x.CurricularUnitId == unitId).OrderBy(x => x.Order).ThenBy(x => x.Id)
                .Select(x => new CurricularCapabilityResponse(x.Id, x.CurricularUnitId,
                    x.Description, x.Contents, x.RequiredHours, x.Order)).ToListAsync());
        });

        units.MapGet("/capabilities/{capabilityId:int}", async (int courseId, int moduleId,
            int unitId, int capabilityId, AppDbContext db) =>
        {
            var item = await db.CurricularCapabilities.AsNoTracking()
                .Where(x => x.Id == capabilityId && x.CurricularUnitId == unitId &&
                    x.CurricularUnit.CourseModuleId == moduleId &&
                    x.CurricularUnit.CourseModule.CourseId == courseId)
                .Select(x => new CurricularCapabilityResponse(x.Id, x.CurricularUnitId,
                    x.Description, x.Contents, x.RequiredHours, x.Order)).FirstOrDefaultAsync();
            return item is null ? Results.NotFound() : Results.Ok(item);
        });

        units.MapPost("/capabilities", async (int courseId, int moduleId, int unitId,
            CurricularCapabilityInput input, AppDbContext db) =>
        {
            if (!await db.CurricularUnits.AnyAsync(x => x.Id == unitId &&
                x.CourseModuleId == moduleId && x.CourseModule.CourseId == courseId))
                return Results.NotFound();
            var error = PedagogicalCatalogRules.ValidateCapability(
                input.Description, input.Contents, input.RequiredHours, input.Order);
            if (error is not null) return Error(error);
            var description = input.Description.Trim();
            var key = PedagogicalCatalogRules.NormalizeKey(description);
            if (await db.CurricularCapabilities.AnyAsync(x => x.CurricularUnitId == unitId &&
                (x.NormalizedDescription == key || x.Order == input.Order)))
                return CatalogConflict("Capacidade com descrição ou ordem já cadastrada nesta unidade curricular");
            var item = new CurricularCapability
            {
                CurricularUnitId = unitId, Description = description, NormalizedDescription = key,
                Contents = input.Contents.Trim(), RequiredHours = input.RequiredHours, Order = input.Order
            };
            db.CurricularCapabilities.Add(item);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Capacidade com descrição ou ordem já cadastrada nesta unidade curricular"); }
            return Results.Created(
                $"/api/courses/{courseId}/modules/{moduleId}/curricular-units/{unitId}/capabilities/{item.Id}",
                CapabilityView(item));
        }).RequireAuthorization("Admin");

        units.MapPut("/capabilities/{capabilityId:int}", async (int courseId, int moduleId,
            int unitId, int capabilityId, CurricularCapabilityInput input, AppDbContext db) =>
        {
            var item = await db.CurricularCapabilities.FirstOrDefaultAsync(x => x.Id == capabilityId &&
                x.CurricularUnitId == unitId && x.CurricularUnit.CourseModuleId == moduleId &&
                x.CurricularUnit.CourseModule.CourseId == courseId);
            if (item is null) return Results.NotFound();
            var error = PedagogicalCatalogRules.ValidateCapability(
                input.Description, input.Contents, input.RequiredHours, input.Order);
            if (error is not null) return Error(error);
            var description = input.Description.Trim();
            var key = PedagogicalCatalogRules.NormalizeKey(description);
            if (await db.CurricularCapabilities.AnyAsync(x => x.CurricularUnitId == unitId &&
                x.Id != capabilityId && (x.NormalizedDescription == key || x.Order == input.Order)))
                return CatalogConflict("Capacidade com descrição ou ordem já cadastrada nesta unidade curricular");
            item.Description = description; item.NormalizedDescription = key;
            item.Contents = input.Contents.Trim(); item.RequiredHours = input.RequiredHours;
            item.Order = input.Order;
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return CatalogConflict("Capacidade com descrição ou ordem já cadastrada nesta unidade curricular"); }
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }

    private static CurricularCapabilityResponse CapabilityView(CurricularCapability item) =>
        new(item.Id, item.CurricularUnitId, item.Description, item.Contents, item.RequiredHours, item.Order);
}
