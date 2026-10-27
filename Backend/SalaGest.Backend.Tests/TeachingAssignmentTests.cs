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
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class TeachingAssignmentTests
{
    [Fact]
    public async Task MultipleTeachersClassesUnitsAndDaysAreQueryableWithQualificationAlert()
    {
        await using var host = await AssignmentHost.CreateAsync();
        host.AsAdmin();
        var first = await host.CreateAssignment(host.TeacherId, host.ClassId, host.UnitId, 3);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var firstView = await first.Content.ReadFromJsonAsync<AssignmentResponse>();
        Assert.NotNull(firstView);
        Assert.False(firstView.QualificationWarning);
        Assert.Equal(host.SemesterId, firstView.SemesterId);
        Assert.Equal(host.CourseId, firstView.CourseId);

        var second = await host.CreateAssignment(host.OtherTeacherId, host.ClassId, host.OtherUnitId, 4);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        var secondView = await second.Content.ReadFromJsonAsync<AssignmentResponse>();
        Assert.True(secondView!.QualificationWarning);
        Assert.Equal(HttpStatusCode.Created,
            (await host.CreateAssignment(host.TeacherId, host.OtherClassId, host.OtherUnitId, 5)).StatusCode);
        var byClass = await host.Client.GetFromJsonAsync<List<AssignmentResponse>>(
            $"/api/assignments?classGroupId={host.ClassId}");
        Assert.NotNull(byClass);
        Assert.Equal(2, byClass.Count);
        Assert.Contains(byClass, a => a.TeacherId == host.TeacherId && a.Weekday == 3);
        Assert.Contains(byClass, a => a.TeacherId == host.OtherTeacherId && a.Weekday == 4);
        var byTeacher = await host.Client.GetFromJsonAsync<List<AssignmentResponse>>(
            $"/api/assignments?teacherId={host.TeacherId}");
        Assert.Equal(2, byTeacher!.Count);
        var bySemester = await host.Client.GetFromJsonAsync<List<AssignmentResponse>>(
            $"/api/assignments?semesterId={host.SemesterId}");
        Assert.Equal(3, bySemester!.Count);
        var otherSemester = await host.Client.GetFromJsonAsync<List<AssignmentResponse>>(
            $"/api/assignments?semesterId={host.OtherSemesterId}");
        Assert.Empty(otherSemester!);

        host.AsTeacher();
        var own = await host.Client.GetFromJsonAsync<List<AssignmentResponse>>("/api/assignments");
        Assert.Equal(2, own!.Count);
        Assert.All(own, a => Assert.Equal(host.TeacherId, a.TeacherId));
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.GetAsync($"/api/assignments?teacherId={host.OtherTeacherId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.GetAsync($"/api/assignments/{secondView.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.CreateAssignment(host.TeacherId, host.ClassId, host.UnitId, 2)).StatusCode);
    }

    [Fact]
    public async Task InvalidReferencesCourseMismatchDuplicatesAndSlotCollisionsAreRejected()
    {
        await using var host = await AssignmentHost.CreateAsync();
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.CreateAssignment("missing", host.ClassId, host.UnitId, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.CreateAssignment(host.TeacherId, 99999, host.UnitId, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await host.CreateAssignment(host.TeacherId, host.ClassId, 99999, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.CreateAssignment(host.TeacherId, host.ClassId, host.ForeignUnitId, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.CreateAssignment(host.TeacherId, host.ClassId, host.UnitId, 0)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.PostAsJsonAsync("/api/assignments", new
            { ClassGroupId = host.ClassId, TeacherId = host.TeacherId, CurricularUnitId = host.UnitId,
                Weekday = 3, PreferredShiftId = 99999 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.CreateAssignment(host.TeacherId, host.ClassWithoutCourseId, host.UnitId, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.PutAsJsonAsync($"/api/classes/{host.ClassWithoutCourseId}/course",
                new ClassCourseInput(99999))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await host.Client.PutAsJsonAsync($"/api/classes/{host.ClassWithoutCourseId}/course",
                new ClassCourseInput(host.CourseId))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.Client.PutAsJsonAsync($"/api/classes/{host.ClassWithoutCourseId}/course",
                new ClassCourseInput(host.OtherCourseId))).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await host.CreateAssignment(host.TeacherId, host.ClassId, host.UnitId, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.CreateAssignment(host.TeacherId, host.ClassId, host.UnitId, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.CreateAssignment(host.OtherTeacherId, host.ClassId, host.OtherUnitId, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.CreateAssignment(host.TeacherId, host.OtherClassId, host.OtherUnitId, 3)).StatusCode);
    }

    [Fact]
    public async Task UpdateAndEndPreserveExistingBookingsAndHistoricalAssignments()
    {
        await using var host = await AssignmentHost.CreateAsync();
        host.AsAdmin();
        var created = await host.CreateAssignment(host.TeacherId, host.ClassId, host.UnitId, 3);
        var item = (await created.Content.ReadFromJsonAsync<AssignmentResponse>())!;
        var updated = await host.Client.PutAsJsonAsync($"/api/assignments/{item.Id}/pedagogical",
            new PedagogicalAssignmentUpdate(host.OtherTeacherId, host.OtherUnitId, 4, host.ShiftId));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.True((await updated.Content.ReadFromJsonAsync<AssignmentResponse>())!.QualificationWarning);
        Assert.Equal(HttpStatusCode.NoContent,
            (await host.Client.PostAsync($"/api/assignments/{item.Id}/end", null)).StatusCode);
        var ended = await host.Client.GetFromJsonAsync<AssignmentResponse>($"/api/assignments/{item.Id}");
        Assert.NotNull(ended);
        Assert.NotNull(ended.EndedAtUtc);
        Assert.Empty((await host.Client.GetFromJsonAsync<List<AssignmentResponse>>(
            "/api/assignments?activeOnly=true"))!);
        Assert.Equal(HttpStatusCode.Created,
            (await host.CreateAssignment(host.OtherTeacherId, host.ClassId, host.OtherUnitId, 4)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True(await db.Assignments.AnyAsync(a => a.Id == item.Id));
        Assert.True(await db.Bookings.AnyAsync(b => b.Id == host.BookingId && b.Status == BookingStatus.Aprovada));
        Assert.True(await db.Users.AnyAsync(u => u.Id == host.TeacherId));
        Assert.True(await db.CurricularUnits.AnyAsync(u => u.Id == host.UnitId));
    }

    [Fact]
    public async Task PublishedWeeklyClassBlocksChangesAndLegacyAssignmentRemainsReadable()
    {
        await using var host = await AssignmentHost.CreateAsync();
        host.AsAdmin();
        var item = (await (await host.CreateAssignment(host.TeacherId, host.ClassId, host.UnitId, 3))
            .Content.ReadFromJsonAsync<AssignmentResponse>())!;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var room = new Room { Name = "Sala", Location = "Bloco", Seats = 30, Desks = 30 };
            var schedule = new Schedule { SemesterId = host.SemesterId, Status = ScheduleStatus.Publicada };
            db.WeeklyClasses.Add(new WeeklyClass { Schedule = schedule, AssignmentId = item.Id,
                Weekday = 3, ShiftId = host.ShiftId, Room = room });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Created,
            (await host.Client.PostAsJsonAsync("/api/assignments", new
            {
                ClassGroupId = host.ClassWithoutCourseId, TeacherId = host.TeacherId,
                DisciplineName = "Disciplina legada", MeetingsPerWeek = 1,
                PreferredShiftId = (int?)null, NeedsProjector = false,
                NeedsTeacherComputer = false, NeedsStudentComputers = false,
                MinTier = HardwareTier.Basico, SoftwareIds = Array.Empty<int>(),
                LessonPlanLink = (string?)null
            })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.Client.PutAsJsonAsync($"/api/assignments/{item.Id}/pedagogical",
                new PedagogicalAssignmentUpdate(host.OtherTeacherId, host.UnitId, 4, host.ShiftId))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.Client.PostAsync($"/api/assignments/{item.Id}/end", null)).StatusCode);
        var all = await host.Client.GetFromJsonAsync<List<AssignmentResponse>>("/api/assignments");
        Assert.Contains(all!, a => a.DisciplineName == "Disciplina legada" &&
            a.CurricularUnitId is null && a.IsQualifiedForUnit is null);
    }

    [Fact]
    public async Task ExistingGeneratorUsesAssignedWeekdayAndIgnoresEndedAssignments()
    {
        await using var host = await AssignmentHost.CreateAsync();
        host.AsAdmin();
        var item = (await (await host.CreateAssignment(host.TeacherId, host.ClassId, host.UnitId, 3))
            .Content.ReadFromJsonAsync<AssignmentResponse>())!;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Rooms.Add(new Room { Name = "Sala", Location = "Bloco", Seats = 30, Desks = 30,
                Kind = RoomKind.Comum, Active = true });
            db.Availabilities.AddRange(
                new TeacherAvailability { TeacherId = host.TeacherId, Weekday = 2, ShiftId = host.ShiftId },
                new TeacherAvailability { TeacherId = host.TeacherId, Weekday = 3, ShiftId = host.ShiftId });
            await db.SaveChangesAsync();
            var (schedule, error) = await new ScheduleGenerator(db).GenerateAsync(host.SemesterId);
            Assert.Null(error);
            Assert.NotNull(schedule);
            Assert.Single(schedule.WeeklyClasses);
            Assert.Equal(3, schedule.WeeklyClasses[0].Weekday);
            schedule.Status = ScheduleStatus.Arquivada;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.NoContent,
            (await host.Client.PostAsync($"/api/assignments/{item.Id}/end", null)).StatusCode);
        using var secondScope = host.App.Services.CreateScope();
        var secondDb = secondScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var (_, afterEndError) = await new ScheduleGenerator(secondDb).GenerateAsync(host.SemesterId);
        Assert.Equal("Cadastre pelo menos uma disciplina atribuída a uma turma", afterEndError);
    }

    [Fact]
    public async Task DatabaseRejectsDuplicateAndIncompletePedagogicalSlots()
    {
        await using var host = await AssignmentHost.CreateAsync();
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.Created,
            (await host.CreateAssignment(host.TeacherId, host.ClassId, host.UnitId, 3)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Assignments.Add(new TeachingAssignment { ClassGroupId = host.ClassId,
                TeacherId = host.TeacherId, CurricularUnitId = host.UnitId,
                DisciplineName = "Desenho", Weekday = 3, PreferredShiftId = host.ShiftId });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Assignments.Add(new TeachingAssignment { ClassGroupId = host.OtherClassId,
                TeacherId = host.TeacherId, CurricularUnitId = host.UnitId,
                DisciplineName = "Desenho", PreferredShiftId = host.ShiftId });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    private sealed class AssignmentHost : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public string TeacherId { get; private set; } = "";
        public string OtherTeacherId { get; private set; } = "";
        public int CourseId { get; private set; }
        public int OtherCourseId { get; private set; }
        public int ClassId { get; private set; }
        public int OtherClassId { get; private set; }
        public int ClassWithoutCourseId { get; private set; }
        public int SemesterId { get; private set; }
        public int OtherSemesterId { get; private set; }
        public int UnitId { get; private set; }
        public int OtherUnitId { get; private set; }
        public int ForeignUnitId { get; private set; }
        public int ShiftId { get; private set; }
        public int BookingId { get; private set; }

        private AssignmentHost(WebApplication app, SqliteConnection connection)
        {
            App = app;
            this.connection = connection;
            Client = app.GetTestClient();
        }

        public static async Task<AssignmentHost> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
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
            var host = new AssignmentHost(app, connection);
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

            var course = new Course { Code = "C1", NormalizedCode = "C1", Name = "Mecânica", NormalizedName = "MECANICA" };
            var otherCourse = new Course { Code = "C2", NormalizedCode = "C2", Name = "Elétrica", NormalizedName = "ELETRICA" };
            var module = new CourseModule { Course = course, Name = "Módulo", NormalizedName = "MODULO", Order = 1 };
            var foreignModule = new CourseModule { Course = otherCourse, Name = "Outro", NormalizedName = "OUTRO", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U1", NormalizedCode = "U1",
                Name = "Desenho", NormalizedName = "DESENHO" };
            var otherUnit = new CurricularUnit { CourseModule = module, Code = "U2", NormalizedCode = "U2",
                Name = "Metrologia", NormalizedName = "METROLOGIA" };
            var foreignUnit = new CurricularUnit { CourseModule = foreignModule, Code = "U3", NormalizedCode = "U3",
                Name = "Circuitos", NormalizedName = "CIRCUITOS" };
            var semester = new Semester { Name = "2027.1", StartDate = new DateOnly(2027, 1, 1),
                EndDate = new DateOnly(2027, 6, 30) };
            var otherSemester = new Semester { Name = "2027.2", StartDate = new DateOnly(2027, 7, 1),
                EndDate = new DateOnly(2027, 12, 31) };
            var classGroup = new ClassGroup { Name = "M1", Students = 25, Course = course, Semester = semester };
            var otherClass = new ClassGroup { Name = "M2", Students = 20, Course = course, Semester = semester };
            var classWithoutCourse = new ClassGroup { Name = "Legada", Students = 18, Semester = semester };
            var shift = new SchoolShift { Name = "Manhã", StartsAt = new TimeOnly(8, 0), EndsAt = new TimeOnly(12, 0) };
            db.CurricularUnits.AddRange(unit, otherUnit, foreignUnit);
            db.Classes.AddRange(classGroup, otherClass, classWithoutCourse);
            db.Semesters.Add(otherSemester);
            db.Shifts.Add(shift);
            await db.SaveChangesAsync();
            db.TeacherUnitQualifications.Add(new TeacherUnitQualification { TeacherId = teacher.Id, CurricularUnitId = unit.Id });
            var booking = new BookingRequest { TeacherId = teacher.Id, ClassGroupId = classGroup.Id,
                StartsAt = new DateTime(2027, 3, 3, 8, 0, 0), EndsAt = new DateTime(2027, 3, 3, 12, 0, 0),
                Students = 25, Reason = "Reserva anterior", Status = BookingStatus.Aprovada };
            db.Bookings.Add(booking);
            await db.SaveChangesAsync();
            host.CourseId = course.Id; host.OtherCourseId = otherCourse.Id;
            host.ClassId = classGroup.Id; host.OtherClassId = otherClass.Id;
            host.ClassWithoutCourseId = classWithoutCourse.Id;
            host.SemesterId = semester.Id; host.OtherSemesterId = otherSemester.Id;
            host.UnitId = unit.Id; host.OtherUnitId = otherUnit.Id;
            host.ForeignUnitId = foreignUnit.Id; host.ShiftId = shift.Id;
            host.BookingId = booking.Id;
            return host;
        }

        public Task<HttpResponseMessage> CreateAssignment(string teacherId, int classId, int unitId, int weekday) =>
            Client.PostAsJsonAsync("/api/assignments", new
            { ClassGroupId = classId, TeacherId = teacherId, CurricularUnitId = unitId,
                Weekday = weekday, PreferredShiftId = ShiftId });

        public void AsAdmin() => SetIdentity("admin", "Admin");
        public void AsTeacher() => SetIdentity(TeacherId, "Professor");
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
