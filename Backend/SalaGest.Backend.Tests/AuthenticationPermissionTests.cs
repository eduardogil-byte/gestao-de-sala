using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SalaGest.Api.Data;
using SalaGest.Api.Endpoints;
using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class AuthenticationPermissionTests
{
    [Fact]
    public async Task ClassAndRoomCodesAreUniqueAndClassCorrectionKeepsIdentity()
    {
        await using var host = await Host.Create();
        await host.Login("admin");
        var semester = await host.Client.PostAsJsonAsync("/api/semesters", new
        {
            name = "2026/2", startDate = "2026-10-01", endDate = "2026-12-20"
        });
        Assert.Equal(HttpStatusCode.Created, semester.StatusCode);
        var semesterId = (await semester.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var shift = await host.Client.PostAsJsonAsync("/api/shifts", new { name = "Manhã", startsAt = "08:00:00", endsAt = "12:00:00" });
        Assert.Equal(HttpStatusCode.Created, shift.StatusCode);
        var shiftId = (await shift.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var first = await host.Client.PostAsJsonAsync("/api/classes", new { semesterId, code = "001", name = "Mecatrônica", students = 25, shiftId });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var classId = (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync("/api/classes",
            new { semesterId, code = " 001 ", name = "Outra", students = 20, shiftId })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/classes/{classId}",
            new { name = "Mecatrônica corrigida", code = "002" })).StatusCode);
        var room = new { code = "LAB-01", name = "Laboratório", location = "Bloco A", kind = 2,
            seats = 30, desks = 30, hasProjector = false, hasTeacherComputer = false,
            hasInternet = true, active = true, computerGroups = Array.Empty<object>() };
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/rooms", room)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync("/api/rooms",
            new { room.name, room.location, room.kind, room.seats, room.desks, room.hasProjector,
                room.hasTeacherComputer, room.hasInternet, room.active, room.computerGroups, code = "lab-01" })).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var saved = await db.Classes.SingleAsync();
            Assert.Equal(classId, saved.Id);
            Assert.Equal("002", saved.Code);
            Assert.Equal(25, saved.Students);
            Assert.Equal("LAB-01", (await db.Rooms.SingleAsync()).Code);
        }
        await host.Login("teacher");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync($"/api/classes/{classId}",
            new { name = "Indevido", code = "003" })).StatusCode);
    }
    [Fact]
    public async Task AdminBookingRequiresProfessorAndPreservesResponsibleTeacher()
    {
        await using var host = await Host.Create();
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Shifts.Add(new SchoolShift { Name = "Manhã", StartsAt = new TimeOnly(8, 0), EndsAt = new TimeOnly(12, 0) });
            await db.SaveChangesAsync();
        }
        var booking = new
        {
            startsAt = "2026-11-04T08:00:00", endsAt = "2026-11-04T12:00:00",
            students = 20, studentsPerComputer = 1, minTier = 1, softwareIds = Array.Empty<int>(),
            reason = "Aula", needsProjector = false, needsTeacherComputer = false,
            needsStudentComputers = false
        };
        await host.Login("admin");
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/bookings", booking)).StatusCode);
        string teacherId;
        string adminId;
        using (var scope = host.App.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            teacherId = (await users.FindByEmailAsync("teacher@example.test"))!.Id;
            adminId = (await users.FindByEmailAsync("admin@example.test"))!.Id;
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/bookings",
            new { booking.startsAt, booking.endsAt, booking.students, booking.studentsPerComputer,
                booking.minTier, booking.softwareIds, booking.reason, booking.needsProjector,
                booking.needsTeacherComputer, booking.needsStudentComputers, teacherId = adminId })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/bookings",
            new { booking.startsAt, booking.endsAt, booking.students, booking.studentsPerComputer,
                booking.minTier, booking.softwareIds, booking.reason, booking.needsProjector,
                booking.needsTeacherComputer, booking.needsStudentComputers, teacherId })).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(teacherId, (await db.Bookings.SingleAsync()).TeacherId);
            Assert.Equal(adminId, (await db.AuditEntries.SingleAsync(x => x.EntityType == "Booking")).ActorId);
        }
        await host.Login("teacher");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/bookings",
            new { booking.startsAt, booking.endsAt, booking.students, booking.studentsPerComputer,
                booking.minTier, booking.softwareIds, booking.reason, booking.needsProjector,
                booking.needsTeacherComputer, booking.needsStudentComputers, teacherId = adminId })).StatusCode);
    }
    [Fact]
    public async Task DevelopmentBootstrapCreatesAdminButNeverPromotesExistingProfessor()
    {
        await using var host = await Host.Create();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Seed:AdminEmail"] = "bootstrap@example.test",
            ["Seed:AdminPassword"] = "SalaGest123!"
        }).Build();
        // Only the isolated SQLite test database is used here, never a configured SQL Server.
        await DbSeed.InitializeAsync(host.App.Services, config);
        await host.Login("bootstrap");
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/auth/register",
            new { name = "Professor", email = "bootstrap-created@example.test", password = "SalaGest123!" })).StatusCode);
        config["Seed:AdminEmail"] = "teacher@example.test";
        await Assert.ThrowsAsync<InvalidOperationException>(() => DbSeed.InitializeAsync(host.App.Services, config));
        using var scope = host.App.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        Assert.False(await users.IsInRoleAsync((await users.FindByEmailAsync("teacher@example.test"))!, "Admin"));
    }

    [Fact]
    public async Task WrongLoginLocksAccountButWrongCurrentPasswordDoesNotIncrementFailures()
    {
        await using var host = await Host.Create();
        await host.Login("teacher");
        for (var i = 0; i < 6; i++)
            Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/auth/change-password",
                new { currentPassword = "wrong", newPassword = "Changed123!" })).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            Assert.Equal(0, await users.GetAccessFailedCountAsync((await users.FindByEmailAsync("teacher@example.test"))!));
        }
        host.Client.DefaultRequestHeaders.Authorization = null;
        for (var i = 0; i < 5; i++)
            Assert.Equal(i == 4 ? HttpStatusCode.TooManyRequests : HttpStatusCode.Unauthorized,
                (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "teacher@example.test", password = "wrong" })).StatusCode);
    }

    [Fact]
    public async Task RegistrationRequiresAdminAndNeverAcceptsClientRoles()
    {
        await using var host = await Host.Create();
        var input = new { name = "Novo professor", email = "new@example.test", password = "SalaGest123!", role = "Admin", roles = new[] { "Admin" } };
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/register", input)).StatusCode);
        await host.Login("teacher");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/auth/register", input)).StatusCode);
        await host.Login("admin");
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/auth/register", input)).StatusCode);
        Assert.Equal("admin@example.test", (await host.Client.GetFromJsonAsync<JsonElement>("/api/me")).GetProperty("email").GetString());
        using var scope = host.App.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var created = await users.FindByEmailAsync(input.email);
        Assert.NotNull(created);
        Assert.Equal(new[] { "Professor" }, await users.GetRolesAsync(created));
        await host.Login("new");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/auth/register", input)).StatusCode);
    }

    [Fact]
    public async Task RoleAssignmentFailureRollsBackUserAndAllowsRetry()
    {
        await using var host = await Host.Create();
        await host.Login("admin");
        var input = new { name = "Falha", email = "failure@example.test", password = "SalaGest123!" };
        host.Failure.Enabled = true;
        Assert.Equal(HttpStatusCode.InternalServerError, (await host.Client.PostAsJsonAsync("/api/auth/register", input)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
            Assert.Null(await scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>().FindByEmailAsync(input.email));
        host.Client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { input.email, input.password })).StatusCode);
        host.Failure.Enabled = false;
        await host.Login("admin");
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/auth/register", input)).StatusCode);
    }

    [Fact]
    public async Task RolelessAccountCannotUseOperationalRoutes()
    {
        await using var host = await Host.Create();
        await host.Login("roleless");
        foreach (var path in new[] { "/api/bookings", "/api/bookings/pedagogical-options", "/api/loans", "/api/occupations/1/history", "/api/semester-plans", "/api/agenda?from=2027-01-01&to=2027-01-02" })
            Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync("/api/teachers/roleless/availability", Array.Empty<object>())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/auth/register", new { name = "N", email = "x@example.test", password = "SalaGest123!" })).StatusCode);
    }

    [Theory]
    [InlineData("password")]
    [InlineData("remove-role")]
    [InlineData("remove-add-role")]
    [InlineData("delete")]
    [InlineData("disable")]
    [InlineData("stamp")]
    [InlineData("roles-with-same-stamp")]
    public async Task RevokedTokensCannotReadOrWrite(string reason)
    {
        await using var host = await Host.Create();
        await host.Login("admin");
        if (reason == "password")
            Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = "SalaGest123!", newPassword = "Changed123!" })).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var user = (await users.FindByEmailAsync("admin@example.test"))!;
            if (reason is "remove-role" or "remove-add-role")
                Assert.True((await users.RemoveFromRoleAsync(user, "Admin")).Succeeded);
            if (reason == "remove-add-role") Assert.True((await users.AddToRoleAsync(user, "Admin")).Succeeded);
            if (reason == "delete")
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.UserRoles.RemoveRange(await db.UserRoles.Where(x => x.UserId == user.Id).ToListAsync());
                await db.SaveChangesAsync();
                Assert.True((await users.DeleteAsync(user)).Succeeded);
            }
            // No Active column exists; indefinite Identity lockout is the existing disabling mechanism.
            if (reason == "disable") Assert.True((await users.SetLockoutEndDateAsync(user, DateTimeOffset.MaxValue)).Succeeded);
            if (reason == "stamp") Assert.True((await users.UpdateSecurityStampAsync(user)).Succeeded);
            if (reason == "roles-with-same-stamp")
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.UserRoles.RemoveRange(await db.UserRoles.Where(x => x.UserId == user.Id).ToListAsync());
                await db.SaveChangesAsync();
            }
        }
        await host.AssertRejectedWithoutWrites();
    }

    [Fact]
    public async Task TemporaryLockoutSuspendsButDoesNotRevokeToken()
    {
        await using var host = await Host.Create();
        await host.Login("admin");
        using (var scope = host.App.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            Assert.True((await users.SetLockoutEndDateAsync((await users.FindByEmailAsync("admin@example.test"))!, DateTimeOffset.UtcNow.AddMinutes(1))).Succeeded);
        }
        await host.AssertRejectedWithoutWrites();
        using (var scope = host.App.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            Assert.True((await users.SetLockoutEndDateAsync((await users.FindByEmailAsync("admin@example.test"))!, DateTimeOffset.UtcNow.AddMinutes(-1))).Succeeded);
        }
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/me")).StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TamperedTokenOrMissingStampIsRejected(bool missingStamp)
    {
        await using var host = await Host.Create();
        await host.Login("admin");
        var token = host.Client.DefaultRequestHeaders.Authorization!.Parameter!;
        if (missingStamp)
        {
            var options = host.App.Services.GetRequiredService<IOptionsMonitor<BearerTokenOptions>>().Get(IdentityConstants.BearerScheme);
            var ticket = options.BearerTokenProtector.Unprotect(token)!;
            var identity = (ClaimsIdentity)ticket.Principal.Identity!;
            var claimType = host.App.Services.GetRequiredService<IOptions<IdentityOptions>>().Value.ClaimsIdentity.SecurityStampClaimType;
            identity.RemoveClaim(identity.FindFirst(claimType)!);
            token = options.BearerTokenProtector.Protect(ticket);
        }
        else token = "invalid-token";
        host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        await host.AssertRejectedWithoutWrites();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task StoreFailureReturns503WithoutUsingOldPrivileges(bool rolesQuery)
    {
        await using var host = await Host.Create();
        await host.Login("admin");
        host.Failure.Reads = !rolesQuery;
        host.Failure.RoleReads = rolesQuery;
        await host.AssertRejectedWithoutWrites(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task DuplicateAndExceptionAfterRoleAssignmentLeaveNoPartialAccount()
    {
        await using var host = await Host.Create();
        await host.Login("admin");
        var input = new { name = "Professor", email = "duplicate@example.test", password = "SalaGest123!" };
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/auth/register", input)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync("/api/auth/register", input)).StatusCode);
        host.Failure.AfterRole = true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await host.Client.PostAsJsonAsync("/api/auth/register",
            new { name = "Failure", email = "exception@example.test", password = "SalaGest123!" })).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.Users.CountAsync(x => x.Email == input.email));
        Assert.False(await db.Users.AnyAsync(x => x.Email == "exception@example.test"));
        Assert.Equal(0, await db.UserRoles.CountAsync(x => !db.Users.Any(u => u.Id == x.UserId)));
    }

    [Fact]
    public async Task FailedStampUpdateRollsBackPermanentRoleChange()
    {
        await using var host = await Host.Create();
        using var scope = host.App.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var user = (await users.FindByEmailAsync("admin@example.test"))!;
        host.Failure.Stamp = true;
        await Assert.ThrowsAsync<InvalidOperationException>(() => users.RemoveFromRoleAsync(user, "Admin"));
        using var verify = host.App.Services.CreateScope();
        var persisted = verify.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        Assert.True(await persisted.IsInRoleAsync((await persisted.FindByEmailAsync("admin@example.test"))!, "Admin"));
    }

    [Fact]
    public async Task InstitutionalExchangeIssuesBearerSubjectToSameRevocation()
    {
        await using var host = await Host.Create();
        string userId;
        using (var scope = host.App.Services.CreateScope())
            userId = (await scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>().FindByEmailAsync("admin@example.test"))!.Id;
        var code = host.App.Services.GetRequiredService<InstitutionalLoginTickets>().Create(userId, forLink: false);
        var response = await host.Client.PostAsJsonAsync("/api/auth/institutional/exchange", new { code });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString());
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/me")).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            Assert.True((await users.UpdateSecurityStampAsync((await users.FindByIdAsync(userId))!)).Succeeded);
        }
        await host.AssertRejectedWithoutWrites();
    }

    [Fact]
    public async Task ExpiredTokenReturns401()
    {
        await using var host = await Host.Create(TimeSpan.FromSeconds(-1));
        await host.Login("teacher");
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync("/api/me")).StatusCode);
    }

    private sealed class FailureSwitch
    {
        public bool Enabled { get; set; }
        public bool Reads { get; set; }
        public bool RoleReads { get; set; }
        public bool AfterRole { get; set; }
        public bool Stamp { get; set; }
    }

    private sealed class TestUserManager(IUserStore<AppUser> store, IOptions<IdentityOptions> options,
        IPasswordHasher<AppUser> hasher, IEnumerable<IUserValidator<AppUser>> validators,
        IEnumerable<IPasswordValidator<AppUser>> passwordValidators, ILookupNormalizer normalizer,
        IdentityErrorDescriber errors, IServiceProvider services, ILogger<UserManager<AppUser>> logger,
        FailureSwitch failure, AppDbContext db) : SessionUserManager(store, options, hasher, validators, passwordValidators, normalizer, errors, services, logger, db)
    {
        public override async Task<IdentityResult> AddToRoleAsync(AppUser user, string role)
        {
            if (failure.Enabled) return IdentityResult.Failed(new IdentityError { Code = "TestFailure" });
            var result = await base.AddToRoleAsync(user, role);
            if (failure.AfterRole) throw new SqliteException("Internal test detail", 1);
            return result;
        }
        public override Task<AppUser?> FindByIdAsync(string userId) => failure.Reads
            ? throw new SqliteException("Internal test detail", 1) : base.FindByIdAsync(userId);
        public override Task<IList<string>> GetRolesAsync(AppUser user) => failure.RoleReads
            ? throw new SqliteException("Internal test detail", 1) : base.GetRolesAsync(user);
        public override Task<IdentityResult> UpdateSecurityStampAsync(AppUser user) => failure.Stamp
            ? Task.FromResult(IdentityResult.Failed(new IdentityError { Code = "StampFailure" })) : base.UpdateSecurityStampAsync(user);
    }

    private sealed class Host(WebApplication app, SqliteConnection connection, FailureSwitch failure) : IAsyncDisposable
    {
        public WebApplication App { get; } = app;
        public HttpClient Client { get; } = app.GetTestClient();
        public FailureSwitch Failure { get; } = failure;
        public async Task AssertRejectedWithoutWrites(HttpStatusCode status = HttpStatusCode.Unauthorized)
        {
            using var scope = App.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var count = await db.Users.CountAsync();
            Assert.Equal(status, (await Client.GetAsync("/api/me")).StatusCode);
            Assert.Equal(status, (await Client.GetAsync("/api/bookings")).StatusCode);
            var response = await Client.PostAsJsonAsync("/api/auth/register", new { name = "Forbidden", email = "blocked-write@example.test", password = "SalaGest123!" });
            Assert.Equal(status, response.StatusCode);
            Assert.DoesNotContain("Internal test detail", await response.Content.ReadAsStringAsync());
            Assert.Equal(count, await db.Users.CountAsync());
            Assert.False(await db.Users.AnyAsync(u => u.Email == "blocked-write@example.test"));
        }
        public async Task Login(string name)
        {
            Client.DefaultRequestHeaders.Authorization = null;
            var response = await Client.PostAsJsonAsync("/api/auth/login", new { email = $"{name}@example.test", password = "SalaGest123!" });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString());
        }
        public static async Task<Host> Create(TimeSpan? lifetime = null)
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer(); builder.Logging.ClearProviders();
            builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>(o => { o.Password.RequiredLength = 8; o.Lockout.MaxFailedAccessAttempts = 5; })
                .AddRoles<IdentityRole>().AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            var failure = new FailureSwitch();
            builder.Services.AddSingleton(failure);
            builder.Services.AddScoped<UserManager<AppUser>, TestUserManager>();
            builder.Services.AddAuthentication(IdentityConstants.BearerScheme).AddBearerToken(IdentityConstants.BearerScheme,
                o => { if (lifetime is not null) o.BearerTokenExpiration = lifetime.Value; });
            builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
            builder.Services.AddAuthorization(o => o.AddPolicy("Admin", p => p.RequireRole("Admin")));
            builder.Services.Configure<InstitutionalSsoOptions>(o => o.Enabled = true);
            builder.Services.AddSingleton<InstitutionalLoginTickets>(); builder.Services.AddScoped<ExcelReportService>();
            var app = builder.Build(); app.UseAuthentication(); app.UseMiddleware<BearerSessionValidationMiddleware>(); app.UseAuthorization(); app.MapSalaGestEndpoints();
            await app.StartAsync();
            using (var scope = app.Services.CreateScope())
            {
                await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreatedAsync();
                var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
                foreach (var role in new[] { "Admin", "Professor" }) Assert.True((await roles.CreateAsync(new IdentityRole(role))).Succeeded);
                var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
                foreach (var name in new[] { "admin", "teacher", "roleless" })
                {
                    var user = new AppUser { UserName = $"{name}@example.test", Email = $"{name}@example.test", DisplayName = name };
                    Assert.True((await users.CreateAsync(user, "SalaGest123!")).Succeeded);
                    if (name != "roleless") Assert.True((await users.AddToRoleAsync(user, name == "admin" ? "Admin" : "Professor")).Succeeded);
                }
            }
            return new Host(app, connection, failure);
        }
        public async ValueTask DisposeAsync() { Client.Dispose(); await App.DisposeAsync(); await connection.DisposeAsync(); }
    }
}
