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

public sealed class SemesterPlanningTests
{
    [Fact]
    public async Task TeacherSubmitsAdminApprovesAndPublicationCreatesExactlyOneOccupation()
    {
        await using var host = await Host.CreateAsync();
        var planId = await host.CreatePlan();
        host.AsTeacher();
        var proposalId = await host.CreateProposal(planId);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync(
            $"/api/semester-plans/{planId}/proposals/{proposalId}/submit", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync(
            $"/api/semester-plans/{planId}/proposals/{proposalId}/decision?decision=approve", new { })).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync(
            $"/api/semester-plans/{planId}/proposals/{proposalId}/decision?decision=approve", new { })).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.Occupations.ToListAsync());
        var preview = await host.Preview(planId);
        Assert.True(preview.GetProperty("allowed").GetBoolean());
        Assert.Equal(1, preview.GetProperty("toCreate").GetInt32());
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Publish(planId, preview)).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.OK, (await host.Publish(planId, preview)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Publish(planId, preview)).StatusCode);
        var occupation = Assert.Single(await db.Occupations.AsNoTracking().ToListAsync());
        Assert.Equal(proposalId, occupation.PlanProposalId);
        Assert.Equal(host.RoomId, occupation.RoomId);
        Assert.Equal(new DateTime(2027, 3, 1, 8, 0, 0), occupation.StartsAt);
        Assert.Equal(1, await db.Notifications.CountAsync(n => n.RelatedType == "SemesterPlan"));
        Assert.Equal(1, await db.AuditEntries.CountAsync(a => a.EntityType == "SemesterPlan" && a.Action == "Publicada"));
        var agenda = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>(
            "/api/agenda?from=2027-03-01T00:00:00&to=2027-03-02T00:00:00");
        Assert.Equal("Planning", Assert.Single(agenda!).GetProperty("source").GetString());
    }

    [Fact]
    public async Task ConfirmedDailyBookingAfterPreviewBlocksPublicationWithoutChangingBooking()
    {
        await using var host = await Host.CreateAsync();
        var planId = await host.ApprovedPlan();
        var preview = await host.Preview(planId);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var booking = new BookingRequest { TeacherId = "other", StartsAt = new(2027, 3, 1, 8, 0, 0),
            EndsAt = new(2027, 3, 1, 12, 0, 0), Students = 1, Reason = "Reserva direta",
            Status = BookingStatus.Aprovada, ApprovedRoomId = host.RoomId };
        db.Bookings.Add(booking);
        await db.SaveChangesAsync();
        db.Occupations.Add(new RoomOccupation { RoomId = host.RoomId, BookingRequestId = booking.Id,
            TeacherId = "other", StartsAt = booking.StartsAt, EndsAt = booking.EndsAt,
            Kind = OccupationKind.Avulsa });
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await host.Publish(planId, preview)).StatusCode);
        var occupation = Assert.Single(await db.Occupations.AsNoTracking().ToListAsync());
        Assert.Null(occupation.PlanProposalId);
        Assert.Equal(booking.Id, occupation.BookingRequestId);
        Assert.False((await db.SemesterPlans.AsNoTracking().SingleAsync()).Published);
        Assert.False(await db.Notifications.AnyAsync(n => n.RelatedType == "SemesterPlan"));
    }

    [Fact]
    public async Task OtherTeacherCannotCreateProposalAndRevisionInvalidatesPreview()
    {
        await using var host = await Host.CreateAsync();
        var planId = await host.CreatePlan();
        host.AsOther();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync(
            $"/api/semester-plans/{planId}/proposals", host.Input())).StatusCode);
        host.AsTeacher();
        var id = await host.CreateProposal(planId);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync(
            $"/api/semester-plans/{planId}/proposals/{id}/submit", null)).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync(
            $"/api/semester-plans/{planId}/proposals/{id}/decision?decision=approve", new { })).StatusCode);
        var preview = await host.Preview(planId);
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync(
            $"/api/semester-plans/{planId}/proposals", host.Input())).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Publish(planId, preview)).StatusCode);
    }

    [Fact]
    public async Task RejectionNeedsReasonAndCanReturnToDraftWithoutOccupyingRoom()
    {
        await using var host = await Host.CreateAsync();
        var planId = await host.CreatePlan(); host.AsTeacher();
        var id = await host.CreateProposal(planId);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync(
            $"/api/semester-plans/{planId}/proposals/{id}/submit", null)).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync(
            $"/api/semester-plans/{planId}/proposals/{id}/decision?decision=reject", new { reason = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync(
            $"/api/semester-plans/{planId}/proposals/{id}/decision?decision=reject",
            new { reason = "Sala reservada para manutenção" })).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.Occupations.ToListAsync());
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsync(
            $"/api/semester-plans/{planId}/proposals/{id}/submit", null)).StatusCode);
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync(
            $"/api/semester-plans/{planId}/proposals/{id}/revise", null)).StatusCode);
        Assert.Equal(PlanProposalStatus.Rascunho, (await db.PlanProposals.AsNoTracking().SingleAsync()).Status);
        Assert.True(await db.AuditEntries.AnyAsync(a => a.EntityType == "PlanProposal" && a.Action == "Rejeitada"));
    }

    [Fact]
    public async Task EquivalentApprovedBookingIsLinkedWithoutCreatingDuplicate()
    {
        await using var host = await Host.CreateAsync();
        var planId = await host.ApprovedPlan();
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var assignment = await db.Assignments.AsNoTracking().SingleAsync();
        var booking = new BookingRequest { TeacherId = "teacher", ClassGroupId = assignment.ClassGroupId,
            CurricularUnitId = assignment.CurricularUnitId, StartsAt = new(2027, 3, 1, 8, 0, 0),
            EndsAt = new(2027, 3, 1, 12, 0, 0), Students = 20,
            Reason = "Reserva cotidiana", Status = BookingStatus.Aprovada, ApprovedRoomId = host.RoomId };
        db.Bookings.Add(booking); await db.SaveChangesAsync();
        db.Occupations.Add(new RoomOccupation { RoomId = host.RoomId,
            TeacherId = "teacher", ClassGroupId = assignment.ClassGroupId,
            BookingRequestId = booking.Id, StartsAt = booking.StartsAt, EndsAt = booking.EndsAt,
            Kind = OccupationKind.Avulsa });
        await db.SaveChangesAsync();
        var preview = await host.Preview(planId);
        Assert.True(preview.GetProperty("allowed").GetBoolean());
        Assert.Equal(0, preview.GetProperty("toCreate").GetInt32());
        Assert.Equal(1, preview.GetProperty("existing").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await host.Publish(planId, preview)).StatusCode);
        var occupation = Assert.Single(await db.Occupations.AsNoTracking().ToListAsync());
        Assert.Equal(booking.Id, occupation.BookingRequestId);
        Assert.NotNull(occupation.PlanProposalId);
    }

    [Fact]
    public async Task CalendarAndChangedAssignmentOrRoomBlockPublication()
    {
        await using var host = await Host.CreateAsync();
        var planId = await host.ApprovedPlan();
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.AcademicCalendarEvents.Add(new AcademicCalendarEvent { SemesterId = host.SemesterId,
            StartDate = new(2027, 3, 1), EndDate = new(2027, 3, 1),
            Kind = AcademicDayKind.Holiday, Description = "Feriado" });
        await db.SaveChangesAsync();
        var calendar = await host.Preview(planId);
        Assert.False(calendar.GetProperty("allowed").GetBoolean());
        Assert.Contains("calendário", calendar.GetProperty("blocks").ToString());
        db.AcademicCalendarEvents.RemoveRange(db.AcademicCalendarEvents);
        var room = await db.Rooms.SingleAsync(); room.Seats = 5;
        await db.SaveChangesAsync();
        var technical = await host.Preview(planId);
        Assert.False(technical.GetProperty("allowed").GetBoolean());
        Assert.Contains("Ambiente inadequado", technical.GetProperty("blocks").ToString());
        room.Seats = 30;
        var assignment = await db.Assignments.SingleAsync(); assignment.EndedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
        var ended = await host.Preview(planId);
        Assert.False(ended.GetProperty("allowed").GetBoolean());
        Assert.Contains("Atribuição", ended.GetProperty("blocks").ToString());
        Assert.Empty(await db.Occupations.ToListAsync());
    }

    [Fact]
    public async Task ConflictingApprovedProposalsRejectEntirePublication()
    {
        await using var host = await Host.CreateAsync();
        var planId = await host.ApprovedPlan();
        var second = await host.CreateProposal(planId);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync(
            $"/api/semester-plans/{planId}/proposals/{second}/submit", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync(
            $"/api/semester-plans/{planId}/proposals/{second}/decision?decision=approve", new { })).StatusCode);
        var preview = await host.Preview(planId);
        Assert.False(preview.GetProperty("allowed").GetBoolean());
        Assert.Contains("Conflito entre propostas", preview.GetProperty("blocks").ToString());
        Assert.Equal(HttpStatusCode.Conflict, (await host.Publish(planId, preview)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.Occupations.ToListAsync());
        Assert.False((await db.SemesterPlans.AsNoTracking().SingleAsync()).Published);
    }

    [Fact]
    public async Task NotificationWriteFailureRollsBackPublicationAndOccupations()
    {
        await using var host = await Host.CreateAsync();
        var planId = await host.ApprovedPlan();
        var preview = await host.Preview(planId);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER fail_plan_notice BEFORE INSERT ON Notifications BEGIN SELECT RAISE(ABORT, 'notification failure'); END;");
        }
        await Assert.ThrowsAnyAsync<Exception>(() => host.Publish(planId, preview));
        using var checkScope = host.App.Services.CreateScope();
        var check = checkScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False((await check.SemesterPlans.AsNoTracking().SingleAsync()).Published);
        Assert.Empty(await check.Occupations.ToListAsync());
        Assert.False(await check.AuditEntries.AnyAsync(a => a.EntityType == "SemesterPlan" && a.Action == "Publicada"));
    }

    private sealed class Host : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public int SemesterId { get; private set; }
        public int AssignmentId { get; private set; }
        public int RoomId { get; private set; }
        public int ShiftId { get; private set; }
        private Host(WebApplication app, SqliteConnection connection)
        { App = app; this.connection = connection; Client = app.GetTestClient(); }
        public void AsTeacher() => SetUser("teacher", "Professor");
        public void AsOther() => SetUser("other", "Professor");
        public void AsAdmin() => SetUser("admin", "Admin");
        private void SetUser(string id, string role)
        {
            Client.DefaultRequestHeaders.Remove("X-Test-User"); Client.DefaultRequestHeaders.Remove("X-Test-Role");
            Client.DefaultRequestHeaders.Add("X-Test-User", id); Client.DefaultRequestHeaders.Add("X-Test-Role", role);
        }
        public object Input() => new { assignmentId = AssignmentId, roomId = RoomId, shiftId = ShiftId,
            startDate = "2027-03-01", endDate = "2027-03-01", curricularCapabilityId = (int?)null };
        public async Task<int> CreatePlan()
        {
            AsAdmin();
            var response = await Client.PostAsync($"/api/semester-plans/{SemesterId}", null);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        }
        public async Task<int> CreateProposal(int planId)
        {
            var response = await Client.PostAsJsonAsync($"/api/semester-plans/{planId}/proposals", Input());
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        }
        public async Task<int> ApprovedPlan()
        {
            var planId = await CreatePlan(); AsTeacher();
            var proposalId = await CreateProposal(planId);
            Assert.Equal(HttpStatusCode.OK, (await Client.PostAsync(
                $"/api/semester-plans/{planId}/proposals/{proposalId}/submit", null)).StatusCode);
            AsAdmin();
            Assert.Equal(HttpStatusCode.OK, (await Client.PostAsJsonAsync(
                $"/api/semester-plans/{planId}/proposals/{proposalId}/decision?decision=approve", new { })).StatusCode);
            return planId;
        }
        public async Task<System.Text.Json.JsonElement> Preview(int planId)
        {
            var response = await Client.GetAsync($"/api/semester-plans/{planId}/publish-preview");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var value = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            Assert.True(value.TryGetProperty("revision", out _), value.ToString());
            return value;
        }
        public Task<HttpResponseMessage> Publish(int planId, System.Text.Json.JsonElement preview) =>
            Client.PostAsJsonAsync($"/api/semester-plans/{planId}/publish", new
            { confirm = true, expectedRevision = preview.GetProperty("revision").GetInt32(),
                expectedSignature = preview.GetProperty("signature").GetString() });
        public static async Task<Host> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer(); builder.Logging.ClearProviders();
            builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>().AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            builder.Services.AddAuthentication("Test")
                .AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>("Test", _ => { });
            builder.Services.AddAuthorization(o => o.AddPolicy("Admin", p => p.RequireRole("Admin")));
            var app = builder.Build();
            app.UseAuthentication(); app.UseAuthorization(); app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new Host(app, connection); host.AsAdmin();
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Users.AddRange(new AppUser { Id = "teacher", UserName = "teacher", DisplayName = "Professor" },
                new AppUser { Id = "other", UserName = "other", DisplayName = "Outro" },
                new AppUser { Id = "admin", UserName = "admin", DisplayName = "Admin" });
            var semester = new Semester { Name = "2027.1", StartDate = new(2027, 3, 1), EndDate = new(2027, 3, 31) };
            var shift = new SchoolShift { Name = "Manhã", StartsAt = new(8, 0), EndsAt = new(12, 0) };
            var course = new Course { Code = "C", NormalizedCode = "C", Name = "Curso", NormalizedName = "CURSO" };
            var module = new CourseModule { Course = course, Name = "Módulo", NormalizedName = "MODULO", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U", NormalizedCode = "U", Name = "UC", NormalizedName = "UC" };
            var group = new ClassGroup { Name = "Turma", Semester = semester, Course = course, Students = 20 };
            var assignment = new TeachingAssignment { TeacherId = "teacher", ClassGroup = group,
                CurricularUnit = unit, DisciplineName = "UC", Weekday = 1, PreferredShift = shift };
            var room = new Room { Name = "Laboratório", Kind = RoomKind.Laboratorio, Seats = 30 };
            db.Assignments.Add(assignment); db.Rooms.Add(room);
            await db.SaveChangesAsync();
            host.SemesterId = semester.Id; host.AssignmentId = assignment.Id;
            host.RoomId = room.Id; host.ShiftId = shift.Id;
            return host;
        }
        public async ValueTask DisposeAsync()
        { Client.Dispose(); await App.DisposeAsync(); await connection.DisposeAsync(); }
    }
    private sealed class HeaderAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-User", out var id))
                return Task.FromResult(AuthenticateResult.NoResult());
            var role = Request.Headers["X-Test-Role"].ToString();
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id.ToString()),
                new Claim(ClaimTypes.Role, role)], "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(
                new ClaimsPrincipal(identity), "Test")));
        }
    }
}
