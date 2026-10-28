using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
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
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class EnvironmentInventoryTests
{
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
