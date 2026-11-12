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

public sealed class PedagogicalBookingTests
{
    [Fact]
    public async Task OfficialShiftExceptionIsSingleDateAndPendingEditsRequireOwnerAndVersion()
    {
        await using var host = await Host.CreateAsync();
        host.AsTeacher();
        int softwareId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var afternoon = new SchoolShift { Name = "Tarde", StartsAt = new TimeOnly(13, 0), EndsAt = new TimeOnly(17, 0) };
            db.Shifts.Add(afternoon);
            var software = new Software { Name = "Editor de teste" };
            db.SoftwareCatalog.Add(software);
            var group = await db.Classes.FindAsync(host.ClassId);
            group!.ShiftId = await db.Shifts.Where(s => s.Name == "Manhã").Select(s => s.Id).SingleAsync();
            await db.SaveChangesAsync();
            softwareId = software.Id;
        }
        var single = host.Request() with { Recurrence = BookingRecurrence.Nenhuma, RepeatUntil = null,
            WeekdaysMask = 0, StartsAt = new DateTime(2027, 3, 1, 13, 0, 0),
            EndsAt = new DateTime(2027, 3, 1, 17, 0, 0), SoftwareIds = new List<int> { softwareId } };
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/bookings", single)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/bookings",
            single with { TurnExceptionConfirmed = true, Recurrence = BookingRecurrence.Semanal,
                RepeatUntil = new DateOnly(2027, 3, 29), WeekdaysMask = 2 })).StatusCode);
        host.AsOtherTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/bookings",
            single with { TurnExceptionConfirmed = true })).StatusCode);
        host.AsTeacher();
        var created = await host.Client.PostAsJsonAsync("/api/bookings", single with { TurnExceptionConfirmed = true });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var listed = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/bookings");
        var version = listed!.Single(b => b.GetProperty("id").GetInt32() == id).GetProperty("version").GetString()!;
        host.AsOtherTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync($"/api/bookings/{id}",
            new BookingUpdate(single, version))).StatusCode);
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync($"/api/bookings/{id}",
            new BookingUpdate(single with { TurnExceptionConfirmed = true }, Guid.NewGuid().ToString()))).StatusCode);
        var revised = host.Request() with { StartsAt = new DateTime(2027, 3, 8, 8, 0, 0),
            EndsAt = new DateTime(2027, 3, 8, 12, 0, 0), Reason = "Prática editada",
            SoftwareIds = new List<int> { softwareId } };
        var updated = await host.Client.PutAsJsonAsync($"/api/bookings/{id}",
            new BookingUpdate(revised, version));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync($"/api/bookings/{id}",
            new BookingUpdate(single with { TurnExceptionConfirmed = true }, version))).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, await db.Classes.Where(c => c.Id == host.ClassId).Select(c => c.ShiftId).SingleAsync());
            Assert.Empty(await db.Occupations.Where(o => o.BookingRequestId == id).ToListAsync());
            var edited = await db.Bookings.SingleAsync(b => b.Id == id);
            Assert.Equal(revised.StartsAt, edited.StartsAt);
            Assert.Equal(BookingRecurrence.Semanal, edited.Recurrence);
            Assert.False(edited.TurnExceptionConfirmed);
            Assert.Equal(softwareId, await db.BookingSoftware.Where(s => s.BookingRequestId == id)
                .Select(s => s.SoftwareId).SingleAsync());
        }
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync($"/api/bookings/{id}/reject", new { })).StatusCode);
        var latestVersion = (await updated.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("version").GetString()!;
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync($"/api/bookings/{id}",
            new BookingUpdate(single with { TurnExceptionConfirmed = true }, latestVersion))).StatusCode);
        var holidayRequest = await host.Client.PostAsJsonAsync("/api/bookings",
            single with { TurnExceptionConfirmed = true,
                StartsAt = new DateTime(2027, 3, 15, 13, 0, 0),
                EndsAt = new DateTime(2027, 3, 15, 17, 0, 0) });
        Assert.Equal(HttpStatusCode.Created, holidayRequest.StatusCode);
        var holidayId = (await holidayRequest.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>())
            .GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/bookings/{holidayId}/confirm", new ConfirmBooking(host.CompatibleRoomId, true,
                ExpectedAvailableDates: new List<DateOnly>()))).StatusCode);
        var approvedRequest = await host.Client.PostAsJsonAsync("/api/bookings",
            single with { TurnExceptionConfirmed = true });
        Assert.Equal(HttpStatusCode.Created, approvedRequest.StatusCode);
        var approvedId = (await approvedRequest.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>())
            .GetProperty("id").GetInt32();
        int blockingId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var blocker = new RoomOccupation { RoomId = host.CompatibleRoomId, TeacherId = "other",
                StartsAt = single.StartsAt, EndsAt = single.EndsAt, Kind = OccupationKind.Avulsa };
            db.Occupations.Add(blocker);
            await db.SaveChangesAsync();
            blockingId = blocker.Id;
        }
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/bookings/{approvedId}/confirm", new ConfirmBooking(host.CompatibleRoomId, true,
                ExpectedAvailableDates: new List<DateOnly>()))).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.Remove((await db.Occupations.FindAsync(blockingId))!);
            await db.SaveChangesAsync();
        }
        var confirmation = await host.Client.PostAsJsonAsync(
            $"/api/bookings/{approvedId}/confirm", new ConfirmBooking(host.CompatibleRoomId,
                ExpectedAvailableDates: new List<DateOnly> { new(2027, 3, 1) }));
        Assert.True(confirmation.StatusCode == HttpStatusCode.OK, await confirmation.Content.ReadAsStringAsync());
        var approvedList = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/bookings");
        var approvedVersion = approvedList!.Single(b => b.GetProperty("id").GetInt32() == approvedId)
            .GetProperty("version").GetString()!;
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync($"/api/bookings/{approvedId}",
            new BookingUpdate(single with { TurnExceptionConfirmed = true }, approvedVersion))).StatusCode);
        using var approvedScope = host.App.Services.CreateScope();
        var approvedDb = approvedScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await approvedDb.Occupations.CountAsync(o => o.BookingRequestId == approvedId &&
            o.StartsAt == single.StartsAt && o.EndsAt == single.EndsAt));
    }

    [Fact]
    public async Task CalendarCompatibilityConflictsAndPartialConfirmationUseExistingBooking()
    {
        await using var host = await Host.CreateAsync();
        host.AsTeacher();
        var request = host.Request();
        var created = await host.Client.PostAsJsonAsync("/api/bookings", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var createdJson = await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        var bookingId = createdJson.GetProperty("id").GetInt32();
        Assert.True(createdJson.GetProperty("qualificationWarning").GetBoolean());
        var listed = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/bookings");
        Assert.Equal("UC", Assert.Single(listed!).GetProperty("curricularUnitName").GetString());

        var suggestions = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>(
            $"/api/bookings/{bookingId}/suggestions");
        Assert.NotNull(suggestions);
        Assert.Equal(new[] { "Compatible", "Partial", "Incompatible" }, suggestions.Select(x =>
            x.GetProperty("technicalClassification").GetString()));
        Assert.False(suggestions[0].GetProperty("available").GetBoolean());
        var availability = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/bookings/{bookingId}/availability?roomId={host.CompatibleRoomId}");
        Assert.Equal(5, availability.GetProperty("total").GetInt32());
        Assert.Equal(2, availability.GetProperty("available").GetInt32());
        var days = availability.GetProperty("days").EnumerateArray().ToArray();
        Assert.Equal(2, days.Count(x => x.GetProperty("calendarReason").ValueKind ==
            System.Text.Json.JsonValueKind.String));
        var acceptedDates = new List<DateOnly> { new(2027, 3, 1), new(2027, 3, 29) };
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/bookings/{bookingId}/confirm", new ConfirmBooking(host.CompatibleRoomId,
                ExpectedAvailableDates: acceptedDates))).StatusCode);
        var confirmed = await host.Client.PostAsJsonAsync($"/api/bookings/{bookingId}/confirm",
            new ConfirmBooking(host.CompatibleRoomId, true, ExpectedAvailableDates: acceptedDates));
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
        var confirmedJson = await confirmed.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(2, confirmedJson.GetProperty("reservedCount").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync(
            $"/api/bookings/{bookingId}/confirm", new ConfirmBooking(host.CompatibleRoomId, true))).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(2, await db.Occupations.CountAsync(x => x.BookingRequestId == bookingId));
        Assert.Equal(1, await db.Occupations.CountAsync(x => x.RoomId == host.CompatibleRoomId &&
            x.StartsAt == new DateTime(2027, 3, 8, 8, 0, 0)));
        Assert.Equal(1, await db.Loans.CountAsync(x => x.Status == LoanStatus.Aprovado));
        var audit = await db.AuditEntries.AsNoTracking().Where(a => a.EntityType == "Booking" &&
            a.EntityId == bookingId.ToString()).OrderBy(a => a.Id).ToListAsync();
        Assert.Equal(new[] { "Criada", "Confirmada" }, audit.Select(a => a.Action).ToArray());
        Assert.All(audit, entry => Assert.Equal("teacher", entry.ActorId));
        Assert.Contains("ApprovedRoomId", audit[1].AfterJson);
        Assert.Empty(await db.Notifications.Where(n => n.RelatedType == "Booking" &&
            n.RelatedId == bookingId).ToListAsync()); // confirmação própria já foi mostrada na tela
        host.AsOtherTeacher();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.GetAsync($"/api/audit/Booking/{bookingId}")).StatusCode);
    }

    [Fact]
    public async Task InvalidPedagogicalLinksAndOtherTeachersAreRejectedWhileLegacyBookingsRemain()
    {
        await using var host = await Host.CreateAsync();
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/bookings",
            host.Request() with { CurricularCapabilityId = 99999 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/bookings",
            host.Request() with { CurricularUnitId = 99999 })).StatusCode);
        host.AsOtherTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/bookings",
            host.Request())).StatusCode);
        var inaccessible = await host.Client.PostAsJsonAsync("/api/bookings",
            host.Request() with { CurricularUnitId = null, CurricularCapabilityId = null });
        var otherBookingId = (await inaccessible.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>())
            .GetProperty("id").GetInt32();
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(
            $"/api/bookings/{otherBookingId}/suggestions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(
            $"/api/bookings/{otherBookingId}/availability?roomId={host.CompatibleRoomId}")).StatusCode);
        var legacy = host.Request() with { CurricularUnitId = null, CurricularCapabilityId = null };
        var response = await host.Client.PostAsJsonAsync("/api/bookings", legacy);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var options = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>(
            "/api/bookings/pedagogical-options");
        var option = Assert.Single(options!);
        Assert.True(option.GetProperty("qualificationWarning").GetBoolean());
    }

    [Fact]
    public async Task PartialRoomAndCalendarOnlyDateCannotBeConfirmed()
    {
        await using var host = await Host.CreateAsync();
        host.AsTeacher();
        var created = await host.Client.PostAsJsonAsync("/api/bookings", host.Request());
        var id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var options = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>($"/api/bookings/{id}/suggestions");
        var partialRoomId = options![1].GetProperty("id").GetInt32();
        Assert.Equal("Partial", options[1].GetProperty("technicalClassification").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/bookings/{id}/confirm", new ConfirmBooking(partialRoomId, true))).StatusCode);

        var holiday = host.Request() with { StartsAt = new DateTime(2027, 3, 15, 8, 0, 0),
            EndsAt = new DateTime(2027, 3, 15, 12, 0, 0), Recurrence = BookingRecurrence.Nenhuma,
            RepeatUntil = null, WeekdaysMask = 0 };
        created = await host.Client.PostAsJsonAsync("/api/bookings", holiday);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var availability = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/bookings/{id}/availability?roomId={host.CompatibleRoomId}");
        Assert.Equal(0, availability.GetProperty("available").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/bookings/{id}/confirm", new ConfirmBooking(host.CompatibleRoomId, true))).StatusCode);
    }

    [Fact]
    public async Task ConflictAddedAfterPreviewIsRecheckedBeforeSaving()
    {
        await using var host = await Host.CreateAsync();
        host.AsTeacher();
        var single = host.Request() with { Recurrence = BookingRecurrence.Nenhuma,
            RepeatUntil = null, WeekdaysMask = 0 };
        var created = await host.Client.PostAsJsonAsync("/api/bookings", single);
        var id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var before = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/bookings/{id}/availability?roomId={host.CompatibleRoomId}");
        Assert.Equal(1, before.GetProperty("available").GetInt32());
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.Add(new RoomOccupation { RoomId = host.CompatibleRoomId, TeacherId = "other",
                StartsAt = single.StartsAt, EndsAt = single.EndsAt, Kind = OccupationKind.Avulsa });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/bookings/{id}/confirm", new ConfirmBooking(host.CompatibleRoomId,
                ExpectedAvailableDates: new List<DateOnly> { new(2027, 3, 1) }))).StatusCode);
        using var check = host.App.Services.CreateScope();
        Assert.False(await check.ServiceProvider.GetRequiredService<AppDbContext>().Occupations
            .AnyAsync(x => x.BookingRequestId == id));
    }

    [Fact]
    public async Task MissingRequirementsAndDatesOutsideSemesterCannotBeConfirmed()
    {
        await using var host = await Host.CreateAsync();
        host.AsTeacher();
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.CapabilityEnvironmentRequirements.Remove(await db.CapabilityEnvironmentRequirements.SingleAsync());
            await db.SaveChangesAsync();
        }
        var single = host.Request() with { Recurrence = BookingRecurrence.Nenhuma,
            RepeatUntil = null, WeekdaysMask = 0 };
        var created = await host.Client.PostAsJsonAsync("/api/bookings", single);
        var id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var suggestions = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>(
            $"/api/bookings/{id}/suggestions");
        Assert.All(suggestions!, x => Assert.NotEqual("Compatible",
            x.GetProperty("technicalClassification").GetString()));
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/bookings/{id}/confirm", new ConfirmBooking(host.CompatibleRoomId,
                ExpectedAvailableDates: new List<DateOnly> { new(2027, 3, 1) }))).StatusCode);

        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.CapabilityEnvironmentRequirements.Add(new CapabilityEnvironmentRequirement
            { CurricularCapabilityId = host.CapabilityId, RoomKind = RoomKind.Laboratorio,
                RequiredComputers = 20, MinRamGb = 16 });
            await db.SaveChangesAsync();
        }
        var outside = single with { StartsAt = new DateTime(2027, 4, 5, 8, 0, 0),
            EndsAt = new DateTime(2027, 4, 5, 12, 0, 0) };
        created = await host.Client.PostAsJsonAsync("/api/bookings", outside);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var availability = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/bookings/{id}/availability?roomId={host.CompatibleRoomId}");
        Assert.Equal(0, availability.GetProperty("available").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(
            $"/api/bookings/{id}/confirm", new ConfirmBooking(host.CompatibleRoomId, true,
                ExpectedAvailableDates: new List<DateOnly>()))).StatusCode);
    }

    private sealed class Host : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public int ClassId { get; private set; }
        public int UnitId { get; private set; }
        public int CapabilityId { get; private set; }
        public int CompatibleRoomId { get; private set; }
        private Host(WebApplication app, SqliteConnection connection)
        { App = app; this.connection = connection; Client = app.GetTestClient(); }

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
            db.Users.AddRange(new AppUser { Id = "teacher", UserName = "teacher" },
                new AppUser { Id = "other", UserName = "other" });
            var semester = new Semester { Name = "2027.1", StartDate = new DateOnly(2027, 3, 1),
                EndDate = new DateOnly(2027, 3, 31) };
            var shift = new SchoolShift { Name = "Manhã", StartsAt = new TimeOnly(8, 0), EndsAt = new TimeOnly(12, 0) };
            var course = new Course { Code = "C", NormalizedCode = "C", Name = "Curso", NormalizedName = "CURSO" };
            var module = new CourseModule { Course = course, Name = "Módulo", NormalizedName = "MÓDULO", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U", NormalizedCode = "U", Name = "UC", NormalizedName = "UC" };
            var capability = new CurricularCapability { CurricularUnit = unit, Description = "Modelagem", NormalizedDescription = "MODELAGEM",
                Contents = "CAD", RequiredHours = 4, Order = 1,
                EnvironmentRequirement = new CapabilityEnvironmentRequirement { RoomKind = RoomKind.Laboratorio,
                    RequiredComputers = 20, MinRamGb = 16 } };
            var classGroup = new ClassGroup { Name = "Turma", Students = 25, Semester = semester, Course = course };
            db.Assignments.Add(new TeachingAssignment { TeacherId = "teacher", ClassGroup = classGroup,
                CurricularUnit = unit, DisciplineName = "UC", Weekday = 1, PreferredShift = shift });
            db.CurricularCapabilities.Add(capability);
            var compatible = new Room { Name = "A", Kind = RoomKind.Laboratorio, Seats = 30,
                ComputerGroups = { new ComputerGroup { Description = "A", Quantity = 20, OperationalQuantity = 20, RamGb = 16 } } };
            db.Rooms.AddRange(compatible,
                new Room { Name = "B", Kind = RoomKind.Laboratorio, Seats = 30,
                    ComputerGroups = { new ComputerGroup { Description = "B", Quantity = 10, OperationalQuantity = 10, RamGb = 16 } } },
                new Room { Name = "C", Kind = RoomKind.Laboratorio, Seats = 20 });
            db.AcademicCalendarEvents.AddRange(
                new AcademicCalendarEvent { Semester = semester, StartDate = new DateOnly(2027, 3, 15),
                    EndDate = new DateOnly(2027, 3, 15), Kind = AcademicDayKind.Holiday, Description = "Feriado" },
                new AcademicCalendarEvent { Semester = semester, StartDate = new DateOnly(2027, 3, 22),
                    EndDate = new DateOnly(2027, 3, 22), Kind = AcademicDayKind.Ead, Description = "EAD" });
            await db.SaveChangesAsync();
            db.Occupations.Add(new RoomOccupation { RoomId = compatible.Id, TeacherId = "other",
                StartsAt = new DateTime(2027, 3, 8, 8, 0, 0), EndsAt = new DateTime(2027, 3, 8, 12, 0, 0),
                Kind = OccupationKind.Avulsa });
            await db.SaveChangesAsync();
            var occupied = await db.Occupations.SingleAsync();
            var loanBooking = new BookingRequest { TeacherId = "other", StartsAt = occupied.StartsAt,
                EndsAt = occupied.EndsAt, Students = 1, Reason = "Empréstimo existente", Status = BookingStatus.Aprovada };
            db.Loans.Add(new RoomLoan { RoomOccupationId = occupied.Id, BookingRequest = loanBooking,
                BorrowerId = "other", Status = LoanStatus.Aprovado, Reason = "Aula anterior" });
            await db.SaveChangesAsync();
            host.ClassId = classGroup.Id; host.UnitId = unit.Id;
            host.CapabilityId = capability.Id; host.CompatibleRoomId = compatible.Id;
            return host;
        }

        public BookingCreate Request() => new(ClassId, new DateTime(2027, 3, 1, 8, 0, 0),
            new DateTime(2027, 3, 1, 12, 0, 0), 25, false, false, false, HardwareTier.Basico,
            new List<int>(), "Modelagem", null, BookingRecurrence.Semanal, new DateOnly(2027, 3, 29),
            WeekdaysMask: 2, CurricularUnitId: UnitId, CurricularCapabilityId: CapabilityId);
        public void AsTeacher() => SetRole("teacher");
        public void AsOtherTeacher() => SetRole("other");
        private void SetRole(string id)
        { Client.DefaultRequestHeaders.Remove("X-Test-User"); Client.DefaultRequestHeaders.Add("X-Test-User", id); }
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
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, id.ToString()),
                new Claim(ClaimTypes.Role, "Professor") }, "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
        }
    }
}
