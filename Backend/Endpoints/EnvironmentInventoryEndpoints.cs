using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapEnvironmentInventory(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization().WithTags("Inventário de ambientes");

        api.MapGet("/rooms/{roomId:int}/inventory", async (int roomId, AppDbContext db) =>
        {
            var room = await db.Rooms.AsNoTracking()
                .AsSplitQuery()
                .Include(r => r.Resources)
                .Include(r => r.ComputerGroups).ThenInclude(g => g.Software).ThenInclude(s => s.Software)
                .FirstOrDefaultAsync(r => r.Id == roomId);
            if (room is null) return Results.NotFound();
            return Results.Ok(new
            {
                room.Id, room.Name, room.Location, room.Purpose, room.Kind, room.Seats,
                InventoryComplete = room.Resources.Count > 0 || room.ComputerGroups.Count > 0,
                Resources = room.Resources.OrderBy(r => r.Type).ThenBy(r => r.Name).Select(ResourceView),
                ComputerGroups = room.ComputerGroups.OrderBy(g => g.Id).Select(GroupView)
            });
        });

        api.MapPost("/rooms/{roomId:int}/resources", async (int roomId,
            RoomResourceInput input, AppDbContext db) =>
        {
            var roomExists = await db.Rooms.AnyAsync(r => r.Id == roomId);
            if (!roomExists) return Results.NotFound();
            if (varError(input) is string error) return Results.BadRequest(new ApiError(error));
            var normalizedName = NormalizeInventoryKey(input.Name);
            var normalizedType = NormalizeInventoryKey(input.Type);
            if (await db.RoomResources.AnyAsync(r => r.RoomId == roomId &&
                    r.NormalizedName == normalizedName && r.NormalizedType == normalizedType))
                return Results.Conflict(new ApiError("Este recurso já está cadastrado no ambiente"));
            var item = CreateResource(roomId, input, normalizedName, normalizedType);
            db.RoomResources.Add(item);
            await db.SaveChangesAsync();
            return Results.Created($"/api/rooms/{roomId}/inventory", ResourceView(item));
        }).RequireAuthorization("Admin");

        api.MapPut("/resources/{id:int}", async (int id, RoomResourceInput input, AppDbContext db) =>
        {
            if (varError(input) is string error) return Results.BadRequest(new ApiError(error));
            var item = await db.RoomResources.FirstOrDefaultAsync(r => r.Id == id);
            if (item is null) return Results.NotFound();
            var normalizedName = NormalizeInventoryKey(input.Name);
            var normalizedType = NormalizeInventoryKey(input.Type);
            if (await db.RoomResources.AnyAsync(r => r.RoomId == item.RoomId && r.Id != id &&
                    r.NormalizedName == normalizedName && r.NormalizedType == normalizedType))
                return Results.Conflict(new ApiError("Este recurso já está cadastrado no ambiente"));
            UpdateResource(item, input, normalizedName, normalizedType);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        api.MapGet("/computer-groups/{id:int}", async (int id, AppDbContext db) =>
        {
            var group = await db.ComputerGroups.AsNoTracking().Include(g => g.Software)
                .ThenInclude(s => s.Software).FirstOrDefaultAsync(g => g.Id == id);
            return group is null ? Results.NotFound() : Results.Ok(GroupView(group));
        });

        api.MapPost("/rooms/{roomId:int}/computer-groups", async (int roomId,
            ComputerGroupInventoryInput input, AppDbContext db) =>
        {
            if (!await db.Rooms.AnyAsync(r => r.Id == roomId)) return Results.NotFound();
            if (GroupError(input) is string error) return Results.BadRequest(new ApiError(error));
            if (await db.ComputerGroups.AnyAsync(g => g.RoomId == roomId && g.Description == input.Description.Trim()))
                return Results.Conflict(new ApiError("Já existe um grupo de computadores com esta identificação"));
            var group = new ComputerGroup { RoomId = roomId };
            UpdateGroup(group, input);
            db.ComputerGroups.Add(group);
            await db.SaveChangesAsync();
            return Results.Created($"/api/computer-groups/{group.Id}", GroupView(group));
        }).RequireAuthorization("Admin");

        api.MapPut("/computer-groups/{id:int}", async (int id,
            ComputerGroupInventoryInput input, AppDbContext db) =>
        {
            if (GroupError(input) is string error) return Results.BadRequest(new ApiError(error));
            var group = await db.ComputerGroups.FirstOrDefaultAsync(g => g.Id == id);
            if (group is null) return Results.NotFound();
            if (await db.GroupSoftware.AnyAsync(s => s.ComputerGroupId == id &&
                    s.InstalledQuantity > input.Quantity))
                return Results.BadRequest(new ApiError("A quantidade do grupo não pode ficar abaixo das instalações já registradas"));
            if (await db.ComputerGroups.AnyAsync(g => g.RoomId == group.RoomId && g.Id != id &&
                    g.Description == input.Description.Trim()))
                return Results.Conflict(new ApiError("Já existe um grupo de computadores com esta identificação"));
            UpdateGroup(group, input);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        api.MapPut("/computer-groups/{id:int}/software", async (int id,
            List<GroupSoftwareInventoryInput> input, AppDbContext db) =>
        {
            var group = await db.ComputerGroups.Include(g => g.Software).FirstOrDefaultAsync(g => g.Id == id);
            if (group is null) return Results.NotFound();
            if (input is null || input.Select(x => x.SoftwareId).Distinct().Count() != input.Count ||
                input.Any(x => x.SoftwareId <= 0 || x.InstalledQuantity < 1 ||
                    x.InstalledQuantity > group.Quantity || x.LicenseQuantity is < 1 ||
                    (x.Version?.Length ?? 0) > 80))
                return Results.BadRequest(new ApiError("Softwares, instalações ou licenças inválidos"));
            var softwareIds = input.Select(x => x.SoftwareId).ToArray();
            if (await db.SoftwareCatalog.CountAsync(s => softwareIds.Contains(s.Id)) != softwareIds.Distinct().Count())
                return Results.BadRequest(new ApiError("Software não cadastrado"));
            db.GroupSoftware.RemoveRange(group.Software);
            group.Software = input.Select(x => new GroupSoftware
            {
                ComputerGroupId = group.Id,
                SoftwareId = x.SoftwareId,
                InstalledQuantity = x.InstalledQuantity,
                Version = OptionalText(x.Version),
                LicenseQuantity = x.LicenseQuantity,
                LicenseExpiresOn = x.LicenseExpiresOn
            }).ToList();
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }

    private static string? varError(RoomResourceInput input)
    {
        if (input is null || string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 120 ||
            string.IsNullOrWhiteSpace(input.Type) || input.Type.Trim().Length > 80 ||
            input.Quantity is < 0 or > 100000 || input.OperationalQuantity is < 0 ||
            (input.OperationalQuantity.HasValue && input.OperationalQuantity > input.Quantity) ||
            input.Voltage is < 1 or > 1000 || (input.Description?.Length ?? 0) > 500 ||
            (input.Condition?.Length ?? 0) > 80 || (input.TechnicalDetails?.Length ?? 0) > 2000)
            return "Dados do recurso inválidos";
        return null;
    }

    private static string? GroupError(ComputerGroupInventoryInput input)
    {
        if (input is null || string.IsNullOrWhiteSpace(input.Description) || input.Description.Trim().Length > 120 ||
            input.Quantity is < 1 or > 1000 || input.RamGb < 0 || !Enum.IsDefined(input.Tier) ||
            input.OperationalQuantity is < 0 || (input.OperationalQuantity.HasValue && input.OperationalQuantity > input.Quantity) ||
            (input.Processor?.Length ?? 0) > 160 || (input.Storage?.Length ?? 0) > 120 ||
            (input.GraphicsCard?.Length ?? 0) > 160 || (input.OperatingSystem?.Length ?? 0) > 120 ||
            (input.NetworkDetails?.Length ?? 0) > 500)
            return "Especificações do grupo de computadores inválidas";
        return null;
    }

    private static string NormalizeInventoryKey(string value)
        => string.Join(' ', value.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();

    private static string? OptionalText(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static RoomResource CreateResource(int roomId, RoomResourceInput input,
        string normalizedName, string normalizedType)
    {
        var item = new RoomResource { RoomId = roomId };
        UpdateResource(item, input, normalizedName, normalizedType);
        return item;
    }

    private static void UpdateResource(RoomResource item, RoomResourceInput input,
        string normalizedName, string normalizedType)
    {
        item.Name = input.Name.Trim();
        item.NormalizedName = normalizedName;
        item.Type = input.Type.Trim();
        item.NormalizedType = normalizedType;
        item.Quantity = input.Quantity;
        item.OperationalQuantity = input.OperationalQuantity;
        item.Description = OptionalText(input.Description);
        item.Condition = OptionalText(input.Condition);
        item.TechnicalDetails = OptionalText(input.TechnicalDetails);
        item.Voltage = input.Voltage;
        item.WarrantyExpiresOn = input.WarrantyExpiresOn;
        item.LicenseExpiresOn = input.LicenseExpiresOn;
    }

    private static void UpdateGroup(ComputerGroup group, ComputerGroupInventoryInput input)
    {
        group.Description = input.Description.Trim();
        group.Quantity = input.Quantity;
        group.RamGb = input.RamGb;
        group.Tier = input.Tier;
        group.DedicatedGpu = input.DedicatedGpu;
        group.OperationalQuantity = input.OperationalQuantity;
        group.Processor = OptionalText(input.Processor);
        group.Storage = OptionalText(input.Storage);
        group.GraphicsCard = OptionalText(input.GraphicsCard);
        group.OperatingSystem = OptionalText(input.OperatingSystem);
        group.Virtualization = input.Virtualization;
        group.DockerWsl = input.DockerWsl;
        group.CadCompatible = input.CadCompatible;
        group.SimulatorCompatible = input.SimulatorCompatible;
        group.NetworkDetails = OptionalText(input.NetworkDetails);
        group.InternetAvailable = input.InternetAvailable;
    }

    private static object ResourceView(RoomResource resource) => new
    {
        resource.Id, resource.RoomId, resource.Name, resource.Type, resource.Quantity,
        resource.OperationalQuantity, resource.Description, resource.Condition,
        resource.TechnicalDetails, resource.Voltage, resource.WarrantyExpiresOn, resource.LicenseExpiresOn
    };

    private static object GroupView(ComputerGroup group) => new
    {
        group.Id, group.RoomId, group.Description, group.Quantity, group.OperationalQuantity,
        group.RamGb, group.Tier, group.DedicatedGpu, group.Processor, group.Storage,
        group.GraphicsCard, group.OperatingSystem, group.Virtualization, group.DockerWsl,
        group.CadCompatible, group.SimulatorCompatible, group.NetworkDetails, group.InternetAvailable,
        Software = group.Software.Select(s => new
        {
            s.SoftwareId, Name = s.Software.Name, s.InstalledQuantity,
            s.Version, s.LicenseQuantity, s.LicenseExpiresOn
        })
    };
}
