using SalaGest.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Net.Http.Json;
using SalaGest.Api.Data;
using SalaGest.Api.Endpoints;
using SalaGest.Api.Models;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class InstitutionalSsoTests
{
    [Fact]
    public async Task LocalLoginStillIssuesProfessorSessionAndCannotAccessAdminIndicators()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
        builder.Services.AddIdentityCore<AppUser>(options => options.Password.RequiredLength = 8)
            .AddRoles<IdentityRole>().AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
        builder.Services.AddAuthentication(IdentityConstants.BearerScheme)
            .AddBearerToken(IdentityConstants.BearerScheme);
        builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
        builder.Services.AddAuthorization(options => options.AddPolicy("Admin", policy => policy.RequireRole("Admin")));
        builder.Services.Configure<InstitutionalSsoOptions>(_ => { });
        builder.Services.AddSingleton<InstitutionalLoginTickets>();
        builder.Services.AddScoped<ExcelReportService>();
        var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization(); app.MapSalaGestEndpoints();
        await app.StartAsync();
        try
        {
            using (var scope = app.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await db.Database.EnsureCreatedAsync();
                var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
                Assert.True((await roles.CreateAsync(new IdentityRole("Professor"))).Succeeded);
                var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
                var user = new AppUser { UserName = "professor@example.test", Email = "professor@example.test", DisplayName = "Professor" };
                Assert.True((await users.CreateAsync(user, "SalaGest123!")).Succeeded);
                Assert.True((await users.AddToRoleAsync(user, "Professor")).Succeeded);
            }

            var client = app.GetTestClient();
            Assert.Equal(System.Net.HttpStatusCode.Unauthorized,
                (await client.GetAsync("/api/occupancy-indicators/semesters/1")).StatusCode);
            var invalid = await client.PostAsJsonAsync("/api/auth/login", new { email = "professor@example.test", password = "senha-invalida" });
            Assert.Equal(System.Net.HttpStatusCode.Unauthorized, invalid.StatusCode);
            var response = await client.PostAsJsonAsync("/api/auth/login", new { email = "professor@example.test", password = "SalaGest123!" });
            Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
            using var payload = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var token = payload.RootElement.GetProperty("accessToken").GetString();
            Assert.False(string.IsNullOrWhiteSpace(token));

            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            var profile = await client.GetAsync("/api/me");
            Assert.Equal(System.Net.HttpStatusCode.OK, profile.StatusCode);
            using var me = System.Text.Json.JsonDocument.Parse(await profile.Content.ReadAsStringAsync());
            Assert.Contains("Professor", me.RootElement.GetProperty("roles").EnumerateArray().Select(x => x.GetString()));
            Assert.Equal(System.Net.HttpStatusCode.Forbidden,
                (await client.GetAsync("/api/occupancy-indicators/semesters/1")).StatusCode);
            var ssoConfig = await client.GetAsync("/api/auth/institutional/config");
            Assert.Equal(System.Net.HttpStatusCode.OK, ssoConfig.StatusCode);
            using var config = System.Text.Json.JsonDocument.Parse(await ssoConfig.Content.ReadAsStringAsync());
            Assert.False(config.RootElement.GetProperty("enabled").GetBoolean());
        }
        finally { await app.DisposeAsync(); }
    }

    [Fact]
    public void SsoIsDisabledWithoutConfiguration()
    {
        var options = new InstitutionalSsoOptions();

        Assert.False(options.Enabled);
    }

    [Fact]
    public void ProviderKeyIsStableAndScopedToValidatedIssuer()
    {
        var first = InstitutionalLoginTickets.ProviderKey("https://id.example.test/issuer-a");
        var sameIssuer = InstitutionalLoginTickets.ProviderKey("https://id.example.test/issuer-a");
        var otherIssuer = InstitutionalLoginTickets.ProviderKey("https://id.example.test/issuer-b");

        Assert.Equal(first, sameIssuer);
        Assert.NotEqual(first, otherIssuer);
        Assert.StartsWith("oidc:", first);
        Assert.DoesNotContain("@", first);
    }

    [Fact]
    public void SubjectKeyPreservesCaseSensitiveIdentifiersWithoutStoringTheSubject()
    {
        var lower = InstitutionalLoginTickets.SubjectKey("user-abc");
        var upper = InstitutionalLoginTickets.SubjectKey("User-abc");

        Assert.NotEqual(lower, upper);
        Assert.StartsWith("sub:", lower);
        Assert.DoesNotContain("user-abc", lower);
    }

    [Fact]
    public void LoginTicketIsOneTimeAndCannotBeUsedForAccountLinking()
    {
        var tickets = new InstitutionalLoginTickets();
        var code = tickets.Create("local-user-1", forLink: false);

        Assert.False(tickets.TryConsume(code, forLink: true, out _));
        Assert.False(tickets.TryConsume(code, forLink: false, out _));
    }

    [Fact]
    public void LinkTicketIsOneTimeAndCannotBeExchangedForALoginSession()
    {
        var tickets = new InstitutionalLoginTickets();
        var ticket = tickets.Create("local-user-1", forLink: true);

        Assert.False(tickets.TryConsume(ticket, forLink: false, out _));
        Assert.False(tickets.TryConsume(ticket, forLink: true, out _));
    }

    [Fact]
    public void EnablingSsoRequiresAnHttpsAuthorityAndClientCredentials()
    {
        var options = new InstitutionalSsoOptions { Enabled = true };

        Assert.Throws<InvalidOperationException>(() => options.Validate(isDevelopment: true));
    }

    [Fact]
    public void InsecureFrontendCallbackIsAllowedOnlyForDevelopmentLoopback()
    {
        var options = new InstitutionalSsoOptions
        {
            Enabled = true,
            Authority = "https://issuer.example.test",
            ClientId = "test-client",
            ClientSecret = "test-only-secret",
            FrontendCallbackUrl = "http://localhost:5173/",
        };

        options.Validate(isDevelopment: true);
        Assert.Throws<InvalidOperationException>(() => options.Validate(isDevelopment: false));
    }
}
