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

public sealed class PeriodAgendaTests
{
    [Fact]
    public async Task WeekMonthAndSemesterUseOnlyActiveOccupationsAndEffectiveLoans()
    {
        await using var host = await Host.CreateAsync();
        host.AsAdmin();
        var week = await host.Read("from=2027-03-01T00:00:00&to=2027-03-08T00:00:00");
        Assert.Equal(4, week.Length);
        Assert.DoesNotContain(week, x => x.GetProperty("id").GetInt32() == host.CancelledId);
        Assert.DoesNotContain(week, x => x.GetProperty("bookingRequestId").ValueKind ==
            System.Text.Json.JsonValueKind.Number &&
            x.GetProperty("bookingRequestId").GetInt32() == host.PendingBookingId);
        var borrowed = Assert.Single(week, x => x.GetProperty("isBorrowed").GetBoolean());
        Assert.Equal("teacher1", borrowed.GetProperty("actualTeacherId").GetString());
        Assert.Equal(host.ClassId, borrowed.GetProperty("actualClassGroupId").GetInt32());
        Assert.Equal(host.LoanBookingId, borrowed.GetProperty("effectiveBookingRequestId").GetInt32());
        Assert.Equal("Capacidade", borrowed.GetProperty("curricularCapabilityDescription").GetString());
        var pedagogical = Assert.Single(week, x => x.GetProperty("id").GetInt32() == host.PedagogicalOccupationId);
        Assert.Equal("UC", pedagogical.GetProperty("curricularUnitName").GetString());
        Assert.Equal("Curso", pedagogical.GetProperty("courseName").GetString());
        Assert.Equal("Manhã", pedagogical.GetProperty("shiftName").GetString());
        Assert.Equal("Confirmed", pedagogical.GetProperty("status").GetString());
        Assert.Equal("Booking", pedagogical.GetProperty("source").GetString());
        Assert.Equal(2, week.Count(x => x.GetProperty("roomId").GetInt32() == host.RoomAId &&
            x.GetProperty("shiftId").GetInt32() == host.MorningShiftId));
        Assert.DoesNotContain(week, x => x.GetProperty("roomId").GetInt32() == host.RoomBId &&
            x.GetProperty("shiftId").ValueKind == System.Text.Json.JsonValueKind.Number &&
            x.GetProperty("shiftId").GetInt32() == host.AfternoonShiftId);

        var month = await host.Read("from=2027-03-01T00:00:00&to=2027-04-01T00:00:00");
        Assert.Equal(6, month.Length);
        var legacy = Assert.Single(month, x => x.GetProperty("id").GetInt32() == host.MoveOccupationId);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, legacy.GetProperty("curricularUnitId").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, legacy.GetProperty("curricularCapabilityId").ValueKind);
        Assert.Equal((int)AcademicDayKind.NonTeaching, legacy.GetProperty("calendarKind").GetInt32());
        var semester = await host.Read($"semesterId={host.SemesterId}");
        Assert.Equal(6, semester.Length);
        Assert.Equal(semester.Select(x => x.GetProperty("id").GetInt32()).Distinct().Count(), semester.Length);
        var ead = Assert.Single(month, x => x.GetProperty("id").GetInt32() == host.EadOccupationId);
        Assert.Equal((int)ClassDayStatus.Ead, ead.GetProperty("dayStatus").GetInt32());
        Assert.Equal((int)AcademicDayKind.Holiday, ead.GetProperty("calendarKind").GetInt32());
        Assert.Equal("Confirmed", ead.GetProperty("status").GetString());
    }

    [Fact]
    public async Task FiltersConflictsAndMovedOccupationReflectCurrentState()
    {
        await using var host = await Host.CreateAsync();
        host.AsAdmin();
        var range = "from=2027-03-01T00:00:00&to=2027-04-01T00:00:00";
        Assert.Equal(5, (await host.Read($"{range}&roomId={host.RoomAId}")).Length);
        Assert.Equal(4, (await host.Read($"{range}&teacherId=teacher1")).Length);
        Assert.Equal(4, (await host.Read($"{range}&classGroupId={host.ClassId}")).Length);
        Assert.Equal(5, (await host.Read($"{range}&shiftId={host.MorningShiftId}")).Length);
        Assert.Single(await host.Read($"{range}&kind={(int)OccupationKind.Bloqueio}"));
        Assert.Single(await host.Read($"{range}&dayStatus={(int)ClassDayStatus.Ead}"));
        Assert.Equal(3, (await host.Read($"{range}&bookingStatus={(int)BookingStatus.Aprovada}")).Length);
        Assert.Empty(await host.Read("from=2027-05-01T00:00:00&to=2027-05-08T00:00:00"));

        var week = await host.Read("from=2027-03-01T00:00:00&to=2027-03-08T00:00:00");
        var original = Assert.Single(week, x => x.GetProperty("id").GetInt32() == host.PedagogicalOccupationId);
        var flags = original.GetProperty("conflicts").EnumerateArray().Select(x => x.GetString()).ToArray();
        Assert.Contains("Room", flags);
        Assert.Contains("Teacher", flags);
        Assert.Contains("ClassGroup", flags);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Null((await db.Occupations.SingleAsync(x => x.Id == host.PedagogicalOccupationId)).CancelledAtUtc);
        Assert.Equal(6, await db.Occupations.CountAsync(x => x.CancelledAtUtc == null));

        host.AsTeacher();
        var moved = await host.Client.PutAsJsonAsync($"/api/occupations/{host.MoveOccupationId}/room",
            new MoveOccupation(host.RoomBId, false));
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        var after = await host.Read($"{range}&roomId={host.RoomBId}");
        Assert.Contains(after, x => x.GetProperty("id").GetInt32() == host.MoveOccupationId);
        Assert.DoesNotContain(await host.Read($"{range}&roomId={host.RoomAId}"),
            x => x.GetProperty("id").GetInt32() == host.MoveOccupationId);
    }

    [Fact]
    public async Task InvalidRangesAndUnauthorizedTeacherFiltersAreRejected()
    {
        await using var host = await Host.CreateAsync();
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.GetAsync(
            "/api/agenda?from=2027-03-02&to=2027-03-01")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.GetAsync(
            "/api/agenda?from=2027-01-01&to=2028-02-01")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.GetAsync("/api/agenda")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.GetAsync(
            $"/api/agenda?semesterId={host.SemesterId}&from=2027-02-28&to=2027-03-02")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(
            "/api/agenda?semesterId=1&teacherId=teacher2")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(
            $"/api/agenda?semesterId={host.SemesterId}&classGroupId={host.OtherClassId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.GetAsync(
            "/api/agenda?semesterId=99999")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.GetAsync(
            $"/api/agenda?semesterId={host.SemesterId}&roomId=99999")).StatusCode);
        var own = await host.Read($"semesterId={host.SemesterId}&teacherId=teacher1");
        Assert.All(own, x => Assert.Equal("teacher1", x.GetProperty("actualTeacherId").GetString()));
        var others = await host.Read($"semesterId={host.SemesterId}&roomId={host.RoomAId}");
        Assert.Null(Assert.Single(others, x => x.GetProperty("actualTeacherId").GetString() == "teacher2")
            .GetProperty("actualTeacherName").GetString());
        host.AsOtherTeacher();
        var restricted = await host.Read($"semesterId={host.SemesterId}");
        var otherClassDay = Assert.Single(restricted,
            x => x.GetProperty("id").GetInt32() == host.EadOccupationId);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, otherClassDay.GetProperty("calendarKind").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, otherClassDay.GetProperty("actualTeacherName").ValueKind);
        host.AsAnonymous();
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync(
            $"/api/agenda?semesterId={host.SemesterId}")).StatusCode);
    }

    private sealed class Host : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public int SemesterId { get; private set; }
        public int ClassId { get; private set; }
        public int OtherClassId { get; private set; }
        public int RoomAId { get; private set; }
        public int RoomBId { get; private set; }
        public int MorningShiftId { get; private set; }
        public int AfternoonShiftId { get; private set; }
        public int PedagogicalOccupationId { get; private set; }
        public int MoveOccupationId { get; private set; }
        public int EadOccupationId { get; private set; }
        public int CancelledId { get; private set; }
        public int PendingBookingId { get; private set; }
        public int LoanBookingId { get; private set; }
        private Host(WebApplication app, SqliteConnection connection)
        { App = app; this.connection = connection; Client = app.GetTestClient(); }

        public async Task<System.Text.Json.JsonElement[]> Read(string query)
        {
            var result = await Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/agenda?{query}");
            return result.EnumerateArray().ToArray();
        }
        public void AsTeacher() => SetUser("teacher1", "Professor");
        public void AsOtherTeacher() => SetUser("teacher2", "Professor");
        public void AsAdmin() => SetUser("admin", "Admin");
        public void AsAnonymous() { Client.DefaultRequestHeaders.Remove("X-Test-User");
            Client.DefaultRequestHeaders.Remove("X-Test-Role"); }
        private void SetUser(string id, string role)
        { Client.DefaultRequestHeaders.Remove("X-Test-User"); Client.DefaultRequestHeaders.Remove("X-Test-Role");
            Client.DefaultRequestHeaders.Add("X-Test-User", id);
            Client.DefaultRequestHeaders.Add("X-Test-Role", role); }

        public static async Task<Host> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>().AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            builder.Services.AddAuthentication("Test")
                .AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>("Test", _ => { });
            builder.Services.AddAuthorization(o => o.AddPolicy("Admin", p => p.RequireRole("Admin")));
            var app = builder.Build();
            app.UseAuthentication(); app.UseAuthorization(); app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new Host(app, connection);
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Users.AddRange(new AppUser { Id = "teacher1", UserName = "teacher1", DisplayName = "Professora 1" },
                new AppUser { Id = "teacher2", UserName = "teacher2", DisplayName = "Professor 2" },
                new AppUser { Id = "admin", UserName = "admin", DisplayName = "Coordenação" });
            var semester = new Semester { Name = "2027.1", StartDate = new DateOnly(2027, 3, 1),
                EndDate = new DateOnly(2027, 6, 30) };
            var morning = new SchoolShift { Name = "Manhã", StartsAt = new TimeOnly(8, 0), EndsAt = new TimeOnly(12, 0) };
            var afternoon = new SchoolShift { Name = "Tarde", StartsAt = new TimeOnly(13, 0), EndsAt = new TimeOnly(17, 0) };
            var course = new Course { Code = "C", NormalizedCode = "C", Name = "Curso", NormalizedName = "CURSO" };
            var module = new CourseModule { Course = course, Name = "Módulo", NormalizedName = "MÓDULO", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U", NormalizedCode = "U", Name = "UC", NormalizedName = "UC" };
            var capability = new CurricularCapability { CurricularUnit = unit, Description = "Capacidade",
                NormalizedDescription = "CAPACIDADE", Contents = "Conteúdo", RequiredHours = 4, Order = 1 };
            var classGroup = new ClassGroup { Name = "T1", Semester = semester, Course = course, Students = 20 };
            var otherClass = new ClassGroup { Name = "T2", Semester = semester, Course = course, Students = 20 };
            var roomA = new Room { Name = "Laboratório A", Seats = 30, Kind = RoomKind.Laboratorio };
            var roomB = new Room { Name = "Laboratório B", Seats = 30, Kind = RoomKind.Laboratorio };
            db.Assignments.Add(new TeachingAssignment { TeacherId = "teacher1", ClassGroup = classGroup,
                CurricularUnit = unit, DisciplineName = "UC", Weekday = 1, PreferredShift = morning });
            db.CurricularCapabilities.Add(capability);
            db.Classes.Add(otherClass);
            db.Rooms.AddRange(roomA, roomB);
            db.Shifts.Add(afternoon);
            await db.SaveChangesAsync();
            var first = new DateTime(2027, 3, 1, 8, 0, 0);
            var end = first.AddHours(4);
            var pedagogical = new BookingRequest { TeacherId = "teacher1", ClassGroupId = classGroup.Id,
                CurricularUnitId = unit.Id, CurricularCapabilityId = capability.Id,
                StartsAt = first, EndsAt = end, Students = 20, Reason = "Aula", Status = BookingStatus.Aprovada };
            var owner = new BookingRequest { TeacherId = "teacher2", ClassGroupId = otherClass.Id,
                StartsAt = first, EndsAt = end, Students = 20, Reason = "Reserva legada", Status = BookingStatus.Aprovada };
            var loanBooking = new BookingRequest { TeacherId = "teacher1", ClassGroupId = classGroup.Id,
                CurricularUnitId = unit.Id, CurricularCapabilityId = capability.Id,
                StartsAt = first, EndsAt = end, Students = 20, Reason = "Empréstimo", Status = BookingStatus.Aprovada };
            var pending = new BookingRequest { TeacherId = "teacher1", ClassGroupId = classGroup.Id,
                StartsAt = first, EndsAt = end, Students = 20, Reason = "Pendente" };
            var legacy = new BookingRequest { TeacherId = "teacher1", ClassGroupId = classGroup.Id,
                StartsAt = new DateTime(2027, 3, 8, 8, 0, 0), EndsAt = new DateTime(2027, 3, 8, 12, 0, 0),
                Students = 20, Reason = "Legada", Status = BookingStatus.Aprovada };
            db.Bookings.AddRange(pedagogical, owner, loanBooking, pending, legacy);
            await db.SaveChangesAsync();
            var ped = new RoomOccupation { RoomId = roomA.Id, StartsAt = first, EndsAt = end,
                Kind = OccupationKind.Avulsa, TeacherId = "teacher1", ClassGroupId = classGroup.Id,
                BookingRequestId = pedagogical.Id };
            var borrowed = new RoomOccupation { RoomId = roomB.Id, StartsAt = first, EndsAt = end,
                Kind = OccupationKind.Avulsa, TeacherId = "teacher2", ClassGroupId = otherClass.Id,
                BookingRequestId = owner.Id };
            var overlap = new RoomOccupation { RoomId = roomA.Id, StartsAt = first, EndsAt = end,
                Kind = OccupationKind.Avulsa, TeacherId = "teacher2" };
            var block = new RoomOccupation { RoomId = roomA.Id,
                StartsAt = new DateTime(2027, 3, 1, 13, 0, 0), EndsAt = new DateTime(2027, 3, 1, 17, 0, 0),
                Kind = OccupationKind.Bloqueio };
            var moved = new RoomOccupation { RoomId = roomA.Id,
                StartsAt = new DateTime(2027, 3, 8, 8, 0, 0), EndsAt = new DateTime(2027, 3, 8, 12, 0, 0),
                Kind = OccupationKind.Avulsa, TeacherId = "teacher1", ClassGroupId = classGroup.Id,
                BookingRequestId = legacy.Id };
            var ead = new RoomOccupation { RoomId = roomA.Id,
                StartsAt = new DateTime(2027, 3, 15, 8, 0, 0), EndsAt = new DateTime(2027, 3, 15, 12, 0, 0),
                Kind = OccupationKind.Aula, DayStatus = ClassDayStatus.Ead,
                TeacherId = "teacher1", ClassGroupId = classGroup.Id };
            var cancelled = new RoomOccupation { RoomId = roomA.Id, StartsAt = first, EndsAt = end,
                Kind = OccupationKind.Avulsa, CancelledAtUtc = DateTime.UtcNow };
            db.Occupations.AddRange(ped, borrowed, overlap, block, moved, ead, cancelled);
            db.AcademicCalendarEvents.Add(new AcademicCalendarEvent { SemesterId = semester.Id,
                StartDate = new DateOnly(2027, 3, 15), EndDate = new DateOnly(2027, 3, 15),
                Kind = AcademicDayKind.Holiday, Description = "Feriado" });
            db.ClassCalendarExceptions.Add(new ClassCalendarException { ClassGroupId = classGroup.Id,
                Date = new DateOnly(2027, 3, 8), Kind = AcademicDayKind.NonTeaching,
                Description = "Sem aula presencial" });
            await db.SaveChangesAsync();
            db.Loans.Add(new RoomLoan { RoomOccupationId = borrowed.Id, BookingRequestId = loanBooking.Id,
                BorrowerId = "teacher1", Status = LoanStatus.Aprovado,
                OwnerDisposition = OwnerClassDisposition.Ead, Reason = "Empréstimo" });
            await db.SaveChangesAsync();
            host.SemesterId = semester.Id; host.ClassId = classGroup.Id; host.OtherClassId = otherClass.Id;
            host.RoomAId = roomA.Id; host.RoomBId = roomB.Id;
            host.MorningShiftId = morning.Id; host.AfternoonShiftId = afternoon.Id;
            host.PedagogicalOccupationId = ped.Id; host.MoveOccupationId = moved.Id;
            host.EadOccupationId = ead.Id; host.CancelledId = cancelled.Id;
            host.PendingBookingId = pending.Id; host.LoanBookingId = loanBooking.Id;
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
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, id.ToString()),
                new Claim(ClaimTypes.Role, role) }, "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
        }
    }
}
