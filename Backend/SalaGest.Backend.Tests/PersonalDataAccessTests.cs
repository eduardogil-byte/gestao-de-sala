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
using SalaGest.Api.Data;
using SalaGest.Api.Endpoints;
using SalaGest.Api.Models;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class PersonalDataAccessTests
{
    [Fact]
    public async Task TeacherDirectoryHidesEmailsFromProfessorsAndKeepsThemForAdmins()
    {
        await using var host = await TestHost.CreateAsync();

        host.AsTeacher();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/teachers")).StatusCode);
        var teacherRows = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/teachers");
        Assert.NotNull(teacherRows);
        Assert.Null(teacherRows[0].GetProperty("email").GetString());

        host.AsAdmin();
        var adminRows = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/teachers");
        Assert.NotNull(adminRows);
        Assert.Equal("professor@example.test", adminRows[0].GetProperty("email").GetString());
    }

    [Fact]
    public async Task TeacherDirectoryStillRequiresAuthentication()
    {
        await using var host = await TestHost.CreateAsync();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await host.Client.GetAsync("/api/teachers")).StatusCode);
    }

    private sealed class TestHost : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        private readonly WebApplication app;
        public HttpClient Client { get; }

        private TestHost(WebApplication app, SqliteConnection connection)
        {
            this.app = app;
            this.connection = connection;
            Client = app.GetTestClient();
        }

        public static async Task<TestHost> CreateAsync()
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
                .AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>("Test", _ => { });
            builder.Services.AddScoped<SalaGest.Api.Services.ExcelReportService>();
            builder.Services.AddScoped<SalaGest.Api.Services.ScheduleGenerator>();
            builder.Services.AddSingleton<SalaGest.Api.Services.InstitutionalLoginTickets>();
            builder.Services.Configure<SalaGest.Api.Services.InstitutionalSsoOptions>(_ => { });
            builder.Services.AddAuthorization(options =>
                options.AddPolicy("Admin", policy => policy.RequireRole("Admin")));
            var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new TestHost(app, connection);

            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            var professorRole = new IdentityRole("Professor") { NormalizedName = "PROFESSOR" };
            db.Roles.Add(professorRole);
            var teacher = new AppUser
            {
                Id = "teacher-1",
                UserName = "professor@example.test",
                NormalizedUserName = "PROFESSOR@EXAMPLE.TEST",
                Email = "professor@example.test",
                NormalizedEmail = "PROFESSOR@EXAMPLE.TEST",
                DisplayName = "Professora Exemplo"
            };
            db.Users.Add(teacher);
            db.UserRoles.Add(new IdentityUserRole<string> { UserId = teacher.Id, RoleId = professorRole.Id });
            await db.SaveChangesAsync();
            return host;
        }

        public void AsTeacher() => SetRole("Professor");
        public void AsAdmin() => SetRole("Admin");

        private void SetRole(string role)
        {
            Client.DefaultRequestHeaders.Remove("X-Test-Role");
            Client.DefaultRequestHeaders.Add("X-Test-Role", role);
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class HeaderAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-Role", out var role))
                return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, "test"),
                new Claim(ClaimTypes.Role, role.ToString())
            }, "Test");
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
        }
    }
}
