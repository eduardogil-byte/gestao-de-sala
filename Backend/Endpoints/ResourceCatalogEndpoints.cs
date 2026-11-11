using System.Security.Claims;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapResourceCatalog(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/resource-catalog").RequireAuthorization().WithTags("Catálogo de recursos");
        api.MapGet("", async (AppDbContext db) => Results.Ok(await db.ResourceCatalog.AsNoTracking()
            .OrderBy(x => x.Category).ThenBy(x => x.Name)
            .Select(x => new { x.Id, x.Name, x.Category, x.Description, x.Active }).ToListAsync()));

        api.MapPost("", async (ResourceCatalogInput input, AppDbContext db, ClaimsPrincipal current) =>
        {
            if (ResourceCatalogError(input) is string error) return Error(error);
            var normalized = NormalizeInventoryKey(input.Name);
            if (await db.ResourceCatalog.AnyAsync(x => x.NormalizedName == normalized))
                return Results.Conflict(new ApiError("Já existe um recurso com este nome no catálogo."));
            var item = new ResourceCatalogItem { Name = input.Name.Trim(), NormalizedName = normalized,
                Category = input.Category.Trim(), Description = OptionalText(input.Description), Active = input.Active };
            db.ResourceCatalog.Add(item);
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync();
                await db.SaveChangesAsync();
                AuditTrail.Add(db, "ResourceCatalog", item.Id.ToString(), "Criado", UserId(current), null,
                    new { item.Name, item.Category, item.Description, item.Active });
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
            }
            catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
            { return Results.Conflict(new ApiError("Já existe um recurso com este nome no catálogo.")); }
            return Results.Created($"/api/resource-catalog/{item.Id}", new { item.Id, item.Name, item.Category, item.Description, item.Active });
        }).RequireAuthorization("Admin");

        api.MapPut("/{id:int}", async (int id, ResourceCatalogInput input, AppDbContext db, ClaimsPrincipal current) =>
        {
            if (ResourceCatalogError(input) is string error) return Error(error);
            var item = await db.ResourceCatalog.FindAsync(id);
            if (item is null) return Results.NotFound();
            var normalized = NormalizeInventoryKey(input.Name);
            if ((item.NormalizedName is "PROJETOR" or "PC DO INSTRUTOR" or "INTERNET") && normalized != item.NormalizedName)
                return Results.Conflict(new ApiError("O nome deste recurso é usado por campos legados de reservas; altere categoria, descrição ou situação sem renomeá-lo."));
            if ((normalized is "PROJETOR" or "PC DO INSTRUTOR" or "INTERNET") && normalized != item.NormalizedName)
                return Results.Conflict(new ApiError("Cadastre este recurso legado separadamente para preservar os dados de compatibilidade existentes."));
            if (await db.ResourceCatalog.AnyAsync(x => x.Id != id && x.NormalizedName == normalized))
                return Results.Conflict(new ApiError("Já existe um recurso com este nome no catálogo."));
            var before = new { item.Name, item.Category, item.Description, item.Active };
            await using var transaction = await db.Database.BeginTransactionAsync();
            item.Name = input.Name.Trim(); item.NormalizedName = normalized;
            item.Category = input.Category.Trim(); item.Description = OptionalText(input.Description);
            item.Active = input.Active;
            // Os nomes históricos continuam legíveis; o ID garante a identidade nas verificações.
            foreach (var resource in await db.RoomResources.Where(x => x.ResourceCatalogItemId == id).ToListAsync())
            {
                resource.Name = item.Name; resource.NormalizedName = normalized;
                resource.Type = item.Category; resource.NormalizedType = NormalizeInventoryKey(item.Category);
            }
            foreach (var requirement in await db.CapabilityResourceRequirements.Where(x => x.ResourceCatalogItemId == id).ToListAsync())
            {
                requirement.Name = item.Name; requirement.NormalizedName = normalized;
                requirement.Type = item.Category; requirement.NormalizedType = NormalizeInventoryKey(item.Category);
            }
            AuditTrail.Add(db, "ResourceCatalog", id.ToString(), "Alterado", UserId(current), before,
                new { item.Name, item.Category, item.Description, item.Active });
            try { await db.SaveChangesAsync(); await transaction.CommitAsync(); }
            catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
            { return Results.Conflict(new ApiError("Já existe um recurso com este nome no ambiente ou catálogo.")); }
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }

    private static string? ResourceCatalogError(ResourceCatalogInput? input)
    {
        if (input is null || string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 120 ||
            string.IsNullOrWhiteSpace(input.Category) || input.Category.Trim().Length > 80 ||
            (input.Description?.Length ?? 0) > 500 || NormalizeInventoryKey(input.Name) == "SALA ATIVA")
            return "Nome, categoria ou descrição do recurso inválidos. Sala ativa é um atributo do ambiente.";
        return null;
    }

    private static async Task<string?> ValidateCatalogSelection(AppDbContext db, RoomResourceInput input,
        int? existingCatalogItemId = null)
    {
        if (input.ResourceCatalogItemId is not int id) return null; // Contratos legados e importações seguem aceitos.
        var item = await db.ResourceCatalog.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (item is null || (!item.Active && existingCatalogItemId != id))
            return "Selecione um recurso ativo do catálogo.";
        if (NormalizeInventoryKey(input.Name) != item.NormalizedName ||
            NormalizeInventoryKey(input.Type) != NormalizeInventoryKey(item.Category))
            return "O nome e a categoria devem corresponder ao recurso selecionado no catálogo.";
        return null;
    }

    private static void SyncLegacyResourceFlags(Room room)
    {
        static bool? Operational(Room room, string name)
        {
            var entries = room.Resources.Where(x => x.NormalizedName == name).ToArray();
            return entries.Length == 0 ? null : entries.Any(x => x.OperationalQuantity > 0);
        }
        if (Operational(room, "PROJETOR") is bool projector) room.HasProjector = projector;
        if (Operational(room, "PC DO INSTRUTOR") is bool computer) room.HasTeacherComputer = computer;
        if (Operational(room, "INTERNET") is bool internet) room.HasInternet = internet;
    }
}
