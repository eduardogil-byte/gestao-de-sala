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
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SalaGest.Api.Data;
using SalaGest.Api.Endpoints;
using SalaGest.Api.Models;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class OccupancyIndicatorTests
{
    [Fact]
    public async Task CapacityUsesConfiguredDaysAndDifferentDurationsWithoutDoubleCounting()
    {
        await using var host = await Host.CreateAsync();
        await host.Configure(host.RoomAId);
        using (var auditScope = host.App.Services.CreateScope())
        {
            var audit = auditScope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.True(await audit.AuditEntries.AnyAsync(a => a.EntityType == "Room" &&
                a.EntityId == host.RoomAId.ToString() && a.Action == "Turnos oferecidos alterados"));
        }
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var special = host.Occ(host.RoomAId, 8, 8, 12);
            special.DayStatus = ClassDayStatus.Ead;
            db.Occupations.AddRange(
                host.Occ(host.RoomAId, 1, 8, 12), host.Occ(host.RoomAId, 1, 8, 12),
                host.Occ(host.RoomAId, 1, 13, 16), special,
                host.Occ(host.RoomBId, 1, 8, 12));
            await db.SaveChangesAsync();
        }
        var report = await host.Report();
        Assert.Equal(15m, report.GetProperty("physicalOccupiedHours").GetDecimal());
        Assert.Equal(1, report.GetProperty("roomsWithUnknownCapacity").GetInt32());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, report.GetProperty("occupancyPercent").ValueKind);
        var rooms = report.GetProperty("rooms").EnumerateArray().ToArray();
        var a = rooms.Single(r => r.GetProperty("roomId").GetInt32() == host.RoomAId);
        var b = rooms.Single(r => r.GetProperty("roomId").GetInt32() == host.RoomBId);
        Assert.Equal(11m, a.GetProperty("physicalOccupiedHours").GetDecimal());
        Assert.Equal(21m, a.GetProperty("capacityHours").GetDecimal());
        Assert.Equal(7m, a.GetProperty("occupiedWithinCapacityHours").GetDecimal());
        Assert.Equal(14m, a.GetProperty("availableHours").GetDecimal());
        Assert.Equal(4m, a.GetProperty("outsideCapacityHours").GetDecimal());
        Assert.Equal(33.33m, a.GetProperty("occupancyPercent").GetDecimal());
        Assert.Equal("Opportunity", a.GetProperty("classification").GetString());
        Assert.Equal(2, a.GetProperty("daysWithOccupations").GetInt32());
        Assert.Equal(3, a.GetProperty("occupiedSlots").GetInt32());
        Assert.Equal(1, a.GetProperty("conflictPairs").GetInt32());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, b.GetProperty("capacityHours").ValueKind);
        Assert.Equal("Unknown", b.GetProperty("classification").GetString());
        var shifts = a.GetProperty("shifts").EnumerateArray().ToArray();
        Assert.Equal(12m, shifts.Single(s => s.GetProperty("shiftId").GetInt32() == host.MorningId)
            .GetProperty("capacityHours").GetDecimal());
        Assert.Equal(9m, shifts.Single(s => s.GetProperty("shiftId").GetInt32() == host.AfternoonId)
            .GetProperty("capacityHours").GetDecimal());
        var legacy = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            "/api/dashboard/usage?from=2027-03-01&to=2027-03-01");
        var legacyA = legacy.GetProperty("rooms").EnumerateArray().Single(r =>
            r.GetProperty("roomId").GetInt32() == host.RoomAId);
        Assert.Equal(7m, legacyA.GetProperty("hours").GetDecimal());
        Assert.Equal(2, legacyA.GetProperty("occurrences").GetInt32());
        var specialUsage = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            "/api/dashboard/usage?from=2027-03-08&to=2027-03-08");
        Assert.Equal(4m, specialUsage.GetProperty("rooms").EnumerateArray().Single(r =>
            r.GetProperty("roomId").GetInt32() == host.RoomAId).GetProperty("hours").GetDecimal());
    }

    [Fact]
    public async Task PendingCancelledAndUnpublishedRecordsDoNotContribute()
    {
        await using var host = await Host.CreateAsync();
        await host.Configure(host.RoomAId);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var pending = new BookingRequest { TeacherId = "teacher", StartsAt = new(2027, 3, 1, 8, 0, 0),
                EndsAt = new(2027, 3, 1, 12, 0, 0), Students = 1, Reason = "Pendente" };
            db.Bookings.Add(pending); await db.SaveChangesAsync();
            db.Occupations.AddRange(new RoomOccupation { RoomId = host.RoomAId,
                BookingRequestId = pending.Id, StartsAt = pending.StartsAt, EndsAt = pending.EndsAt,
                Kind = OccupationKind.Avulsa },
                new RoomOccupation { RoomId = host.RoomAId, CancelledAtUtc = DateTime.UtcNow,
                    StartsAt = pending.StartsAt, EndsAt = pending.EndsAt, Kind = OccupationKind.Avulsa });
            await db.SaveChangesAsync();
        }
        var report = await host.Report(host.RoomAId);
        Assert.Equal(0m, report.GetProperty("physicalOccupiedHours").GetDecimal());
        Assert.Equal(0, report.GetProperty("rooms")[0].GetProperty("daysWithOccupations").GetInt32());
    }

    [Fact]
    public async Task ClassificationThresholdsAndSemesterComparisonUseSeparateDenominators()
    {
        await using var host = await Host.CreateAsync();
        await host.Configure(host.RoomAId);
        var withoutSecondConfiguration = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/occupancy-indicators/compare?firstSemesterId={host.SemesterId}&secondSemesterId={host.SecondSemesterId}&roomId={host.RoomAId}");
        Assert.Equal(System.Text.Json.JsonValueKind.Null,
            withoutSecondConfiguration.GetProperty("second").GetProperty("capacityHours").ValueKind);
        await host.Configure(host.RoomAId, host.SecondSemesterId);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.AddRange(host.Occ(host.RoomAId, 1, 8, 12),
                host.Occ(host.RoomAId, 1, 13, 16), host.Occ(host.RoomAId, 2, 8, 12),
                host.Occ(host.RoomAId, 9, 8, 12),
                new RoomOccupation { RoomId = host.RoomAId, StartsAt = new(2027, 4, 5, 8, 0, 0),
                    EndsAt = new(2027, 4, 5, 12, 0, 0), Kind = OccupationKind.Aula });
            await db.SaveChangesAsync();
        }
        var first = await host.Report(host.RoomAId);
        Assert.Equal(71.43m, first.GetProperty("occupancyPercent").GetDecimal());
        Assert.Equal(21m, first.GetProperty("capacityHours").GetDecimal());
        Assert.Equal("Intermediate", first.GetProperty("rooms")[0].GetProperty("classification").GetString());
        var comparison = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/occupancy-indicators/compare?firstSemesterId={host.SemesterId}&secondSemesterId={host.SecondSemesterId}&roomId={host.RoomAId}");
        Assert.Equal(14m, comparison.GetProperty("second").GetProperty("capacityHours").GetDecimal());
        Assert.Equal(28.57m, comparison.GetProperty("second").GetProperty("occupancyPercent").GetDecimal());
    }

    [Fact]
    public async Task AuthorizationAndInvalidConfigurationAreRejected()
    {
        await using var host = await Host.CreateAsync();
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(
            $"/api/occupancy-indicators/semesters/{host.SemesterId}")).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync(
            $"/api/semesters/{host.SemesterId}/rooms/{host.RoomAId}/operating-shifts",
            new[] { new { shiftId = host.MorningId, weekdaysMask = 0 } })).StatusCode);
        int overlapId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var overlap = new SchoolShift { Name = "Sobreposto", StartsAt = new(11, 0), EndsAt = new(14, 0) };
            db.Shifts.Add(overlap); await db.SaveChangesAsync(); overlapId = overlap.Id;
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync(
            $"/api/semesters/{host.SemesterId}/rooms/{host.RoomAId}/operating-shifts", new[]
            { new { shiftId = host.MorningId, weekdaysMask = 2 },
                new { shiftId = overlapId, weekdaysMask = 2 } })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.GetAsync(
            "/api/occupancy-indicators/semesters/99999")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.GetAsync(
            $"/api/occupancy-indicators/compare?firstSemesterId={host.SemesterId}&secondSemesterId={host.SemesterId}")).StatusCode);
    }

    [Fact]
    public async Task ThresholdsAreConfigurableAndInvalidThresholdsAreRejected()
    {
        await using var host = await Host.CreateAsync(60m, 20m);
        await host.Configure(host.RoomAId);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.AddRange(host.Occ(host.RoomAId, 1, 8, 12),
                host.Occ(host.RoomAId, 1, 13, 16), host.Occ(host.RoomAId, 2, 8, 12),
                host.Occ(host.RoomAId, 9, 8, 12));
            await db.SaveChangesAsync();
        }
        var report = await host.Report(host.RoomAId);
        Assert.Equal("Bottleneck", report.GetProperty("rooms")[0].GetProperty("classification").GetString());
        Assert.Equal(60m, report.GetProperty("thresholds").GetProperty("bottleneckPercent").GetDecimal());
        await using var invalid = await Host.CreateAsync(10m, 20m);
        Assert.Equal(HttpStatusCode.BadRequest, (await invalid.Client.GetAsync(
            $"/api/occupancy-indicators/semesters/{invalid.SemesterId}")).StatusCode);
    }

    [Fact]
    public async Task ZeroEligibleCapacityKeepsPercentageUnknownAndReportsPhysicalUseOutsideCapacity()
    {
        await using var host = await Host.CreateAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
            $"/api/semesters/{host.SemesterId}/rooms/{host.RoomAId}/operating-shifts",
            new[] { new { shiftId = host.MorningId, weekdaysMask = 1 } })).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AcademicCalendarEvents.Add(new AcademicCalendarEvent { SemesterId = host.SemesterId,
                StartDate = new(2027, 3, 7), EndDate = new(2027, 3, 7),
                Kind = AcademicDayKind.Recess, Description = "Recesso" });
            db.Occupations.Add(host.Occ(host.RoomAId, 7, 8, 12));
            await db.SaveChangesAsync();
        }
        var room = (await host.Report(host.RoomAId)).GetProperty("rooms")[0];
        Assert.Equal(0m, room.GetProperty("capacityHours").GetDecimal());
        Assert.Equal(4m, room.GetProperty("physicalOccupiedHours").GetDecimal());
        Assert.Equal(4m, room.GetProperty("outsideCapacityHours").GetDecimal());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, room.GetProperty("occupancyPercent").ValueKind);
        Assert.Equal("Unknown", room.GetProperty("classification").GetString());
    }

    [Fact]
    public async Task CurrentRoomAfterMoveAndUndoIsTheOnlySourceForIndicators()
    {
        await using var host = await Host.CreateAsync();
        await host.Configure(host.RoomAId);
        await host.Configure(host.RoomBId);
        int id;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var occupation = host.Occ(host.RoomAId, 1, 8, 12);
            db.Occupations.Add(occupation); await db.SaveChangesAsync(); id = occupation.Id;
        }
        Assert.Equal(4m, (await host.Report(host.RoomAId)).GetProperty("physicalOccupiedHours").GetDecimal());
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Occupations.SingleAsync(o => o.Id == id)).RoomId = host.RoomBId;
            await db.SaveChangesAsync();
        }
        Assert.Equal(0m, (await host.Report(host.RoomAId)).GetProperty("physicalOccupiedHours").GetDecimal());
        Assert.Equal(4m, (await host.Report(host.RoomBId)).GetProperty("physicalOccupiedHours").GetDecimal());
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Occupations.SingleAsync(o => o.Id == id)).RoomId = host.RoomAId;
            await db.SaveChangesAsync();
        }
        Assert.Equal(4m, (await host.Report(host.RoomAId)).GetProperty("physicalOccupiedHours").GetDecimal());
    }

    [Fact]
    public async Task ApprovedLoanDoesNotAddPhysicalHours()
    {
        await using var host = await Host.CreateAsync();
        await host.Configure(host.RoomAId);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var occupation = host.Occ(host.RoomAId, 1, 8, 12);
            occupation.TeacherId = "teacher";
            db.Occupations.Add(occupation);
            await db.SaveChangesAsync();
            var booking = new BookingRequest { TeacherId = "teacher", StartsAt = occupation.StartsAt,
                EndsAt = occupation.EndsAt, Students = 1, Reason = "Empréstimo",
                Status = BookingStatus.Aprovada };
            db.Loans.Add(new RoomLoan { RoomOccupationId = occupation.Id,
                BookingRequest = booking, BorrowerId = "admin", Reason = "Empréstimo",
                Status = LoanStatus.Aprovado });
            await db.SaveChangesAsync();
        }
        var room = (await host.Report(host.RoomAId)).GetProperty("rooms")[0];
        Assert.Equal(4m, room.GetProperty("physicalOccupiedHours").GetDecimal());
        Assert.Equal(1, room.GetProperty("occupiedSlots").GetInt32());
    }

    [Fact]
    public async Task UnknownShiftKeepsOccurrenceVisibleWithoutInventingHours()
    {
        await using var host = await Host.CreateAsync();
        await host.Configure(host.RoomAId);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.Add(host.Occ(host.RoomAId, 1, 9, 10));
            await db.SaveChangesAsync();
        }
        var room = (await host.Report(host.RoomAId)).GetProperty("rooms")[0];
        Assert.Equal(0m, room.GetProperty("physicalOccupiedHours").GetDecimal());
        Assert.Equal(1, room.GetProperty("daysWithOccupations").GetInt32());
        Assert.Equal(1, room.GetProperty("unclassifiedOccupations").GetInt32());
        Assert.Contains("sem turno", room.GetProperty("warnings").ToString());
    }

    [Fact]
    public async Task PublishedPlanLinkedToEquivalentBookingCountsOnlyItsEffectiveOccupation()
    {
        await using var host = await Host.CreateAsync();
        await host.Configure(host.RoomAId);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var course = new Course { Code = "P", NormalizedCode = "P", Name = "Curso P", NormalizedName = "CURSO P" };
            var module = new CourseModule { Course = course, Name = "Módulo", NormalizedName = "MODULO", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U", NormalizedCode = "U", Name = "UC", NormalizedName = "UC" };
            var group = new ClassGroup { SemesterId = host.SemesterId, Course = course,
                Name = "Turma", Students = 20 };
            var assignment = new TeachingAssignment { ClassGroup = group, CurricularUnit = unit,
                TeacherId = "teacher", DisciplineName = "UC", Weekday = 1,
                PreferredShiftId = host.MorningId };
            var plan = new SemesterPlan { SemesterId = host.SemesterId, Published = true };
            var proposal = new PlanProposal { SemesterPlan = plan, Assignment = assignment,
                RoomId = host.RoomAId, ShiftId = host.MorningId,
                StartDate = new(2027, 3, 1), EndDate = new(2027, 3, 1),
                CreatedById = "teacher", Status = PlanProposalStatus.Publicada };
            var booking = new BookingRequest { TeacherId = "teacher", ClassGroup = group,
                CurricularUnit = unit, StartsAt = new(2027, 3, 1, 8, 0, 0),
                EndsAt = new(2027, 3, 1, 12, 0, 0), Students = 20,
                Reason = "Reserva equivalente", Status = BookingStatus.Aprovada };
            db.PlanProposals.Add(proposal); db.Bookings.Add(booking);
            await db.SaveChangesAsync();
            db.Occupations.Add(new RoomOccupation { PlanProposalId = proposal.Id,
                BookingRequestId = booking.Id, RoomId = host.RoomAId, TeacherId = "teacher",
                ClassGroupId = group.Id, StartsAt = booking.StartsAt, EndsAt = booking.EndsAt,
                Kind = OccupationKind.Avulsa });
            await db.SaveChangesAsync();
        }
        var room = (await host.Report(host.RoomAId)).GetProperty("rooms")[0];
        Assert.Equal(4m, room.GetProperty("physicalOccupiedHours").GetDecimal());
        Assert.Equal(1, room.GetProperty("occupiedSlots").GetInt32());
    }

    private sealed class Host : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public int SemesterId { get; private set; }
        public int SecondSemesterId { get; private set; }
        public int RoomAId { get; private set; }
        public int RoomBId { get; private set; }
        public int MorningId { get; private set; }
        public int AfternoonId { get; private set; }
        private Host(WebApplication app, SqliteConnection connection)
        { App = app; this.connection = connection; Client = app.GetTestClient(); }
        public void AsAdmin() => SetUser("admin", "Admin");
        public void AsTeacher() => SetUser("teacher", "Professor");
        private void SetUser(string id, string role)
        {
            Client.DefaultRequestHeaders.Remove("X-Test-User"); Client.DefaultRequestHeaders.Remove("X-Test-Role");
            Client.DefaultRequestHeaders.Add("X-Test-User", id); Client.DefaultRequestHeaders.Add("X-Test-Role", role);
        }
        public RoomOccupation Occ(int roomId, int day, int from, int to) => new()
        {
            RoomId = roomId, StartsAt = new DateTime(2027, 3, day, from, 0, 0),
            EndsAt = new DateTime(2027, 3, day, to, 0, 0), Kind = OccupationKind.Avulsa
        };
        public async Task Configure(int roomId, int? semesterId = null)
        {
            var response = await Client.PutAsJsonAsync(
                $"/api/semesters/{semesterId ?? SemesterId}/rooms/{roomId}/operating-shifts", new[]
            {
                new { shiftId = MorningId, weekdaysMask = 6 },
                new { shiftId = AfternoonId, weekdaysMask = 6 }
            });
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }
        public async Task<System.Text.Json.JsonElement> Report(int? roomId = null)
        {
            var path = $"/api/occupancy-indicators/semesters/{SemesterId}" +
                (roomId is int id ? $"?roomId={id}" : "");
            return await Client.GetFromJsonAsync<System.Text.Json.JsonElement>(path);
        }
        public static async Task<Host> CreateAsync(decimal? bottleneck = null, decimal? opportunity = null)
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer(); builder.Logging.ClearProviders();
            if (bottleneck is not null || opportunity is not null)
                builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["OccupancyIndicators:BottleneckPercent"] = bottleneck?.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    ["OccupancyIndicators:OpportunityPercent"] = opportunity?.ToString(System.Globalization.CultureInfo.InvariantCulture)
                });
            builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>().AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            builder.Services.AddAuthentication("Test")
                .AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>("Test", _ => { });
            builder.Services.AddAuthorization(o => o.AddPolicy("Admin", p => p.RequireRole("Admin")));
            var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new Host(app, connection); host.AsAdmin();
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Users.AddRange(new AppUser { Id = "admin", UserName = "admin" },
                new AppUser { Id = "teacher", UserName = "teacher" });
            var first = new Semester { Name = "2027.1", StartDate = new(2027, 3, 1), EndDate = new(2027, 3, 9) };
            var second = new Semester { Name = "2027.2", StartDate = new(2027, 4, 5), EndDate = new(2027, 4, 6) };
            var morning = new SchoolShift { Name = "Manhã", StartsAt = new(8, 0), EndsAt = new(12, 0) };
            var afternoon = new SchoolShift { Name = "Tarde", StartsAt = new(13, 0), EndsAt = new(16, 0) };
            var a = new Room { Name = "A", Seats = 30, Kind = RoomKind.Laboratorio };
            var b = new Room { Name = "B", Seats = 30, Kind = RoomKind.Comum };
            db.Semesters.AddRange(first, second); db.Shifts.AddRange(morning, afternoon); db.Rooms.AddRange(a, b);
            db.AcademicCalendarEvents.Add(new AcademicCalendarEvent { Semester = first,
                StartDate = new(2027, 3, 8), EndDate = new(2027, 3, 8),
                Kind = AcademicDayKind.Holiday, Description = "Feriado" });
            await db.SaveChangesAsync();
            host.SemesterId = first.Id; host.SecondSemesterId = second.Id;
            host.MorningId = morning.Id; host.AfternoonId = afternoon.Id;
            host.RoomAId = a.Id; host.RoomBId = b.Id;
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
