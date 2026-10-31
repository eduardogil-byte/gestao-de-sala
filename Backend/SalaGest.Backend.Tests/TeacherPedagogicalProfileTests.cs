using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authentication;
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

public sealed class TeacherPedagogicalProfileTests
{
    [Fact]
    public async Task AdminUpdatesProfileAndTeacherReadsOnlyOwnProfile()
    {
        await using var host = await ProfileHost.CreateAsync();
        var path = host.ProfilePath;
        host.AsAdmin();
        var updated = await host.Client.PutAsJsonAsync(path,
            new TeacherPedagogicalProfileInput(" Engenharia ", " CAD ", " Metrologia "));
        Assert.Equal(HttpStatusCode.NoContent, updated.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync(path,
            new TeacherPedagogicalProfileInput(new string('x', 2001), "", ""))).StatusCode);

        host.AsTeacher();
        var profile = await host.Client.GetFromJsonAsync<TeacherPedagogicalProfileResponse>(path);
        Assert.NotNull(profile);
        Assert.Equal("Engenharia", profile.Education);
        Assert.Equal("CAD", profile.TechnicalSkills);
        Assert.Equal("Metrologia", profile.ProfessionalKnowledge);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync(path,
            new TeacherPedagogicalProfileInput("Alteração", "", ""))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.GetAsync($"/api/teachers/{host.OtherTeacherId}/pedagogical-profile")).StatusCode);

        host.AsOtherTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(path)).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task QualificationsValidateReferencesDuplicatesAndCourseMembership()
    {
        await using var host = await ProfileHost.CreateAsync();
        host.AsAdmin();
        var path = host.ProfilePath;
        var coursePath = $"{path}/courses/{host.CourseId}";
        var unitPath = $"{coursePath}/curricular-units/{host.UnitId}";
        var capabilityPath = $"{path}/capabilities/{host.CapabilityId}";

        Assert.Equal(HttpStatusCode.NotFound,
            (await host.Client.PostAsync($"{path}/courses/99999", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.PostAsync(unitPath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsync(coursePath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsync(coursePath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await host.Client.PostAsync($"{coursePath}/curricular-units/99999", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await host.Client.PostAsync($"{path}/courses/{host.OtherCourseId}/curricular-units/{host.UnitId}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsync(unitPath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsync(unitPath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await host.Client.PostAsync($"{path}/capabilities/99999", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsync(capabilityPath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsync(capabilityPath, null)).StatusCode);

        var profile = await host.Client.GetFromJsonAsync<TeacherPedagogicalProfileResponse>(path);
        Assert.NotNull(profile);
        Assert.Contains(profile.Courses, x => x.CourseId == host.CourseId);
        Assert.Contains(profile.CurricularUnits, x => x.CurricularUnitId == host.UnitId && x.CourseId == host.CourseId);
        Assert.Contains(profile.Capabilities, x => x.CurricularCapabilityId == host.CapabilityId);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.DeleteAsync(coursePath)).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.DeleteAsync(unitPath)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.DeleteAsync(coursePath)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.DeleteAsync(capabilityPath)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.DeleteAsync(capabilityPath)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True(await db.Users.AnyAsync(x => x.Id == host.TeacherId));
        Assert.True(await db.Courses.AnyAsync(x => x.Id == host.CourseId));
        Assert.True(await db.CurricularUnits.AnyAsync(x => x.Id == host.UnitId));
        Assert.True(await db.CurricularCapabilities.AnyAsync(x => x.Id == host.CapabilityId));
        Assert.True(await db.Availabilities.AnyAsync(x => x.TeacherId == host.TeacherId));
    }

    [Fact]
    public async Task TeacherCannotChangeQualificationsAndCourseCanExistWithoutUnits()
    {
        await using var host = await ProfileHost.CreateAsync();
        var coursePath = $"{host.ProfilePath}/courses/{host.CourseId}";
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsync(coursePath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.DeleteAsync(coursePath)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.PostAsync($"{host.ProfilePath}/capabilities/{host.CapabilityId}", null)).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsync(coursePath, null)).StatusCode);
        var profile = await host.Client.GetFromJsonAsync<TeacherPedagogicalProfileResponse>(host.ProfilePath);
        Assert.NotNull(profile);
        Assert.Single(profile.Courses);
        Assert.Empty(profile.CurricularUnits);
    }

    [Fact]
    public async Task AuthenticationAndExistingQualificationsSurviveProfileUpdate()
    {
        await using var host = await ProfileHost.CreateAsync();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await host.Client.GetAsync(host.ProfilePath)).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.NotFound,
            (await host.Client.GetAsync("/api/teachers/missing/pedagogical-profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await host.Client.PostAsync($"{host.ProfilePath}/courses/{host.CourseId}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(host.ProfilePath,
            new TeacherPedagogicalProfileInput("Formação", "Habilidade", "Conhecimento"))).StatusCode);
        var profile = await host.Client.GetFromJsonAsync<TeacherPedagogicalProfileResponse>(host.ProfilePath);
        Assert.NotNull(profile);
        Assert.Equal("Formação", profile.Education);
        Assert.Single(profile.Courses);
    }

    private sealed class ProfileHost : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public string TeacherId { get; private set; } = "";
        public string OtherTeacherId { get; private set; } = "";
        public int CourseId { get; private set; }
        public int OtherCourseId { get; private set; }
        public int UnitId { get; private set; }
        public int CapabilityId { get; private set; }
        public string ProfilePath => $"/api/teachers/{TeacherId}/pedagogical-profile";

        private ProfileHost(WebApplication app, SqliteConnection connection)
        {
            App = app;
            this.connection = connection;
            Client = app.GetTestClient();
        }

        public static async Task<ProfileHost> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>()
                .AddRoles<IdentityRole>().AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            builder.Services.AddAuthentication("Test")
                .AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>("Test", _ => { });
            builder.Services.AddAuthorization(o => o.AddPolicy("Admin", p => p.RequireRole("Admin")));
            var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new ProfileHost(app, connection);
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            await roles.CreateAsync(new IdentityRole("Professor"));
            await roles.CreateAsync(new IdentityRole("Admin"));
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var teacher = new AppUser { UserName = "teacher", DisplayName = "João" };
            var other = new AppUser { UserName = "other", DisplayName = "Pedro" };
            Assert.True((await users.CreateAsync(teacher)).Succeeded);
            Assert.True((await users.CreateAsync(other)).Succeeded);
            Assert.True((await users.AddToRoleAsync(teacher, "Professor")).Succeeded);
            Assert.True((await users.AddToRoleAsync(other, "Professor")).Succeeded);
            host.TeacherId = teacher.Id;
            host.OtherTeacherId = other.Id;

            var course = new Course { Code = "C1", NormalizedCode = "C1", Name = "Mecânica", NormalizedName = "MECÂNICA" };
            var otherCourse = new Course { Code = "C2", NormalizedCode = "C2", Name = "Elétrica", NormalizedName = "ELÉTRICA" };
            var module = new CourseModule { Course = course, Name = "Módulo", NormalizedName = "MÓDULO", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U1", NormalizedCode = "U1",
                Name = "Desenho", NormalizedName = "DESENHO" };
            var capability = new CurricularCapability { CurricularUnit = unit, Description = "Modelos 3D",
                NormalizedDescription = "MODELOS 3D", Contents = "CAD", RequiredHours = 10, Order = 1 };
            db.Courses.AddRange(course, otherCourse);
            db.CurricularCapabilities.Add(capability);
            db.Shifts.Add(new SchoolShift { Name = "Manhã", StartsAt = new TimeOnly(8, 0), EndsAt = new TimeOnly(12, 0) });
            await db.SaveChangesAsync();
            db.Availabilities.Add(new TeacherAvailability { TeacherId = teacher.Id, Weekday = 1,
                ShiftId = await db.Shifts.Select(x => x.Id).FirstAsync() });
            await db.SaveChangesAsync();
            host.CourseId = course.Id;
            host.OtherCourseId = otherCourse.Id;
            host.UnitId = unit.Id;
            host.CapabilityId = capability.Id;
            return host;
        }

        public void AsAdmin() => SetIdentity("admin", "Admin");
        public void AsTeacher() => SetIdentity(TeacherId, "Professor");
        public void AsOtherTeacher() => SetIdentity(OtherTeacherId, "Professor");
        private void SetIdentity(string id, string role)
        {
            Client.DefaultRequestHeaders.Remove("X-Test-User");
            Client.DefaultRequestHeaders.Remove("X-Test-Role");
            Client.DefaultRequestHeaders.Add("X-Test-User", id);
            Client.DefaultRequestHeaders.Add("X-Test-Role", role);
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class HeaderAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-User", out var id) ||
                !Request.Headers.TryGetValue("X-Test-Role", out var role))
                return Task.FromResult(AuthenticateResult.NoResult());
            var claims = new[] { new Claim(ClaimTypes.NameIdentifier, id.ToString()),
                new Claim(ClaimTypes.Role, role.ToString()) };
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(
                new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name)), Scheme.Name)));
        }
    }
}
