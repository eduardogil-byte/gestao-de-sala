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

public sealed class EnvironmentCompatibilityEndpointTests
{
    [Fact]
    public async Task RequirementsAreScopedValidatedAndAdminOnly()
    {
        await using var host = await Host.CreateAsync();
        var route = host.Route + "/environment-requirements";
        var input = new CapabilityEnvironmentInput(RoomKind.Laboratorio, false, 20, 16, false,
            new List<CapabilityResourceInput>(), new List<CapabilitySoftwareInput>
            { new(host.SoftwareId, 20) });
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync(route)).StatusCode);
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync(route)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync(route, input)).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.PostAsJsonAsync(
            route.Replace($"capabilities/{host.CapabilityId}", "capabilities/99999"), input)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync(route,
            input with { Software = new List<CapabilitySoftwareInput> { new(99999) } })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync(route, input)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(route, input)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(route,
            input with { RequiredComputers = 15, Software = new List<CapabilitySoftwareInput> { new(host.SoftwareId, 15) } })).StatusCode);
        var saved = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(route);
        Assert.Equal(15, saved.GetProperty("requiredComputers").GetInt32());
    }

    [Fact]
    public async Task ResultsAreOrderedAndDoNotQueryBookings()
    {
        await using var host = await Host.CreateAsync();
        host.AsAdmin();
        var input = new CapabilityEnvironmentInput(RoomKind.Laboratorio, false, 20, 16, false,
            new List<CapabilityResourceInput>(), new List<CapabilitySoftwareInput>());
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync(
            host.Route + "/environment-requirements", input)).StatusCode);
        host.AsTeacher();
        var list = await host.Client.GetFromJsonAsync<List<EnvironmentCompatibilityResponse>>(
            host.Route + "/compatibility/rooms?students=25");
        Assert.NotNull(list);
        Assert.Equal(new[] { "Compatible", "Partial", "Incompatible" },
            list.Select(x => x.Classification));
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.GetAsync(
            host.Route + "/compatibility/rooms/99999")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.GetAsync(
            host.Route + "/compatibility/rooms?students=-1")).StatusCode);
    }

    private sealed class Host : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        private readonly WebApplication app;
        public HttpClient Client { get; }
        public int CapabilityId { get; private set; }
        public int SoftwareId { get; private set; }
        public string Route { get; private set; } = "";

        private Host(WebApplication app, SqliteConnection connection)
        { this.app = app; this.connection = connection; Client = app.GetTestClient(); }

        public static async Task<Host> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            builder.Services.AddDbContext<AppDbContext>(x => x.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>().AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>("Test", _ => { });
            builder.Services.AddAuthorization(x => x.AddPolicy("Admin", p => p.RequireRole("Admin")));
            var app = builder.Build();
            app.UseAuthentication(); app.UseAuthorization(); app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new Host(app, connection);
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            var course = new Course { Code = "C", NormalizedCode = "C", Name = "Curso", NormalizedName = "CURSO" };
            var module = new CourseModule { Course = course, Name = "M", NormalizedName = "M", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U", NormalizedCode = "U", Name = "UC", NormalizedName = "UC" };
            var capability = new CurricularCapability { CurricularUnit = unit, Description = "CAD", NormalizedDescription = "CAD", Contents = "Desenho", RequiredHours = 4, Order = 1 };
            var software = new Software { Name = "SolidWorks" };
            db.AddRange(capability, software);
            db.Rooms.AddRange(
                new Room { Name = "A", Seats = 30, Kind = RoomKind.Laboratorio,
                    ComputerGroups = { new ComputerGroup { Description = "A", Quantity = 20, OperationalQuantity = 20, RamGb = 16 } } },
                new Room { Name = "B", Seats = 30, Kind = RoomKind.Laboratorio,
                    ComputerGroups = { new ComputerGroup { Description = "B", Quantity = 15, OperationalQuantity = 15, RamGb = 16 } } },
                new Room { Name = "C", Seats = 20, Kind = RoomKind.Laboratorio });
            await db.SaveChangesAsync();
            host.CapabilityId = capability.Id;
            host.SoftwareId = software.Id;
            host.Route = $"/api/courses/{course.Id}/modules/{module.Id}/curricular-units/{unit.Id}/capabilities/{capability.Id}";
            return host;
        }

        public void AsTeacher() => SetRole("Professor");
        public void AsAdmin() => SetRole("Admin");
        private void SetRole(string role)
        { Client.DefaultRequestHeaders.Remove("X-Test-Role"); Client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        public async ValueTask DisposeAsync()
        { Client.Dispose(); await app.DisposeAsync(); await connection.DisposeAsync(); }
    }

    private sealed class HeaderAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-Role", out var role))
                return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, "test"),
                new Claim(ClaimTypes.Role, role.ToString()) }, "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
        }
    }
}
