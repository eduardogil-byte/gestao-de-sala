using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Endpoints;
using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class EnvironmentInventoryTests
{
    [Fact]
    public async Task RenamingCatalogTypeKeepsIdentityAndUpdatesLinkedResource()
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var input = new ResourceCatalogInput("Lousa digital", "Audiovisual", null);
        var created = await host.Client.PostAsJsonAsync("/api/resource-catalog", input);
        using var document = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = document.RootElement.GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync($"/api/rooms/{host.RoomId}/resources",
            new RoomResourceInput(input.Name, input.Category, 1, 1, ResourceCatalogItemId: id))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/resource-catalog/{id}",
            input with { Name = "Painel interativo" })).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var resource = await db.RoomResources.SingleAsync();
        Assert.Equal(id, resource.ResourceCatalogItemId);
        Assert.Equal("Painel interativo", resource.Name);
        Assert.Single(await db.ResourceCatalog.ToListAsync());
    }

    [Fact]
    public async Task CatalogIsAdminOnlyAndPreservesLinkedInventoryWhenDeactivated()
    {
        await using var host = await InventoryHost.CreateAsync();
        var catalogInput = new ResourceCatalogInput("Projetor", "Audiovisual", "Projeção da sala");
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/resource-catalog", catalogInput)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/resource-catalog")).StatusCode);

        host.AsAdmin();
        var created = await host.Client.PostAsJsonAsync("/api/resource-catalog", catalogInput);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var catalogDocument = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var catalogId = catalogDocument.RootElement.GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync("/api/resource-catalog",
            catalogInput with { Name = "  PROJETOR  " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/resource-catalog",
            catalogInput with { Name = "Sala ativa" })).StatusCode);

        var resource = new RoomResourceInput("Projetor", "Audiovisual", 2, 1, ResourceCatalogItemId: catalogId);
        var added = await host.Client.PostAsJsonAsync($"/api/rooms/{host.RoomId}/resources", resource);
        Assert.Equal(HttpStatusCode.Created, added.StatusCode);
        using var resourceDocument = JsonDocument.Parse(await added.Content.ReadAsStringAsync());
        var resourceId = resourceDocument.RootElement.GetProperty("id").GetInt32();
        Assert.Equal(catalogId, resourceDocument.RootElement.GetProperty("resourceCatalogItemId").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync($"/api/rooms/{host.RoomId}/resources",
            resource with { Name = "Internet" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync($"/api/resources/{resourceId}",
            resource with { OperationalQuantity = 3 })).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.True((await db.Rooms.FindAsync(host.RoomId))!.HasProjector);
        }

        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/resource-catalog/{catalogId}",
            catalogInput with { Active = false })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync($"/api/rooms/{host.RoomId}/resources",
            resource with { Name = "Projetor" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/resources/{resourceId}",
            resource with { Quantity = 3, OperationalQuantity = 0 })).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(catalogId, (await db.RoomResources.SingleAsync()).ResourceCatalogItemId);
            Assert.False((await db.Rooms.FindAsync(host.RoomId))!.HasProjector);
            Assert.Single(await db.AuditEntries.Where(a => a.EntityType == "ResourceCatalog" && a.Action == "Criado").ToListAsync());
        }
    }

    [Fact]
    public async Task ResourcesRequireAnExistingRoomValidQuantitiesAndUniqueIdentity()
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var input = new RoomResourceInput("Torno", "Máquina", 3, 2,
            TechnicalDetails: "Bancada de usinagem", Voltage: 220);
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.PostAsJsonAsync(
            "/api/rooms/999/resources", input)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync(
            $"/api/rooms/{host.RoomId}/resources", input with { Quantity = -1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync(
            $"/api/rooms/{host.RoomId}/resources", input with { OperationalQuantity = 4 })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync(
            $"/api/rooms/{host.RoomId}/resources", input)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/rooms/{host.RoomId}/resources", input with { Name = " Torno " })).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var resource = await db.RoomResources.SingleAsync(r => r.RoomId == host.RoomId);
            var audit = Assert.Single(await db.AuditEntries.Where(a => a.EntityType == "Resource" &&
                a.EntityId == resource.Id.ToString()).ToListAsync());
            Assert.Equal("Criado", audit.Action);
            Assert.Equal("inventory-test", audit.ActorId);
        }

        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync(
            $"/api/rooms/{host.RoomId}/resources", input with { Name = "Projetor" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync(
            $"/api/rooms/{host.RoomId}/inventory")).StatusCode);
        host.Client.DefaultRequestHeaders.Remove("X-Test-Role");
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync(
            "/api/rooms/999/inventory")).StatusCode);
    }

    [Fact]
    public async Task ComputerGroupsKeepDistinctSpecificationsSoftwareLicensesAndUpdates()
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var firstGroup = new ComputerGroupInventoryInput("16 GB", 15, 16,
            HardwareTier.Intermediario, false, 14, Processor: "Core i5", OperatingSystem: "Windows 11");
        var secondGroup = new ComputerGroupInventoryInput("8 GB", 10, 8,
            HardwareTier.Basico, false, 10, Processor: "Core i3", DockerWsl: false);
        var firstResponse = await host.Client.PostAsJsonAsync(
            $"/api/rooms/{host.RoomId}/computer-groups", firstGroup);
        var secondResponse = await host.Client.PostAsJsonAsync(
            $"/api/rooms/{host.RoomId}/computer-groups", secondGroup);
        var unknownRam = new ComputerGroupInventoryInput("RAM não informada", 2, 0,
            HardwareTier.Basico, false);
        var unknownRamResponse = await host.Client.PostAsJsonAsync(
            $"/api/rooms/{host.RoomId}/computer-groups", unknownRam);
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, secondResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, unknownRamResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/rooms/{host.RoomId}/computer-groups", firstGroup)).StatusCode);
        var first = await firstResponse.Content.ReadFromJsonAsync<GroupViewResponse>();
        var second = await secondResponse.Content.ReadFromJsonAsync<GroupViewResponse>();
        Assert.NotNull(first);
        Assert.NotNull(second);

        var softwareRoute = $"/api/computer-groups/{first.Id}/software";
        var assignment = new List<GroupSoftwareInventoryInput>
        {
            new(host.SolidWorksId, 12, "2025", 15, new DateOnly(2027, 12, 31))
        };
        Assert.Equal(HttpStatusCode.NoContent,
            (await host.Client.PutAsJsonAsync(softwareRoute, assignment)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.PutAsJsonAsync(softwareRoute,
                new List<GroupSoftwareInventoryInput> { assignment[0] with { InstalledQuantity = 16 } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.PutAsJsonAsync(softwareRoute,
                new List<GroupSoftwareInventoryInput> { assignment[0] with { SoftwareId = 999 } })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
            $"/api/computer-groups/{first.Id}", firstGroup with { RamGb = 32 })).StatusCode);
        using var inventory = System.Text.Json.JsonDocument.Parse(await (await host.Client.GetAsync(
            $"/api/rooms/{host.RoomId}/inventory")).Content.ReadAsStringAsync());
        var groups = inventory.RootElement.GetProperty("computerGroups");
        Assert.Equal(3, groups.GetArrayLength());
        var updated = groups.EnumerateArray().Single(x => x.GetProperty("id").GetInt32() == first.Id);
        Assert.Equal(32, updated.GetProperty("ramGb").GetInt32());
        Assert.Equal(host.SolidWorksId, updated.GetProperty("software")[0].GetProperty("softwareId").GetInt32());
        Assert.Equal("2025", updated.GetProperty("software")[0].GetProperty("version").GetString());
        Assert.Equal(0, groups.EnumerateArray().Single(x =>
            x.GetProperty("description").GetString() == "RAM não informada").GetProperty("ramGb").GetInt32());
        Assert.True(inventory.RootElement.GetProperty("inventoryComplete").GetBoolean());

        var roomUpdate = new RoomInput("Oficina", "Bloco A", RoomKind.Comum, 20, 10,
            false, false, false, true, new List<ComputerGroupInput>());
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
            $"/api/rooms/{host.RoomId}", roomUpdate)).StatusCode);
        using var afterRoomEdit = System.Text.Json.JsonDocument.Parse(await (await host.Client.GetAsync(
            $"/api/rooms/{host.RoomId}/inventory")).Content.ReadAsStringAsync());
        Assert.Equal(3, afterRoomEdit.RootElement.GetProperty("computerGroups").GetArrayLength());
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var changes = await db.AuditEntries.AsNoTracking().Where(a => a.EntityType == "ComputerGroup" &&
            a.EntityId == first.Id.ToString()).OrderBy(a => a.Id).ToListAsync();
        Assert.Equal(new[] { "Criado", "SoftwaresAlterados", "Alterado" },
            changes.Select(a => a.Action).ToArray());
        Assert.Contains("16", changes[2].BeforeJson);
        Assert.Contains("32", changes[2].AfterJson);
        Assert.Single(await db.AuditEntries.Where(a => a.EntityType == "Room" &&
            a.EntityId == host.RoomId.ToString()).ToListAsync());
    }

    [Fact]
    public async Task DeactivatingRoomNotifiesAffectedTeacherOnceWithoutCancellingOccupation()
    {
        await using var host = await InventoryHost.CreateAsync();
        int occupationId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new AppUser { Id = "affected", UserName = "affected", DisplayName = "Instrutor" });
            var startsAt = DateTime.Now.AddDays(10);
            var occupation = new RoomOccupation { RoomId = host.RoomId, TeacherId = "affected",
                StartsAt = startsAt, EndsAt = startsAt.AddHours(4), Kind = OccupationKind.Aula };
            db.Occupations.Add(occupation);
            await db.SaveChangesAsync();
            occupationId = occupation.Id;
        }
        host.AsAdmin();
        var update = new RoomInput("Oficina", "Bloco A", RoomKind.Comum, 20, 10,
            false, false, false, false, new List<ComputerGroupInput>());
        Assert.Equal(HttpStatusCode.NoContent,
            (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}", update)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}", update)).StatusCode);
        using var check = host.App.Services.CreateScope();
        var dbCheck = check.ServiceProvider.GetRequiredService<AppDbContext>();
        var notice = Assert.Single(await dbCheck.Notifications.Where(n => n.RelatedType == "Room" &&
            n.RelatedId == host.RoomId).ToListAsync());
        Assert.Equal("affected", notice.UserId);
        Assert.Single(await dbCheck.AuditEntries.Where(a => a.EntityType == "Room" &&
            a.EntityId == host.RoomId.ToString()).ToListAsync());
        Assert.Null((await dbCheck.Occupations.SingleAsync(o => o.Id == occupationId)).CancelledAtUtc);
    }

    private static ComputerGroupInventoryInput Technical(string name = "Grupo sintético", int? operational = 8)
        => new(name, 10, 16, HardwareTier.Alto, true, operational, "CPU", "SSD", "GPU", "SO", true, false,
            true, false, "Rede sintética", true);

    private static RoomInput RoomUpdate(RoomInventoryInput? inventory = null) => new(
        "Oficina", "Bloco A", RoomKind.Comum, 20, 10, false, false, false, true, new(), Inventory: inventory);

    private static async Task<JsonElement> Inventory(InventoryHost host)
        => (await host.Client.GetFromJsonAsync<JsonElement>($"/api/rooms/{host.RoomId}/inventory"));

    private static async Task<int> AddTechnicalGroup(InventoryHost host, int? operational = 8)
    {
        var response = await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}", RoomUpdate(new(
            ComputerGroups: [new(null, Technical(operational: operational),
                [new(host.SolidWorksId, 10, "2027", 10, new DateOnly(2027, 12, 31))])])));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        return (await Inventory(host)).GetProperty("computerGroups")[0].GetProperty("id").GetInt32();
    }

    [Fact]
    public async Task AggregateCreationRoundTripsCompleteInventoryAndGeneratedIds()
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var resource = new RoomResourceInput("Torno", "Máquina", 3, 2, "Descrição", "Boa",
            "Especificações", 220, new DateOnly(2028, 1, 1), new DateOnly(2027, 1, 1));
        var response = await host.Client.PostAsJsonAsync("/api/rooms", RoomUpdate(new(
            [new(null, Technical(), [new(host.SolidWorksId, 10, "2027", 10, new DateOnly(2027, 12, 31))])],
            [new(null, resource)])));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetInt32();
        var inventory = await host.Client.GetFromJsonAsync<JsonElement>($"/api/rooms/{id}/inventory");
        var group = inventory.GetProperty("computerGroups")[0];
        Assert.True(group.GetProperty("id").GetInt32() > 0);
        Assert.Equal(8, group.GetProperty("operationalQuantity").GetInt32());
        Assert.Equal("CPU", group.GetProperty("processor").GetString());
        Assert.False(group.GetProperty("dockerWsl").GetBoolean());
        Assert.Equal("Rede sintética", group.GetProperty("networkDetails").GetString());
        var software = group.GetProperty("software")[0];
        Assert.Equal(10, software.GetProperty("licenseQuantity").GetInt32());
        Assert.Equal("2027-12-31", software.GetProperty("licenseExpiresOn").GetString());
        Assert.Equal("2027", software.GetProperty("version").GetString());
        Assert.Equal(220, inventory.GetProperty("resources")[0].GetProperty("voltage").GetInt32());
        var room = await host.Client.GetFromJsonAsync<JsonElement>($"/api/rooms/{id}");
        Assert.Equal(8, room.GetProperty("computerGroups")[0].GetProperty("operationalQuantity").GetInt32());
    }

    [Fact]
    public async Task RenameByIdPreservesMetadataAndOmittedGroupsSoftwareAndResources()
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var id = await AddTechnicalGroup(host);
        var details = Technical("Nome alterado");
        var resource = new RoomResourceInput("Torno", "Máquina", 2, 1, TechnicalDetails: "Dados preservados");
        var resourceResponse = await host.Client.PostAsJsonAsync($"/api/rooms/{host.RoomId}/resources", resource);
        var resourceId = (await resourceResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}",
            RoomUpdate(new([new(id, details, Software: [])], [new(resourceId, resource with { Name = "Torno atualizado" })])))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}",
            RoomUpdate(new()))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}",
            RoomUpdate())).StatusCode);
        var inventory = await Inventory(host);
        var group = Assert.Single(inventory.GetProperty("computerGroups").EnumerateArray());
        Assert.Equal(id, group.GetProperty("id").GetInt32());
        Assert.Equal("Nome alterado", group.GetProperty("description").GetString());
        Assert.Equal(10, Assert.Single(group.GetProperty("software").EnumerateArray()).GetProperty("licenseQuantity").GetInt32());
        var persistedResource = Assert.Single(inventory.GetProperty("resources").EnumerateArray());
        Assert.Equal(resourceId, persistedResource.GetProperty("id").GetInt32());
        Assert.Equal("Torno atualizado", persistedResource.GetProperty("name").GetString());
        Assert.Equal("Dados preservados", persistedResource.GetProperty("technicalDetails").GetString());
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var audit = await db.AuditEntries.SingleAsync(a => a.EntityType == "ComputerGroup" && a.Action == "Alterado");
        Assert.Contains("Nome alterado", audit.AfterJson);
        Assert.Contains("licenseQuantity", audit.BeforeJson!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ExplicitRemovalsKeepAuditAndOccupationsAndCannotTargetAnotherRoom()
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var id = await AddTechnicalGroup(host);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}",
            RoomUpdate(new(RemovedGroupIds: [id + 1000])))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}",
            RoomUpdate(new([new(id, Technical(), RemovedSoftwareIds: [host.SolidWorksId])])))).StatusCode);
        Assert.Empty((await Inventory(host)).GetProperty("computerGroups")[0].GetProperty("software").EnumerateArray());
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.Add(new RoomOccupation { RoomId = host.RoomId, StartsAt = new DateTime(2027, 1, 1, 8, 0, 0),
                EndsAt = new DateTime(2027, 1, 1, 12, 0, 0), Kind = OccupationKind.Avulsa });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}",
            RoomUpdate(new(RemovedGroupIds: [id])))).StatusCode);
        Assert.Empty((await Inventory(host)).GetProperty("computerGroups").EnumerateArray());
        using var check = host.App.Services.CreateScope();
        var dbCheck = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Single(await dbCheck.Occupations.ToListAsync());
        var audit = await dbCheck.AuditEntries.SingleAsync(a => a.EntityType == "ComputerGroup" && a.Action == "Removido");
        Assert.Equal("Grupo sintético", JsonDocument.Parse(audit.BeforeJson!).RootElement.GetProperty("Group").GetProperty("Description").GetString());
        Assert.Contains(await dbCheck.AuditEntries.ToListAsync(), a => a.BeforeJson?.Contains("2027-12-31") == true);
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}",
            RoomUpdate(new(RemovedGroupIds: [id])))).StatusCode);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(11)]
    public async Task InvalidOperationalQuantityDoesNotPartiallyUpdateRoom(int operational)
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var input = RoomUpdate(new([new(null, Technical(operational: operational))])) with { Name = "Não deve persistir" };
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}", input)).StatusCode);
        Assert.Empty((await Inventory(host)).GetProperty("computerGroups").EnumerateArray());
        Assert.Equal("Oficina", (await Inventory(host)).GetProperty("name").GetString());
    }

    [Fact]
    public async Task LicenseValidationAndInventoryUpdatesFeedExistingCompatibilityRules()
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var id = await AddTechnicalGroup(host, operational: null);
        var need = new RoomNeed(8, false, false, true, HardwareTier.Basico, [host.SolidWorksId], 8, false);
        var date = new DateOnly(2027, 3, 1);
        async Task<bool> Compatible()
        {
            using var scope = host.App.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var room = await db.Rooms.Include(r => r.ComputerGroups).ThenInclude(g => g.Software).SingleAsync(r => r.Id == host.RoomId);
            var requirement = new CapabilityEnvironmentRequirement { RequiredComputers = 8, MinRamGb = 8,
                Software = [new CapabilitySoftwareRequirement { SoftwareId = host.SolidWorksId, RequiredLicenses = 8,
                    Software = new Software { Name = "CAD" }, Critical = true }] };
            var technical = EnvironmentCompatibility.Evaluate(requirement, room, 8, date);
            return RoomCompatibility.Incompatibility(room, need, date) is null && technical.Classification == "Compatible";
        }
        Assert.False(await Compatible());
        async Task<HttpStatusCode> Save(int? licenses, DateOnly? expiry) => (await host.Client.PutAsJsonAsync(
            $"/api/rooms/{host.RoomId}", RoomUpdate(new([new(id, Technical(), [new(host.SolidWorksId, 10, "2027", licenses, expiry)])])))).StatusCode;
        Assert.Equal(HttpStatusCode.BadRequest, await Save(0, null));
        Assert.Equal(HttpStatusCode.BadRequest, await Save(-1, null));
        Assert.Equal(HttpStatusCode.NoContent, await Save(null, null));
        Assert.False(await Compatible());
        Assert.Equal(HttpStatusCode.NoContent, await Save(10, date.AddDays(-1)));
        Assert.False(await Compatible());
        Assert.Equal(HttpStatusCode.NoContent, await Save(7, date));
        Assert.False(await Compatible());
        Assert.Equal(HttpStatusCode.NoContent, await Save(10, date));
        Assert.True(await Compatible());
        var invalidDate = JsonSerializer.Serialize(RoomUpdate(new([new(id, Technical(),
            [new(host.SolidWorksId, 10, "2027", 10, date)])]))).Replace("2027-03-01", "2027-02-30");
        var invalidResponse = await host.Client.PutAsync($"/api/rooms/{host.RoomId}",
            new StringContent(invalidDate, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, invalidResponse.StatusCode);
        Assert.True(await Compatible());
    }

    [Fact]
    public async Task InvalidOrForeignIdsDuplicatesAndNegativeQuantitiesAreRejectedWithoutDeletingInventory()
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var id = await AddTechnicalGroup(host);
        var otherResponse = await host.Client.PostAsJsonAsync("/api/rooms", RoomUpdate(new([new(null, Technical())])));
        var otherId = (await otherResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync($"/api/rooms/{otherId}",
            RoomUpdate(new([new(id, Technical())])))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync($"/api/rooms/{otherId}",
            RoomUpdate(new(RemovedGroupIds: [id])))).StatusCode);
        foreach (var inventory in new RoomInventoryInput[] {
            new([new(id, Technical()), new(id, Technical())]),
            new([new(null, Technical())]),
            new([new(null, Technical("Novo") with { Quantity = -1 })]),
            new([new(id, Technical(), [new(host.SolidWorksId, 11)])]),
            new([new(id, Technical(), RemovedSoftwareIds: [9999])]),
            new(Resources: [new(null, new RoomResourceInput("Inválido", "Máquina", -1))]),
        })
            Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}", RoomUpdate(inventory))).StatusCode);
        Assert.Equal(id, Assert.Single((await Inventory(host)).GetProperty("computerGroups").EnumerateArray()).GetProperty("id").GetInt32());
    }

    [Fact]
    public async Task OrdinaryBookingUsesUpdatedInventoryWithoutChangingConfirmationRules()
    {
        await using var host = await InventoryHost.CreateAsync();
        host.AsAdmin();
        var groupId = await AddTechnicalGroup(host, operational: null);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new AppUser { Id = "inventory-test", UserName = "synthetic", DisplayName = "Docente sintético" });
            db.Shifts.Add(new SchoolShift { Name = "Manhã", StartsAt = new TimeOnly(8, 0), EndsAt = new TimeOnly(12, 0) });
            await db.SaveChangesAsync();
        }
        host.AsTeacher();
        var bookingResponse = await host.Client.PostAsJsonAsync("/api/bookings", new BookingCreate(null,
            new DateTime(2027, 3, 1, 8, 0, 0), new DateTime(2027, 3, 1, 12, 0, 0), 8,
            false, false, true, HardwareTier.Basico, [host.SolidWorksId], "Aula sintética", null));
        Assert.Equal(HttpStatusCode.Created, bookingResponse.StatusCode);
        var bookingId = (await bookingResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var before = await host.Client.GetFromJsonAsync<JsonElement>($"/api/bookings/{bookingId}/suggestions");
        Assert.False(Assert.Single(before.EnumerateArray()).GetProperty("compatible").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync($"/api/bookings/{bookingId}/confirm",
            new ConfirmBooking(host.RoomId))).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/rooms/{host.RoomId}",
            RoomUpdate(new([new(groupId, Technical())])))).StatusCode);
        host.AsTeacher();
        var after = await host.Client.GetFromJsonAsync<JsonElement>($"/api/bookings/{bookingId}/suggestions");
        Assert.True(Assert.Single(after.EnumerateArray()).GetProperty("compatible").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync($"/api/bookings/{bookingId}/confirm",
            new ConfirmBooking(host.RoomId))).StatusCode);
        using var check = host.App.Services.CreateScope();
        var checkDb = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(BookingStatus.Aprovada, (await checkDb.Bookings.SingleAsync()).Status);
        Assert.Single(await checkDb.Occupations.ToListAsync());
    }

    private sealed record GroupViewResponse(int Id, int RoomId, string Description, int Quantity, int RamGb);

    private sealed class InventoryHost : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public int RoomId { get; private set; }
        public int SolidWorksId { get; private set; }

        private InventoryHost(WebApplication app, SqliteConnection connection)
        {
            App = app;
            this.connection = connection;
            Client = app.GetTestClient();
        }

        public static async Task<InventoryHost> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>().AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            builder.Services.AddAuthentication("Test")
                .AddScheme<AuthenticationSchemeOptions, InventoryAuthHandler>("Test", _ => { });
            builder.Services.AddAuthorization(options => options.AddPolicy("Admin", policy => policy.RequireRole("Admin")));
            var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new InventoryHost(app, connection);
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            var room = new Room { Name = "Oficina", Location = "Bloco A", Seats = 20, Desks = 10 };
            var software = new Software { Name = "SolidWorks" };
            db.AddRange(room, software);
            await db.SaveChangesAsync();
            host.RoomId = room.Id;
            host.SolidWorksId = software.Id;
            return host;
        }

        public void AsAdmin() => SetRole("Admin");
        public void AsTeacher() => SetRole("Professor");
        private void SetRole(string role)
        {
            Client.DefaultRequestHeaders.Remove("X-Test-Role");
            Client.DefaultRequestHeaders.Add("X-Test-Role", role);
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class InventoryAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-Role", out var role))
                return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, "inventory-test"),
                new Claim(ClaimTypes.Role, role.ToString()) }, "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(
                new ClaimsPrincipal(identity), "Test")));
        }
    }
}
