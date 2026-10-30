using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
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
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class RoomOpportunityTests
{
    [Fact]
    public async Task PeriodsSeparatePhysicalHoursFromMeetingsAndClassifyConcreteDates()
    {
        await using var host = await Host.CreateAsync();
        var result = await host.Periods();
        Assert.Equal("Known", result.GetProperty("availability").GetString());
        Assert.Equal("Compatible", result.GetProperty("compatibility").GetString());
        Assert.Equal(10m, result.GetProperty("pedagogicalHours").GetDecimal());
        Assert.Equal(4m, result.GetProperty("shiftHours").GetDecimal());
        Assert.Equal(3, result.GetProperty("requiredMeetings").GetInt32());
        Assert.Equal(12m, result.GetProperty("physicalHours").GetDecimal());
        Assert.Equal(1, result.GetProperty("potentiallyFreeMeetings").GetInt32());
        Assert.Equal(1, result.GetProperty("suitableMeetings").GetInt32());
        var days = result.GetProperty("dates").EnumerateArray().ToDictionary(
            x => x.GetProperty("date").GetString()!, x => x.GetProperty("status").GetString());
        Assert.Equal("Occupied", days["2027-03-01"]);
        Assert.Equal("Potential", days["2027-03-02"]);
        Assert.Equal("NotEligible", days["2027-03-08"]);
        Assert.Equal("NotEligible", days["2027-03-09"]);
        Assert.Equal("NotOffered", days["2027-03-03"]);
    }

    [Fact]
    public async Task CancelledPendingAndUnpublishedOccupationsDoNotBlockAndMoveChangesDates()
    {
        await using var host = await Host.CreateAsync();
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var pending = new BookingRequest { TeacherId = "teacher", Students = 20,
                StartsAt = new(2027, 3, 2, 8, 0, 0), EndsAt = new(2027, 3, 2, 12, 0, 0),
                Status = BookingStatus.Pendente, Reason = "Pendente" };
            var group = new ClassGroup { SemesterId = host.SemesterId, CourseId = host.CourseId,
                Name = "Turma", Students = 20 };
            var assignment = new TeachingAssignment { ClassGroup = group, TeacherId = "teacher",
                CurricularUnitId = host.UnitId, DisciplineName = "UC", Weekday = 1,
                PreferredShiftId = host.ShiftId };
            var plan = new SemesterPlan { SemesterId = host.SemesterId };
            var proposal = new PlanProposal { SemesterPlan = plan, Assignment = assignment,
                RoomId = host.RoomId, ShiftId = host.ShiftId, CreatedById = "teacher",
                StartDate = new(2027, 3, 2), EndDate = new(2027, 3, 2),
                Status = PlanProposalStatus.Rascunho };
            db.Bookings.Add(pending); db.PlanProposals.Add(proposal);
            await db.SaveChangesAsync();
            db.Occupations.AddRange(
                new RoomOccupation { RoomId = host.RoomId, BookingRequestId = pending.Id,
                    StartsAt = pending.StartsAt, EndsAt = pending.EndsAt, Kind = OccupationKind.Avulsa },
                new RoomOccupation { RoomId = host.RoomId, PlanProposalId = proposal.Id,
                    StartsAt = pending.StartsAt, EndsAt = pending.EndsAt, Kind = OccupationKind.Aula },
                new RoomOccupation { RoomId = host.RoomId, CancelledAtUtc = DateTime.UtcNow,
                    StartsAt = pending.StartsAt, EndsAt = pending.EndsAt, Kind = OccupationKind.Avulsa });
            await db.SaveChangesAsync();
        }
        var before = await host.Periods();
        Assert.Equal(1, before.GetProperty("potentiallyFreeMeetings").GetInt32());
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var occupied = await db.Occupations.SingleAsync(x => x.Description == "Inicial");
            occupied.StartsAt = new(2027, 3, 2, 8, 0, 0);
            occupied.EndsAt = new(2027, 3, 2, 12, 0, 0);
            await db.SaveChangesAsync();
        }
        var after = await host.Periods();
        var days = after.GetProperty("dates").EnumerateArray().ToDictionary(
            x => x.GetProperty("date").GetString()!, x => x.GetProperty("status").GetString());
        Assert.Equal("Potential", days["2027-03-01"]);
        Assert.Equal("Occupied", days["2027-03-02"]);
    }

    [Fact]
    public async Task MissingConfigurationNeverProducesPotentialDates()
    {
        await using var host = await Host.CreateAsync(configureShift: false);
        var result = await host.Periods();
        Assert.Equal("UnknownCapacity", result.GetProperty("availability").GetString());
        Assert.Equal(0, result.GetProperty("potentiallyFreeMeetings").GetInt32());
        Assert.Empty(result.GetProperty("dates").EnumerateArray());
    }

    [Fact]
    public async Task NonTeachingDayAndHighOccupationRemovePotentialPeriods()
    {
        await using var host = await Host.CreateAsync();
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AcademicCalendarEvents.Add(new AcademicCalendarEvent { SemesterId = host.SemesterId,
                StartDate = new(2027, 3, 2), EndDate = new(2027, 3, 2),
                Kind = AcademicDayKind.NonTeaching, Description = "Não letivo" });
            await db.SaveChangesAsync();
        }
        var nonTeaching = await host.Periods();
        Assert.Equal(0, nonTeaching.GetProperty("potentiallyFreeMeetings").GetInt32());
        Assert.Contains(nonTeaching.GetProperty("dates").EnumerateArray(), x =>
            x.GetProperty("date").GetString() == "2027-03-02" &&
            x.GetProperty("status").GetString() == "NotEligible");
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var day = await db.AcademicCalendarEvents.SingleAsync(x => x.Description == "Não letivo");
            db.AcademicCalendarEvents.Remove(day);
            db.Occupations.Add(new RoomOccupation { RoomId = host.RoomId,
                StartsAt = new(2027, 3, 2, 8, 0, 0), EndsAt = new(2027, 3, 2, 12, 0, 0),
                Kind = OccupationKind.Avulsa });
            await db.SaveChangesAsync();
        }
        var occupied = await host.Periods();
        Assert.Equal(0, occupied.GetProperty("potentiallyFreeMeetings").GetInt32());
        using var finalScope = host.App.Services.CreateScope();
        var finalDb = finalScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var report = await OccupancyIndicators.ForSemester(finalDb, host.SemesterId, host.RoomId,
            new SalaGest.Api.Contracts.IndicatorThresholds(85, 40));
        Assert.Equal("Bottleneck", report!.Rooms[0].Classification);
    }

    [Fact]
    public async Task MissingTechnicalRequirementsKeepFreeTimeButNoSuitableMeeting()
    {
        await using var host = await Host.CreateAsync();
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var requirement = await db.CapabilityEnvironmentRequirements.SingleAsync();
            requirement.RoomKind = null;
            await db.SaveChangesAsync();
        }
        var result = await host.Periods();
        Assert.Equal("Partial", result.GetProperty("compatibility").GetString());
        Assert.Equal(1, result.GetProperty("potentiallyFreeMeetings").GetInt32());
        Assert.Equal(0, result.GetProperty("suitableMeetings").GetInt32());
        Assert.Contains(result.GetProperty("findings").EnumerateArray(), x =>
            x.GetProperty("requirement").GetString() == "requirements" &&
            x.GetProperty("status").GetString() == "Unknown");
    }

    [Fact]
    public async Task FractionalShiftDurationUsesFullPhysicalTurnsWithoutChangingPedagogicalHours()
    {
        await using var host = await Host.CreateAsync();
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var shift = await db.Shifts.SingleAsync(x => x.Id == host.ShiftId);
            shift.EndsAt = new TimeOnly(11, 20);
            await db.SaveChangesAsync();
        }
        var result = await host.Periods();
        Assert.Equal(10m, result.GetProperty("pedagogicalHours").GetDecimal());
        Assert.Equal(3, result.GetProperty("requiredMeetings").GetInt32());
        Assert.Equal(10m, result.GetProperty("physicalHours").GetDecimal());
        Assert.Equal(3.3333m, result.GetProperty("shiftHours").GetDecimal());
    }

    [Fact]
    public async Task EndpointRequiresAdminAndRejectsInvalidOrBroadQueries()
    {
        await using var host = await Host.CreateAsync();
        var basePath = host.BasePath;
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.GetAsync($"{basePath}/capabilities?students=20")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.GetAsync($"{basePath}/capabilities/{host.CapabilityId}/periods?shiftId={host.ShiftId}&students=20&from=2027-03-01&to=2027-03-09&weekdaysMask=6")).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.GetAsync($"{basePath}/capabilities?students=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.GetAsync($"{basePath}/capabilities/{host.CapabilityId}/periods?shiftId={host.ShiftId}&students=20&from=2027-03-01&to=2028-03-09&weekdaysMask=6")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.GetAsync($"{basePath}/capabilities/{host.CapabilityId}/periods?shiftId={host.ShiftId}&students=20&from=2027-02-28&to=2027-03-09&weekdaysMask=6")).StatusCode);
    }

    [Fact]
    public async Task SuggestionsUseSg14FindingsAndDoNotWriteData()
    {
        await using var host = await Host.CreateAsync();
        var response = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"{host.BasePath}/capabilities?students=20");
        var item = response[0];
        Assert.Equal("Compatible", item.GetProperty("classification").GetString());
        Assert.Contains(item.GetProperty("findings").EnumerateArray(), x =>
            x.GetProperty("requirement").GetString() == "roomKind");
        var tooManyStudents = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"{host.BasePath}/capabilities?students=31");
        Assert.Equal("Incompatible", tooManyStudents[0].GetProperty("classification").GetString());
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.Occupations.CountAsync());
        Assert.Equal(0, await db.Bookings.CountAsync());
    }

    [Fact]
    public async Task LargeCatalogRequiresCourseFilterWithoutReturningPartialSuggestions()
    {
        await using var host = await Host.CreateAsync();
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var course = new Course { Code = "D", NormalizedCode = "D", Name = "Outro curso",
                NormalizedName = "OUTRO CURSO" };
            var module = new CourseModule { Course = course, Name = "Módulo 2",
                NormalizedName = "MODULO 2", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U2",
                NormalizedCode = "U2", Name = "UC 2", NormalizedName = "UC 2" };
            for (var i = 1; i <= 200; i++)
                unit.Capabilities.Add(new CurricularCapability { Description = $"Atividade {i}",
                    NormalizedDescription = $"ATIVIDADE {i}", Contents = "Conteúdo",
                    RequiredHours = 4, Order = i });
            db.CurricularUnits.Add(unit);
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.GetAsync($"{host.BasePath}/capabilities?students=20")).StatusCode);
        var filtered = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"{host.BasePath}/capabilities?students=20&courseId={host.CourseId}");
        Assert.Single(filtered.EnumerateArray());
    }

    [Fact]
    public void StudentCountRequiresIndividualProvenComputersWhenActivityNeedsThem()
    {
        var requirement = new CapabilityEnvironmentRequirement { RequiredComputers = 10,
            ComputersCritical = true };
        var room = new Room { Seats = 30, ComputerGroups =
            { new ComputerGroup { Quantity = 20, OperationalQuantity = 20, RamGb = 16 } } };
        var result = EnvironmentCompatibility.Evaluate(requirement, room, 25,
            new DateOnly(2027, 3, 1), oneComputerPerStudent: true);
        Assert.Equal("Incompatible", result.Classification);
        Assert.Contains(result.Findings, x => x.Requirement == "computers" &&
            x.Detail.Contains("necessários: 25"));
    }

    private sealed class Host : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public int SemesterId { get; private set; }
        public int RoomId { get; private set; }
        public int ShiftId { get; private set; }
        public int CapabilityId { get; private set; }
        public int CourseId { get; private set; }
        public int UnitId { get; private set; }
        public string BasePath => $"/api/opportunities/semesters/{SemesterId}/rooms/{RoomId}";
        private Host(WebApplication app, SqliteConnection connection)
        { App = app; this.connection = connection; Client = app.GetTestClient(); }
        public void AsAdmin() => SetRole("Admin");
        public void AsTeacher() => SetRole("Professor");
        private void SetRole(string role)
        {
            Client.DefaultRequestHeaders.Remove("X-Test-Role");
            Client.DefaultRequestHeaders.Add("X-Test-Role", role);
        }
        public async Task<System.Text.Json.JsonElement> Periods() =>
            await Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
                $"{BasePath}/capabilities/{CapabilityId}/periods?shiftId={ShiftId}&students=20&from=2027-03-01&to=2027-03-09&weekdaysMask=127");
        public static async Task<Host> CreateAsync(bool configureShift = true)
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
            var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new Host(app, connection); host.AsAdmin();
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Users.AddRange(new AppUser { Id = "admin", UserName = "admin" },
                new AppUser { Id = "teacher", UserName = "teacher" });
            var semester = new Semester { Name = "2027.1", StartDate = new(2027, 3, 1), EndDate = new(2027, 3, 9) };
            var shift = new SchoolShift { Name = "Manhã", StartsAt = new(8, 0), EndsAt = new(12, 0) };
            var room = new Room { Name = "Laboratório", Seats = 30, Kind = RoomKind.Laboratorio };
            var course = new Course { Code = "C", NormalizedCode = "C", Name = "Curso", NormalizedName = "CURSO" };
            var module = new CourseModule { Course = course, Name = "Módulo", NormalizedName = "MODULO", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U", NormalizedCode = "U", Name = "UC", NormalizedName = "UC" };
            var capability = new CurricularCapability { CurricularUnit = unit, Description = "Atividade",
                NormalizedDescription = "ATIVIDADE", Contents = "Conteúdo", RequiredHours = 10, Order = 1,
                EnvironmentRequirement = new CapabilityEnvironmentRequirement { RoomKind = RoomKind.Laboratorio } };
            db.Semesters.Add(semester); db.Shifts.Add(shift); db.Rooms.Add(room);
            db.CurricularCapabilities.Add(capability);
            db.AcademicCalendarEvents.AddRange(
                new AcademicCalendarEvent { Semester = semester, StartDate = new(2027, 3, 8),
                    EndDate = new(2027, 3, 8), Kind = AcademicDayKind.Holiday, Description = "Feriado" },
                new AcademicCalendarEvent { Semester = semester, StartDate = new(2027, 3, 9),
                    EndDate = new(2027, 3, 9), Kind = AcademicDayKind.Recess, Description = "Recesso" });
            if (configureShift) db.RoomOperatingShifts.Add(new RoomOperatingShift
            { Semester = semester, Room = room, Shift = shift, WeekdaysMask = 6 });
            db.Occupations.Add(new RoomOccupation { Room = room, StartsAt = new(2027, 3, 1, 8, 0, 0),
                EndsAt = new(2027, 3, 1, 12, 0, 0), Kind = OccupationKind.Avulsa, Description = "Inicial" });
            await db.SaveChangesAsync();
            host.SemesterId = semester.Id; host.RoomId = room.Id; host.ShiftId = shift.Id;
            host.CapabilityId = capability.Id; host.CourseId = course.Id; host.UnitId = unit.Id;
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
            var role = Request.Headers["X-Test-Role"].ToString();
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, "admin"),
                new Claim(ClaimTypes.Role, role) }, "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(
                new ClaimsPrincipal(identity), "Test")));
        }
    }
}
