using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
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

public sealed class AcademicCalendarTests
{
    [Fact]
    public void PreviewExcludesHolidaysRecessPlanningEadAndReportsMissingMeetings()
    {
        var semester = new Semester { Id = 1, StartDate = new DateOnly(2027, 3, 1),
            EndDate = new DateOnly(2027, 3, 31) };
        var events = new List<AcademicCalendarEvent>
        {
            new() { StartDate = new DateOnly(2027, 3, 8), EndDate = new DateOnly(2027, 3, 8),
                Kind = AcademicDayKind.Holiday, Description = "Feriado" },
            new() { StartDate = new DateOnly(2027, 3, 15), EndDate = new DateOnly(2027, 3, 16),
                Kind = AcademicDayKind.Recess, Description = "Recesso escolar" },
            new() { StartDate = new DateOnly(2027, 3, 22), EndDate = new DateOnly(2027, 3, 22),
                Kind = AcademicDayKind.Planning, Description = "Planejamento" },
            new() { StartDate = new DateOnly(2027, 3, 29), EndDate = new DateOnly(2027, 3, 29),
                Kind = AcademicDayKind.Ead, Description = "EAD institucional" }
        };
        var result = AcademicCalendarRules.Preview(semester, new DateOnly(2027, 3, 1),
            new DateOnly(2027, 3, 31), 1 << 1, null, events, [], 4);
        Assert.Equal(5, result.Dates.Count);
        Assert.Equal(1, result.PresentialMeetings);
        Assert.Equal(1, result.EadMeetings);
        Assert.Equal(3, result.ExcludedDates);
        Assert.Equal(3, result.MissingMeetings);
        Assert.Equal("Feriado", result.Dates.Single(x => x.Date == new DateOnly(2027, 3, 8)).Reason);
        Assert.Equal("Recesso escolar", result.Dates.Single(x => x.Date == new DateOnly(2027, 3, 15)).Reason);
        Assert.Equal("Planejamento", result.Dates.Single(x => x.Date == new DateOnly(2027, 3, 22)).Reason);
    }

    [Fact]
    public void ClassExceptionOverridesWeeklyEadButInstitutionalClosureWins()
    {
        var semester = new Semester { Id = 1, StartDate = new DateOnly(2027, 3, 1),
            EndDate = new DateOnly(2027, 3, 31) };
        var classGroup = new ClassGroup { Id = 2, SemesterId = 1, EadWeekday = 5,
            EadStartDate = semester.StartDate, EadEndDate = semester.EndDate };
        var events = new List<AcademicCalendarEvent> { new() { StartDate = new DateOnly(2027, 3, 19),
            EndDate = new DateOnly(2027, 3, 19), Kind = AcademicDayKind.Holiday,
            Description = "Feriado" } };
        var exceptions = new List<ClassCalendarException>
        {
            new() { ClassGroupId = 2, Date = new DateOnly(2027, 3, 12),
                Kind = AcademicDayKind.Presential, Description = "Aula presencial autorizada" },
            new() { ClassGroupId = 2, Date = new DateOnly(2027, 3, 19),
                Kind = AcademicDayKind.Presential, Description = "Não prevalece sobre feriado" }
        };
        var result = AcademicCalendarRules.Preview(semester, semester.StartDate,
            semester.EndDate, 1 << 5, classGroup, events, exceptions);
        Assert.Equal(4, result.Dates.Count);
        Assert.Equal(1, result.PresentialMeetings);
        Assert.Equal(2, result.EadMeetings);
        Assert.Equal(AcademicDayKind.Presential,
            result.Dates.Single(x => x.Date == new DateOnly(2027, 3, 12)).Kind);
        Assert.Equal(AcademicDayKind.Holiday,
            result.Dates.Single(x => x.Date == new DateOnly(2027, 3, 19)).Kind);
    }

    [Fact]
    public void PreviewKeepsRequestedBoundsAndMarksDatesOutsideSemester()
    {
        var semester = new Semester { Id = 1, StartDate = new DateOnly(2027, 3, 1),
            EndDate = new DateOnly(2027, 3, 20) };
        var from = new DateOnly(2027, 2, 22);
        var to = new DateOnly(2027, 3, 22);
        var result = AcademicCalendarRules.Preview(semester, from, to, 1 << 1, null, [], [], 5);
        Assert.Equal(from, result.Dates.First().Date);
        Assert.Equal(to, result.Dates.Last().Date);
        Assert.All(result.Dates, x => Assert.InRange(x.Date, from, to));
        Assert.Equal(3, result.PresentialMeetings);
        Assert.Equal(2, result.ExcludedDates);
        Assert.Equal(2, result.MissingMeetings);
        Assert.Equal("Fora do semestre", result.Dates.First().Reason);
        Assert.Equal("Fora do semestre", result.Dates.Last().Reason);
    }

    [Fact]
    public async Task AdminManagesInstitutionalEventsAndOverlapsAreRejected()
    {
        await using var host = await CalendarHost.CreateAsync();
        host.AsAdmin();
        var route = $"/api/semesters/{host.SemesterId}/calendar/events";
        var holiday = new AcademicCalendarEventInput(new DateOnly(2027, 3, 8),
            new DateOnly(2027, 3, 8), AcademicDayKind.Holiday, "Feriado");
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.PostAsJsonAsync(
            "/api/semesters/99999/calendar/events", holiday)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync(route,
            holiday with { StartDate = new DateOnly(2027, 2, 28) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync(route,
            holiday with { EndDate = new DateOnly(2027, 3, 7) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync(route,
            holiday with { Kind = (AcademicDayKind)99 })).StatusCode);
        var created = await host.Client.PostAsJsonAsync(route, holiday);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var item = await created.Content.ReadFromJsonAsync<AcademicCalendarEventResponse>();
        Assert.NotNull(item);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync(created.Headers.Location)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(route,
            holiday with { EndDate = new DateOnly(2027, 3, 9), Kind = AcademicDayKind.Recess })).StatusCode);
        var recess = await host.Client.PostAsJsonAsync(route, new AcademicCalendarEventInput(
            new DateOnly(2027, 3, 15), new DateOnly(2027, 3, 17),
            AcademicDayKind.Recess, "Recesso de três dias"));
        Assert.Equal(HttpStatusCode.Created, recess.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync(
            $"{route}/{item.Id}", holiday with { EndDate = new DateOnly(2027, 3, 16) })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
            $"{route}/{item.Id}", holiday with { Description = "Feriado atualizado" })).StatusCode);
        var preview = await host.Client.GetFromJsonAsync<CalendarPreviewResponse>(
            $"/api/academic-calendar/preview?semesterId={host.SemesterId}&from=2027-03-01&to=2027-03-31&weekdaysMask=2&requiredMeetings=5");
        Assert.NotNull(preview);
        Assert.Equal(3, preview.PresentialMeetings);
        Assert.Equal(2, preview.MissingMeetings);
        Assert.Equal("Feriado atualizado", preview.Dates.Single(x =>
            x.Date == new DateOnly(2027, 3, 8)).Reason);
        Assert.Equal("Recesso de três dias", preview.Dates.Single(x =>
            x.Date == new DateOnly(2027, 3, 15)).Reason);
    }

    [Fact]
    public async Task WeeklyEadExceptionAndReservationsRemainIndependent()
    {
        await using var host = await CalendarHost.CreateAsync();
        host.AsAdmin();
        var patternRoute = $"/api/classes/{host.ClassId}/calendar/ead-pattern";
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync(patternRoute,
            new ClassEadPatternInput(5, new DateOnly(2027, 2, 28), new DateOnly(2027, 3, 31)))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(patternRoute,
            new ClassEadPatternInput(5, new DateOnly(2027, 3, 1), new DateOnly(2027, 3, 31)))).StatusCode);
        var previewRoute = $"/api/academic-calendar/preview?semesterId={host.SemesterId}" +
            $"&classGroupId={host.ClassId}&from=2027-03-01&to=2027-03-31&weekdaysMask=32";
        var before = await host.Client.GetFromJsonAsync<CalendarPreviewResponse>(previewRoute);
        Assert.Equal(4, before!.EadMeetings);

        host.AsTeacher();
        var exceptionRoute = $"/api/classes/{host.ClassId}/calendar/exceptions/2027-03-12";
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync(exceptionRoute,
            new ClassCalendarExceptionInput(AcademicDayKind.Presential, "Aula presencial"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync(
            $"/api/classes/{host.ClassId}/calendar/exceptions/2027-03-26",
            new ClassCalendarExceptionInput(AcademicDayKind.NonTeaching, "Atividade suspensa"))).StatusCode);
        var after = await host.Client.GetFromJsonAsync<CalendarPreviewResponse>(previewRoute);
        Assert.Equal(1, after!.PresentialMeetings);
        Assert.Equal(2, after.EadMeetings);
        Assert.Equal(1, after.ExcludedDates);
        Assert.Equal("Atividade suspensa", after.Dates.Single(x =>
            x.Date == new DateOnly(2027, 3, 26)).Reason);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(patternRoute,
            new ClassEadPatternInput(5, new DateOnly(2027, 3, 5), new DateOnly(2027, 3, 19)))).StatusCode);
        var classCalendar = await host.Client.GetAsync($"/api/classes/{host.ClassId}/calendar");
        Assert.Equal(HttpStatusCode.OK, classCalendar.StatusCode);
        using var json = JsonDocument.Parse(await classCalendar.Content.ReadAsStringAsync());
        Assert.Equal(2, json.RootElement.GetProperty("exceptions").GetArrayLength());
        Assert.Equal(32, json.RootElement.GetProperty("preview").GetProperty("weekdaysMask").GetInt32());
        Assert.Equal(4, json.RootElement.GetProperty("preview").GetProperty("dates").GetArrayLength());
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True(await db.Bookings.AnyAsync(x => x.Id == host.BookingId &&
            x.Status == BookingStatus.Aprovada));
        Assert.True(await db.Occupations.AnyAsync(x => x.Id == host.OccupationId &&
            x.CancelledAtUtc == null && x.DayStatus == ClassDayStatus.Letivo));
    }

    [Fact]
    public async Task TeacherPermissionsAndHolidayPrecedenceAreEnforced()
    {
        await using var host = await CalendarHost.CreateAsync();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await host.Client.GetAsync($"/api/semesters/{host.SemesterId}/calendar")).StatusCode);
        host.AsOtherTeacher();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.GetAsync($"/api/classes/{host.ClassId}/calendar")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.PutAsJsonAsync($"/api/classes/{host.ClassId}/calendar/exceptions/2027-03-12",
                new ClassCalendarExceptionInput(AcademicDayKind.Ead, "EAD"))).StatusCode);
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.OK,
            (await host.Client.GetAsync($"/api/semesters/{host.SemesterId}/calendar")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.PostAsJsonAsync($"/api/semesters/{host.SemesterId}/calendar/events",
                new AcademicCalendarEventInput(new DateOnly(2027, 3, 8),
                    new DateOnly(2027, 3, 8), AcademicDayKind.Holiday, "Feriado"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.PutAsJsonAsync($"/api/classes/{host.ClassId}/calendar/ead-pattern",
                new ClassEadPatternInput(5, new DateOnly(2027, 3, 1), new DateOnly(2027, 3, 31)))).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.Created,
            (await host.Client.PostAsJsonAsync($"/api/semesters/{host.SemesterId}/calendar/events",
                new AcademicCalendarEventInput(new DateOnly(2027, 3, 12),
                    new DateOnly(2027, 3, 12), AcademicDayKind.Holiday, "Feriado"))).StatusCode);
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Conflict,
            (await host.Client.PutAsJsonAsync($"/api/classes/{host.ClassId}/calendar/exceptions/2027-03-12",
                new ClassCalendarExceptionInput(AcademicDayKind.Presential, "Aula presencial"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.PutAsJsonAsync($"/api/classes/{host.ClassId}/calendar/exceptions/2027-03-11",
                new ClassCalendarExceptionInput(AcademicDayKind.Ead, "Outro dia"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.PutAsJsonAsync($"/api/classes/{host.ClassId}/calendar/exceptions/2027-04-02",
                new ClassCalendarExceptionInput(AcademicDayKind.Ead, "EAD"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.GetAsync($"/api/academic-calendar/preview?semesterId={host.SemesterId}" +
                "&from=2027-03-31&to=2027-03-01&weekdaysMask=2")).StatusCode);
    }

    private sealed class CalendarHost : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public int SemesterId { get; private set; }
        public int ClassId { get; private set; }
        public int BookingId { get; private set; }
        public int OccupationId { get; private set; }
        private string TeacherId { get; set; } = "";
        private string OtherTeacherId { get; set; } = "";

        private CalendarHost(WebApplication app, SqliteConnection connection)
        {
            App = app;
            this.connection = connection;
            Client = app.GetTestClient();
        }

        public static async Task<CalendarHost> CreateAsync()
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
            var host = new CalendarHost(app, connection);
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
            var semester = new Semester { Name = "2027.1", StartDate = new DateOnly(2027, 3, 1),
                EndDate = new DateOnly(2027, 3, 31) };
            var course = new Course { Code = "C1", NormalizedCode = "C1", Name = "Mecânica",
                NormalizedName = "MECANICA" };
            var module = new CourseModule { Course = course, Name = "Módulo",
                NormalizedName = "MODULO", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U1",
                NormalizedCode = "U1", Name = "Desenho", NormalizedName = "DESENHO" };
            var shift = new SchoolShift { Name = "Manhã", StartsAt = new TimeOnly(8, 0),
                EndsAt = new TimeOnly(12, 0) };
            var classGroup = new ClassGroup { Name = "M1", Students = 25, Semester = semester,
                Course = course };
            var room = new Room { Name = "Sala 1", Location = "Bloco", Seats = 30, Desks = 30 };
            db.Assignments.Add(new TeachingAssignment { ClassGroup = classGroup,
                TeacherId = teacher.Id, CurricularUnit = unit, DisciplineName = "Desenho",
                Weekday = 5, PreferredShift = shift });
            var booking = new BookingRequest { TeacherId = teacher.Id, ClassGroup = classGroup,
                StartsAt = new DateTime(2027, 3, 12, 8, 0, 0),
                EndsAt = new DateTime(2027, 3, 12, 12, 0, 0), Students = 25,
                Status = BookingStatus.Aprovada, Reason = "Reserva anterior" };
            db.Bookings.Add(booking);
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            var occupation = new RoomOccupation { RoomId = room.Id, TeacherId = teacher.Id,
                ClassGroupId = classGroup.Id, BookingRequestId = booking.Id,
                StartsAt = booking.StartsAt, EndsAt = booking.EndsAt,
                Kind = OccupationKind.Aula, DayStatus = ClassDayStatus.Letivo };
            db.Occupations.Add(occupation);
            await db.SaveChangesAsync();
            host.SemesterId = semester.Id;
            host.ClassId = classGroup.Id;
            host.BookingId = booking.Id;
            host.OccupationId = occupation.Id;
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
