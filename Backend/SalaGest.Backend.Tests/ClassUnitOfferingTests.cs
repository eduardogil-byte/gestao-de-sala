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

public sealed class ClassUnitOfferingTests
{
    [Fact]
    public async Task FixedEadMeetingCanChangeDateWithoutCreatingRoomOccupation()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Semesters.FindAsync(host.SemesterId))!.EndDate = new(2027, 1, 6);
            (await db.Shifts.FindAsync(host.ShiftId))!.PedagogicalHours = 4;
            (await db.CurricularUnits.FindAsync(host.PresentialUnitId))!.PlannedHours = 4;
            db.Availabilities.AddRange(new[] { 2, 5 }.Select(day => new TeacherAvailability
            { TeacherId = host.TeacherId, Weekday = day, ShiftId = host.ShiftId }));
            await db.SaveChangesAsync();
        }
        var created = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Ead, EadScheduleMode.HorarioDefinido),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.SemHorarioFixo)]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var classId = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        foreach (var unitId in new[] { host.PresentialUnitId, host.EadUnitId })
            Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
                $"/api/classes/{classId}/units/{unitId}/teacher", new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        var generated = await host.Client.PostAsync($"/api/schedules/generate/{host.SemesterId}", null);
        var scheduleId = (await generated.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var detail = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/schedules/{scheduleId}");
        var plan = detail.GetProperty("unitPlans").EnumerateArray().Single(x =>
            x.GetProperty("curricularUnitId").GetInt32() == host.PresentialUnitId);
        var path = $"/api/schedules/{scheduleId}/unit-plans/{plan.GetProperty("id").GetInt32()}/meeting";
        var id = plan.GetProperty("meetings")[0].GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync(path,
            new ScheduleMeetingAdjustmentInput(id, new(2027, 1, 5), host.ShiftId, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync(path,
            new ScheduleMeetingAdjustmentInput(id, new(2027, 1, 5), host.ShiftId, null))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync($"/api/schedules/{scheduleId}/publish", null)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Empty(await db.Occupations.ToListAsync());
            Assert.Equal(new DateOnly(2027, 1, 5), (await db.ScheduleUnitMeetings.FindAsync(id))!.Date);
        }
    }

    [Fact]
    public async Task PendingUnitCanBeAllocatedFromCompatibleSuggestionWithoutChangingItsHours()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Semesters.FindAsync(host.SemesterId))!.EndDate = new(2027, 1, 1);
            (await db.Shifts.FindAsync(host.ShiftId))!.PedagogicalHours = 4;
            (await db.CurricularUnits.FindAsync(host.PresentialUnitId))!.PlannedHours = 4;
            db.Availabilities.Add(new TeacherAvailability { TeacherId = host.TeacherId,
                Weekday = 5, ShiftId = host.ShiftId });
            await db.SaveChangesAsync();
        }
        var created = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Presencial),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.SemHorarioFixo)]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var classId = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        foreach (var unitId in new[] { host.PresentialUnitId, host.EadUnitId })
            Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
                $"/api/classes/{classId}/units/{unitId}/teacher",
                new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        var generated = await host.Client.PostAsync($"/api/schedules/generate/{host.SemesterId}", null);
        var scheduleId = (await generated.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var detail = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/schedules/{scheduleId}");
        var plan = detail.GetProperty("unitPlans").EnumerateArray().Single(x =>
            x.GetProperty("curricularUnitId").GetInt32() == host.PresentialUnitId);
        var path = $"/api/schedules/{scheduleId}/unit-plans/{plan.GetProperty("id").GetInt32()}";
        Assert.Equal(4, plan.GetProperty("unallocatedHours").GetDecimal());
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsync(
            $"/api/schedules/{scheduleId}/publish", null)).StatusCode);
        var empty = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"{path}/alternatives");
        Assert.Equal(0, empty.GetArrayLength());
        int roomId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var resource = await db.ResourceCatalog.SingleAsync();
            var room = new Room { Name = "Sala adequada", Seats = 30, Active = true,
                Resources = [new RoomResource { ResourceCatalogItem = resource, Name = resource.Name,
                    NormalizedName = resource.NormalizedName, Type = resource.Category,
                    NormalizedType = resource.Category.ToUpperInvariant(), Quantity = 1, OperationalQuantity = 1 }] };
            db.Rooms.Add(room); await db.SaveChangesAsync(); roomId = room.Id;
        }
        var suggestions = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"{path}/alternatives");
        Assert.Single(suggestions.EnumerateArray());
        Assert.Equal(roomId, suggestions[0].GetProperty("roomId").GetInt32());
        var adjustment = new ScheduleMeetingAdjustmentInput(null, new(2027, 1, 1), host.ShiftId, roomId);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync($"{path}/meeting", adjustment)).StatusCode);
        detail = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/schedules/{scheduleId}");
        Assert.Equal(0, detail.GetProperty("unallocatedMeetings").GetInt32());
        var updatedPlan = detail.GetProperty("unitPlans").EnumerateArray().Single(x =>
            x.GetProperty("curricularUnitId").GetInt32() == host.PresentialUnitId);
        Assert.Equal(4, updatedPlan.GetProperty("allocatedHours").GetDecimal());
        Assert.Equal(0, updatedPlan.GetProperty("unallocatedHours").GetDecimal());
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync(
            $"/api/schedules/{scheduleId}/publish", null)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
            Assert.Single(await scope.ServiceProvider.GetRequiredService<AppDbContext>().Occupations.ToListAsync());
    }

    [Fact]
    public async Task DraftMeetingCanMoveWithoutRegeneratingOtherUnitsAndPublishedMeetingCannotChange()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Semesters.FindAsync(host.SemesterId))!.EndDate = new(2027, 1, 15);
            (await db.Shifts.FindAsync(host.ShiftId))!.PedagogicalHours = 4;
            (await db.CurricularUnits.FindAsync(host.PresentialUnitId))!.PlannedHours = 4;
            var resource = await db.ResourceCatalog.SingleAsync();
            db.Rooms.Add(new Room { Name = "Sala com projetor", Seats = 30, Active = true,
                Resources = [new RoomResource { ResourceCatalogItem = resource, Name = resource.Name,
                    NormalizedName = resource.NormalizedName, Type = resource.Category,
                    NormalizedType = resource.Category.ToUpperInvariant(), Quantity = 1, OperationalQuantity = 1 }] });
            db.Availabilities.AddRange(Enumerable.Range(1, 5).Select(day => new TeacherAvailability
            { TeacherId = host.TeacherId, Weekday = day, ShiftId = host.ShiftId }));
            db.AcademicCalendarEvents.Add(new AcademicCalendarEvent { SemesterId = host.SemesterId,
                StartDate = new(2027, 1, 4), EndDate = new(2027, 1, 4),
                Kind = AcademicDayKind.Holiday, Description = "Feriado sintético" });
            await db.SaveChangesAsync();
        }
        var created = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Presencial),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.SemHorarioFixo)]));
        var classId = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        foreach (var unitId in new[] { host.PresentialUnitId, host.EadUnitId })
            Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
                $"/api/classes/{classId}/units/{unitId}/teacher", new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        var generated = await host.Client.PostAsync($"/api/schedules/generate/{host.SemesterId}", null);
        var scheduleId = (await generated.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var original = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/schedules/{scheduleId}");
        var plans = original.GetProperty("unitPlans").EnumerateArray().ToList();
        var physical = plans.Single(p => p.GetProperty("curricularUnitId").GetInt32() == host.PresentialUnitId);
        var online = plans.Single(p => p.GetProperty("curricularUnitId").GetInt32() == host.EadUnitId);
        var planId = physical.GetProperty("id").GetInt32();
        var meeting = physical.GetProperty("meetings")[0];
        var meetingId = meeting.GetProperty("id").GetInt32();
        var roomId = meeting.GetProperty("roomId").GetInt32();
        var path = $"/api/schedules/{scheduleId}/unit-plans/{planId}";
        var holiday = new ScheduleMeetingAdjustmentInput(meetingId, new(2027, 1, 4), host.ShiftId, roomId);
        var holidayPreview = await host.Client.PostAsJsonAsync($"{path}/meeting-preview", holiday);
        Assert.False((await holidayPreview.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>())
            .GetProperty("allowed").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync($"{path}/meeting", holiday)).StatusCode);
        int unauthorizedShiftId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var otherShift = new SchoolShift { Name = "Tarde", StartsAt = new(13, 0),
                EndsAt = new(17, 0), PedagogicalHours = 4 };
            db.Shifts.Add(otherShift); await db.SaveChangesAsync(); unauthorizedShiftId = otherShift.Id;
        }
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync($"{path}/meeting",
            new ScheduleMeetingAdjustmentInput(meetingId, new(2027, 1, 5), unauthorizedShiftId, roomId))).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.Add(new RoomOccupation { RoomId = roomId, TeacherId = host.TeacherId,
                ClassGroupId = classId, Kind = OccupationKind.Aula,
                StartsAt = new(2027, 1, 6, 8, 0, 0), EndsAt = new(2027, 1, 6, 12, 0, 0) });
            await db.SaveChangesAsync();
        }
        var conflicting = new ScheduleMeetingAdjustmentInput(meetingId, new(2027, 1, 6), host.ShiftId, roomId);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync($"{path}/meeting", conflicting)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
            Assert.Equal(new DateOnly(2027, 1, 1), (await scope.ServiceProvider.GetRequiredService<AppDbContext>()
                .ScheduleUnitMeetings.FindAsync(meetingId))!.Date);
        var alternatives = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"{path}/alternatives?meetingId={meetingId}&from=2027-01-04");
        Assert.DoesNotContain(alternatives.EnumerateArray(), x => x.GetProperty("date").GetString() == "2027-01-04");
        int replacementRoomId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var resource = await db.ResourceCatalog.SingleAsync();
            var replacement = new Room { Name = "Sala alternativa", Seats = 30, Active = true,
                Resources = [new RoomResource { ResourceCatalogItem = resource, Name = resource.Name,
                    NormalizedName = resource.NormalizedName, Type = resource.Category,
                    NormalizedType = resource.Category.ToUpperInvariant(), Quantity = 1, OperationalQuantity = 1 }] };
            db.Rooms.Add(replacement); await db.SaveChangesAsync(); replacementRoomId = replacement.Id;
        }
        var moved = new ScheduleMeetingAdjustmentInput(meetingId, new(2027, 1, 5), host.ShiftId, replacementRoomId);
        host.As("Professor");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync($"{path}/meeting", moved)).StatusCode);
        host.As("Admin");
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync($"{path}/meeting", moved)).StatusCode);
        var updated = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/schedules/{scheduleId}");
        var updatedPlans = updated.GetProperty("unitPlans").EnumerateArray().ToList();
        Assert.Equal("2027-01-05", updatedPlans.Single(p => p.GetProperty("id").GetInt32() == planId)
            .GetProperty("meetings")[0].GetProperty("date").GetString());
        Assert.Equal(replacementRoomId, updatedPlans.Single(p => p.GetProperty("id").GetInt32() == planId)
            .GetProperty("meetings")[0].GetProperty("roomId").GetInt32());
        Assert.Equal(online.GetProperty("meetings")[0].GetProperty("plannedHours").GetDecimal(),
            updatedPlans.Single(p => p.GetProperty("curricularUnitId").GetInt32() == host.EadUnitId)
                .GetProperty("meetings")[0].GetProperty("plannedHours").GetDecimal());
        Assert.Equal(4, updatedPlans.Single(p => p.GetProperty("id").GetInt32() == planId)
            .GetProperty("allocatedHours").GetDecimal());
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync($"/api/schedules/{scheduleId}/publish", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync($"{path}/meeting", moved)).StatusCode);
    }

    [Fact]
    public async Task PedagogicalHoursConfigurationRequiresAdminAndValidValue()
    {
        await using var host = await Host.CreateAsync();
        var path = $"/api/shifts/{host.ShiftId}/pedagogical-hours";
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PutAsJsonAsync(path,
            new ShiftPedagogicalHoursInput(4))).StatusCode);
        host.As("Professor");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync(path,
            new ShiftPedagogicalHoursInput(4))).StatusCode);
        host.As("Admin");
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync(path,
            new ShiftPedagogicalHoursInput(0))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync(path,
            new ShiftPedagogicalHoursInput(4.123m))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(path,
            new ShiftPedagogicalHoursInput(4))).StatusCode);
        using var scope = host.App.Services.CreateScope();
        Assert.Equal(4, (await scope.ServiceProvider.GetRequiredService<AppDbContext>()
            .Shifts.FindAsync(host.ShiftId))!.PedagogicalHours);
    }

    [Fact]
    public async Task SemesterDraftAlternatesUnitsSkipsHolidayAndPublishesOnlyPhysicalRoom()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var semester = await db.Semesters.FindAsync(host.SemesterId);
            semester!.EndDate = new(2027, 1, 15);
            var shift = await db.Shifts.FindAsync(host.ShiftId);
            shift!.PedagogicalHours = 4;
            (await db.CurricularUnits.FindAsync(host.PresentialUnitId))!.PlannedHours = 8;
            (await db.CurricularUnits.FindAsync(host.EadUnitId))!.PlannedHours = 8;
            var resource = await db.ResourceCatalog.SingleAsync();
            db.Rooms.Add(new Room { Name = "Sala técnica", Seats = 30, Active = true,
                Resources = [new RoomResource { ResourceCatalogItem = resource, Name = resource.Name,
                    NormalizedName = resource.NormalizedName, Type = resource.Category,
                    NormalizedType = resource.Category.ToUpperInvariant(), Quantity = 1, OperationalQuantity = 1 }] });
            db.Availabilities.AddRange(Enumerable.Range(1, 5).Select(day => new TeacherAvailability
            { TeacherId = host.TeacherId, Weekday = day, ShiftId = host.ShiftId }));
            db.AcademicCalendarEvents.Add(new AcademicCalendarEvent { SemesterId = host.SemesterId,
                StartDate = new(2027, 1, 4), EndDate = new(2027, 1, 4), Kind = AcademicDayKind.Holiday,
                Description = "Feriado sintético" });
            await db.SaveChangesAsync();
        }
        var created = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Presencial),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.HorarioDefinido)]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var classId = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        foreach (var unitId in new[] { host.PresentialUnitId, host.EadUnitId })
            Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
                $"/api/classes/{classId}/units/{unitId}/teacher", new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        var generated = await host.Client.PostAsync($"/api/schedules/generate/{host.SemesterId}", null);
        Assert.Equal(HttpStatusCode.OK, generated.StatusCode);
        var scheduleId = (await generated.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var detail = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/schedules/{scheduleId}");
        var plans = detail.GetProperty("unitPlans").EnumerateArray().ToList();
        Assert.Equal(2, plans.Count);
        Assert.All(plans, x =>
        {
            Assert.Equal("Curso", x.GetProperty("courseName").GetString());
            Assert.Equal("Módulo", x.GetProperty("moduleName").GetString());
        });
        Assert.All(plans, x => { Assert.Equal(8, x.GetProperty("allocatedHours").GetDecimal());
            Assert.Equal(System.Text.Json.JsonValueKind.Null, x.GetProperty("pendingReason").ValueKind); });
        var meetings = plans.SelectMany(x => x.GetProperty("meetings").EnumerateArray()).ToList();
        Assert.Equal(4, meetings.Count);
        Assert.DoesNotContain(meetings, x => x.GetProperty("date").GetString() == "2027-01-04");
        Assert.Equal(4, meetings.Select(x => x.GetProperty("date").GetString()).Distinct().Count());
        Assert.All(plans.Single(x => x.GetProperty("deliveryMode").GetString() == "Ead")
            .GetProperty("meetings").EnumerateArray(), x =>
                Assert.Equal(System.Text.Json.JsonValueKind.Null, x.GetProperty("roomId").ValueKind));
        using (var scope = host.App.Services.CreateScope())
            Assert.Empty(await scope.ServiceProvider.GetRequiredService<AppDbContext>().Occupations.ToListAsync());
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var resource = await db.RoomResources.SingleAsync();
            resource.OperationalQuantity = 0;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsync($"/api/schedules/{scheduleId}/publish", null)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Empty(await db.Occupations.ToListAsync());
            (await db.RoomResources.SingleAsync()).OperationalQuantity = 1;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync($"/api/schedules/{scheduleId}/publish", null)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
            Assert.Equal(2, await scope.ServiceProvider.GetRequiredService<AppDbContext>().Occupations.CountAsync());
        var agenda = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/agenda?semesterId={host.SemesterId}");
        Assert.Equal(2, agenda.GetArrayLength());
        Assert.All(agenda.EnumerateArray(), item =>
        {
            Assert.Equal("Schedule", item.GetProperty("source").GetString());
            Assert.Equal(host.PresentialUnitId, item.GetProperty("curricularUnitId").GetInt32());
        });
        int occupationId;
        int replacementRoomId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            occupationId = (await db.Occupations.FirstAsync()).Id;
            var replacement = new Room { Name = "Sala substituta", Seats = 30, Active = true };
            db.Rooms.Add(replacement);
            await db.SaveChangesAsync();
            replacementRoomId = replacement.Id;
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync(
            $"/api/occupations/{occupationId}/room", new MoveOccupation(replacementRoomId))).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var resource = await db.ResourceCatalog.SingleAsync();
            db.RoomResources.Add(new RoomResource { RoomId = replacementRoomId,
                ResourceCatalogItemId = resource.Id, Name = resource.Name,
                NormalizedName = resource.NormalizedName, Type = resource.Category,
                NormalizedType = resource.Category.ToUpperInvariant(), Quantity = 1, OperationalQuantity = 1 });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync(
            $"/api/occupations/{occupationId}/room", new MoveOccupation(replacementRoomId))).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var moved = await db.Occupations.SingleAsync(o => o.Id == occupationId);
            Assert.Equal(replacementRoomId, moved.RoomId);
            Assert.Equal(replacementRoomId, (await db.ScheduleUnitMeetings.SingleAsync(
                m => m.Id == moved.ScheduleUnitMeetingId)).RoomId);
        }
    }

    [Fact]
    public async Task TeacherSharedAcrossCoursesCannotOccupySameSlotAndIncompletePlanCannotPublish()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Semesters.FindAsync(host.SemesterId))!.EndDate = new(2027, 1, 1);
            (await db.Shifts.FindAsync(host.ShiftId))!.PedagogicalHours = 4;
            (await db.CurricularUnits.FindAsync(host.PresentialUnitId))!.PlannedHours = 4;
            (await db.CurricularUnits.FindAsync(host.EadUnitId))!.PlannedHours = 4;
            (await db.CurricularUnits.FindAsync(host.ForeignUnitId))!.PlannedHours = 4;
            db.TeacherUnitQualifications.Add(new TeacherUnitQualification
            { TeacherId = host.TeacherId, CurricularUnitId = host.ForeignUnitId });
            db.Availabilities.Add(new TeacherAvailability { TeacherId = host.TeacherId, Weekday = 5, ShiftId = host.ShiftId });
            await db.SaveChangesAsync();
        }
        var first = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Ead, EadScheduleMode.HorarioDefinido),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.HorarioDefinido)]));
        var second = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.ForeignUnitId, UnitDeliveryMode.Ead, EadScheduleMode.HorarioDefinido)]) with
            { CourseId = host.OtherCourseId, CourseModuleId = host.WrongModuleId, Name = "Outra turma" });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        var firstId = (await first.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var secondId = (await second.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        foreach (var (classId, unitId) in new[] { (firstId, host.PresentialUnitId), (firstId, host.EadUnitId),
                     (secondId, host.ForeignUnitId) })
            Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
                $"/api/classes/{classId}/units/{unitId}/teacher", new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        var generated = await host.Client.PostAsync($"/api/schedules/generate/{host.SemesterId}", null);
        var scheduleId = (await generated.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var detail = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/schedules/{scheduleId}");
        Assert.Equal(3, detail.GetProperty("unitPlans").GetArrayLength());
        Assert.True(detail.GetProperty("unallocatedMeetings").GetInt32() > 0);
        Assert.Contains(detail.GetProperty("unitPlans").EnumerateArray(), x =>
            x.GetProperty("pendingReason").ValueKind == System.Text.Json.JsonValueKind.String &&
            x.GetProperty("pendingReason").GetString()!.Contains("Instrutor"));
        Assert.Equal(1, detail.GetProperty("unitPlans").EnumerateArray().Sum(x => x.GetProperty("meetings").GetArrayLength()));
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsync($"/api/schedules/{scheduleId}/publish", null)).StatusCode);
    }

    [Fact]
    public async Task FixedOnlineMeetingRevalidatesTeacherConflictAndNeverOccupiesPhysicalRoom()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        int roomId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Semesters.FindAsync(host.SemesterId))!.EndDate = new(2027, 1, 1);
            (await db.Shifts.FindAsync(host.ShiftId))!.PedagogicalHours = 4;
            (await db.CurricularUnits.FindAsync(host.PresentialUnitId))!.PlannedHours = 4;
            (await db.CurricularUnits.FindAsync(host.EadUnitId))!.PlannedHours = 4;
            db.Availabilities.Add(new TeacherAvailability { TeacherId = host.TeacherId, Weekday = 5, ShiftId = host.ShiftId });
            var room = new Room { Name = "Outra sala", Seats = 30, Active = true };
            db.Rooms.Add(room); await db.SaveChangesAsync(); roomId = room.Id;
        }
        var created = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Ead, EadScheduleMode.HorarioDefinido),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.SemHorarioFixo)]));
        var classId = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        foreach (var unitId in new[] { host.PresentialUnitId, host.EadUnitId })
            Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
                $"/api/classes/{classId}/units/{unitId}/teacher", new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        var generated = await host.Client.PostAsync($"/api/schedules/generate/{host.SemesterId}", null);
        var scheduleId = (await generated.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.Add(new RoomOccupation { RoomId = roomId,
                StartsAt = new(2027, 1, 1, 8, 0, 0), EndsAt = new(2027, 1, 1, 12, 0, 0),
                TeacherId = host.TeacherId, Kind = OccupationKind.Aula });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsync($"/api/schedules/{scheduleId}/publish", null)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.Remove(await db.Occupations.SingleAsync());
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync($"/api/schedules/{scheduleId}/publish", null)).StatusCode);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Empty(await db.Occupations.ToListAsync());
            Assert.Contains("on-line", await ReservationRules.ConflictAsync(db, roomId,
                new(2027, 1, 1, 8, 0, 0), new(2027, 1, 1, 12, 0, 0), host.TeacherId, null));
        }
    }

    [Fact]
    public async Task GeneratorDistinguishesInsufficientResourceFromCompatibleButOccupiedRoom()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        int roomId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Semesters.FindAsync(host.SemesterId))!.EndDate = new(2027, 1, 1);
            (await db.Shifts.FindAsync(host.ShiftId))!.PedagogicalHours = 4;
            (await db.CurricularUnits.FindAsync(host.PresentialUnitId))!.PlannedHours = 4;
            db.Availabilities.Add(new TeacherAvailability { TeacherId = host.TeacherId, Weekday = 5, ShiftId = host.ShiftId });
            var resource = await db.ResourceCatalog.SingleAsync();
            var room = new Room { Name = "Laboratório", Seats = 30, Active = true,
                Resources = [new RoomResource { ResourceCatalogItem = resource, Name = resource.Name,
                    NormalizedName = resource.NormalizedName, Type = resource.Category,
                    NormalizedType = resource.Category.ToUpperInvariant(), Quantity = 1, OperationalQuantity = 0 }] };
            db.Rooms.Add(room); await db.SaveChangesAsync(); roomId = room.Id;
        }
        var created = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Presencial),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.SemHorarioFixo)]));
        var classId = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
            $"/api/classes/{classId}/units/{host.PresentialUnitId}/teacher",
            new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        async Task<string?> PendingReason()
        {
            var generated = await host.Client.PostAsync($"/api/schedules/generate/{host.SemesterId}", null);
            var id = (await generated.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
            var detail = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/schedules/{id}");
            return detail.GetProperty("unitPlans").EnumerateArray().Single(x =>
                x.GetProperty("curricularUnitId").GetInt32() == host.PresentialUnitId)
                .GetProperty("pendingReason").GetString();
        }
        Assert.Contains("Recursos obrigatórios", await PendingReason());
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.RoomResources.SingleAsync()).OperationalQuantity = 1;
            db.Occupations.Add(new RoomOccupation { RoomId = roomId, Kind = OccupationKind.Bloqueio,
                StartsAt = new(2027, 1, 1, 8, 0, 0), EndsAt = new(2027, 1, 1, 12, 0, 0) });
            await db.SaveChangesAsync();
        }
        Assert.Contains("compatíveis, mas ocupados", await PendingReason());
    }

    [Fact]
    public async Task AsyncEadNeedsNoRoomOrAvailabilityButMissingHoursBlockPublication()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        var created = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Presencial),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.SemHorarioFixo)]));
        var classId = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(
            $"/api/classes/{classId}/units/{host.EadUnitId}/teacher", new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        var generated = await host.Client.PostAsync($"/api/schedules/generate/{host.SemesterId}", null);
        var scheduleId = (await generated.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var detail = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/schedules/{scheduleId}");
        var plans = detail.GetProperty("unitPlans").EnumerateArray().ToList();
        Assert.Equal(20, plans.Single(x => x.GetProperty("deliveryMode").GetString() == "Ead")
            .GetProperty("allocatedHours").GetDecimal());
        Assert.Equal(1, plans.Single(x => x.GetProperty("deliveryMode").GetString() == "Ead")
            .GetProperty("meetings").GetArrayLength());
        Assert.Equal("Instrutor responsável não atribuído", plans.Single(x =>
            x.GetProperty("deliveryMode").GetString() == "Presencial").GetProperty("pendingReason").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsync(
            $"/api/schedules/{scheduleId}/publish", null)).StatusCode);
    }

    [Fact]
    public async Task QualifiedTeacherCanBeAssignedWithoutSchedulingOrPhysicalRoom()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        var created = await host.Client.PostAsJsonAsync("/api/classes", host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Presencial),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.SemHorarioFixo)]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var profile = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/teachers/{host.TeacherId}/pedagogical-profile");
        Assert.Equal(2, profile.GetProperty("courses").GetArrayLength());
        Assert.Equal(2, profile.GetProperty("curricularUnits").GetArrayLength());
        var teachers = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/classes/{id}/units/{host.EadUnitId}/eligible-teachers");
        Assert.Contains(teachers.EnumerateArray(), x => x.GetProperty("teacherId").GetString() == host.TeacherId);
        Assert.DoesNotContain(teachers.EnumerateArray(), x => x.GetProperty("teacherId").GetString() == host.UnqualifiedTeacherId);
        var path = $"/api/classes/{id}/units/{host.EadUnitId}/teacher";
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync(path,
            new ClassUnitTeacherInput(host.UnqualifiedTeacherId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.PutAsJsonAsync(
            $"/api/classes/{id}/units/99999/teacher", new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync(path,
            new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.DeleteAsync(
            $"/api/teachers/{host.TeacherId}/pedagogical-profile/courses/{host.CourseId}/curricular-units/{host.EadUnitId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync(path,
            new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
        var details = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/classes/{id}/units");
        Assert.Contains(details.GetProperty("units").EnumerateArray(), x =>
            x.GetProperty("curricularUnitId").GetInt32() == host.EadUnitId &&
            x.GetProperty("teacherId").GetString() == host.TeacherId &&
            x.GetProperty("eadScheduleMode").GetString() == "SemHorarioFixo");
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.Assignments.ToListAsync());
        Assert.Empty(await db.Bookings.ToListAsync());
        Assert.Empty(await db.WeeklyClasses.ToListAsync());
        Assert.Single(await db.AuditEntries.Where(x => x.EntityType == "ClassUnitOffering").ToListAsync());
        host.As("Professor");
        var teacherView = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/classes/{id}/units");
        Assert.All(teacherView.GetProperty("units").EnumerateArray(), x =>
            Assert.Equal(System.Text.Json.JsonValueKind.Null, x.GetProperty("teacherId").ValueKind));
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(
            $"/api/classes/{id}/units/{host.EadUnitId}/eligible-teachers")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync(path,
            new ClassUnitTeacherInput(host.TeacherId))).StatusCode);
    }

    [Fact]
    public async Task ClassUsesInstitutionalModuleUnitsHoursResourcesAndEadModes()
    {
        await using var host = await Host.CreateAsync();
        var request = host.CreateRequest([
            new(host.PresentialUnitId, UnitDeliveryMode.Presencial),
            new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.SemHorarioFixo)]);
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/classes", request)).StatusCode);
        host.As("Professor");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/classes", request)).StatusCode);
        host.As("Admin");
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/classes",
            request with { CourseModuleId = host.WrongModuleId })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/classes",
            request with { UnitOfferings = [request.UnitOfferings![0], request.UnitOfferings[0]] })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/classes",
            request with { UnitOfferings = [request.UnitOfferings![0],
                new(host.EadUnitId, UnitDeliveryMode.Ead)] })).StatusCode);
        var created = await host.Client.PostAsJsonAsync("/api/classes", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        host.As("Professor");
        var details = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/classes/{id}/units");
        Assert.False(details.GetProperty("legacyWithoutModule").GetBoolean());
        Assert.Equal(40, details.GetProperty("presentialHours").GetDecimal());
        Assert.Equal(20, details.GetProperty("eadHours").GetDecimal());
        Assert.Equal(2, details.GetProperty("units").GetArrayLength());
        Assert.Contains(details.GetProperty("units").EnumerateArray(), x =>
            x.GetProperty("deliveryMode").GetString() == "Ead" &&
            x.GetProperty("eadScheduleMode").GetString() == "SemHorarioFixo");
        Assert.Contains(details.GetProperty("units").EnumerateArray(), x =>
            x.GetProperty("resources").EnumerateArray().Any(r =>
                r.GetProperty("name").GetString() == "Projetor"));
        host.As("Admin");
        var fixedTime = request with { Name = "Turma online", UnitOfferings =
            [new(host.PresentialUnitId, UnitDeliveryMode.Presencial),
             new(host.EadUnitId, UnitDeliveryMode.Ead, EadScheduleMode.HorarioDefinido)] };
        var online = await host.Client.PostAsJsonAsync("/api/classes", fixedTime);
        Assert.Equal(HttpStatusCode.Created, online.StatusCode);
        var onlineId = (await online.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var onlineDetails = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/classes/{onlineId}/units");
        Assert.Contains(onlineDetails.GetProperty("units").EnumerateArray(), x =>
            x.GetProperty("eadScheduleMode").ValueKind == System.Text.Json.JsonValueKind.String &&
            x.GetProperty("eadScheduleMode").GetString() == "HorarioDefinido");
        var automatic = await host.Client.PostAsJsonAsync("/api/classes", request with
        { Name = "Turma padrão", UnitOfferings = null });
        Assert.Equal(HttpStatusCode.Created, automatic.StatusCode);
        var automaticId = (await automatic.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var automaticDetails = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/classes/{automaticId}/units");
        Assert.Equal(2, automaticDetails.GetProperty("units").GetArrayLength());
        Assert.Equal(60, automaticDetails.GetProperty("presentialHours").GetDecimal());
    }

    [Fact]
    public async Task LegacyClassWithoutModuleRemainsReadable()
    {
        await using var host = await Host.CreateAsync();
        host.As("Admin");
        var legacy = host.CreateRequest(null) with { CourseModuleId = null, CourseId = null, Name = "Turma anterior" };
        var created = await host.Client.PostAsJsonAsync("/api/classes", legacy);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var details = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/classes/{id}/units");
        Assert.True(details.GetProperty("legacyWithoutModule").GetBoolean());
        Assert.Equal(0, details.GetProperty("units").GetArrayLength());
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/classes/{id}",
            new ClassUpdate("Turma anterior editada", null, host.ShiftId))).StatusCode);
        Assert.True((await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/classes/{id}/units"))
            .GetProperty("legacyWithoutModule").GetBoolean());
    }

    private sealed class Host : IAsyncDisposable
    {
        private readonly WebApplication app;
        private readonly SqliteConnection connection;
        public HttpClient Client { get; }
        public int CourseId { get; private set; }
        public int OtherCourseId { get; private set; }
        public int ModuleId { get; private set; }
        public int WrongModuleId { get; private set; }
        public int ForeignUnitId { get; private set; }
        public int PresentialUnitId { get; private set; }
        public int EadUnitId { get; private set; }
        public int SemesterId { get; private set; }
        public int ShiftId { get; private set; }
        public string TeacherId { get; private set; } = "";
        public string UnqualifiedTeacherId { get; private set; } = "";
        public WebApplication App => app;
        private Host(WebApplication app, SqliteConnection connection)
        { this.app = app; this.connection = connection; Client = app.GetTestClient(); }
        public static async Task<Host> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer(); builder.Logging.ClearProviders();
            builder.Services.AddDbContext<AppDbContext>(x => x.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>().AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>("Test", _ => { });
            builder.Services.ConfigureHttpJsonOptions(x =>
                x.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
            builder.Services.AddAuthorization(x => x.AddPolicy("Admin", p => p.RequireRole("Admin")));
            builder.Services.AddScoped<ScheduleGenerator>();
            var app = builder.Build();
            app.UseAuthentication(); app.UseAuthorization(); app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new Host(app, connection);
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            await roles.CreateAsync(new IdentityRole("Professor"));
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var qualified = new AppUser { UserName = "qualified", DisplayName = "Instrutor habilitado" };
            var unqualified = new AppUser { UserName = "unqualified", DisplayName = "Instrutor sem habilitação" };
            Assert.True((await users.CreateAsync(qualified)).Succeeded);
            Assert.True((await users.CreateAsync(unqualified)).Succeeded);
            Assert.True((await users.AddToRoleAsync(qualified, "Professor")).Succeeded);
            Assert.True((await users.AddToRoleAsync(unqualified, "Professor")).Succeeded);
            host.TeacherId = qualified.Id; host.UnqualifiedTeacherId = unqualified.Id;
            var course = new Course { Code = "C", NormalizedCode = "C", Name = "Curso", NormalizedName = "CURSO" };
            var module = new CourseModule { Course = course, Name = "Módulo", NormalizedName = "MÓDULO", Order = 1 };
            var first = new CurricularUnit { CourseModule = module, Code = "P", NormalizedCode = "P",
                Name = "Presencial", NormalizedName = "PRESENCIAL", PlannedHours = 40 };
            var second = new CurricularUnit { CourseModule = module, Code = "E", NormalizedCode = "E",
                Name = "EAD", NormalizedName = "EAD", PlannedHours = 20 };
            var resource = new ResourceCatalogItem { Name = "Projetor", NormalizedName = "PROJETOR", Category = "Equipamento" };
            first.ResourceRequirements.Add(new CurricularUnitResourceRequirement
            { ResourceCatalogItem = resource, Quantity = 1 });
            var wrongCourse = new Course { Code = "X", NormalizedCode = "X", Name = "Outro", NormalizedName = "OUTRO" };
            var wrongModule = new CourseModule { Course = wrongCourse, Name = "Outro", NormalizedName = "OUTRO", Order = 1 };
            var foreignUnit = new CurricularUnit { CourseModule = wrongModule, Code = "X", NormalizedCode = "X",
                Name = "UC externa", NormalizedName = "UC EXTERNA", PlannedHours = 4 };
            var semester = new Semester { Name = "2027/1", StartDate = new(2027, 1, 1), EndDate = new(2027, 6, 30) };
            var shift = new SchoolShift { Name = "Manhã", StartsAt = new(8, 0), EndsAt = new(12, 0) };
            db.AddRange(first, second, foreignUnit, semester, shift);
            await db.SaveChangesAsync();
            host.CourseId = course.Id; host.ModuleId = module.Id; host.WrongModuleId = wrongModule.Id;
            host.OtherCourseId = wrongCourse.Id;
            host.PresentialUnitId = first.Id; host.EadUnitId = second.Id;
            host.ForeignUnitId = foreignUnit.Id;
            host.SemesterId = semester.Id; host.ShiftId = shift.Id;
            db.TeacherCourseQualifications.AddRange(
                new TeacherCourseQualification { TeacherId = qualified.Id, CourseId = course.Id },
                new TeacherCourseQualification { TeacherId = qualified.Id, CourseId = wrongCourse.Id },
                new TeacherCourseQualification { TeacherId = unqualified.Id, CourseId = course.Id });
            db.TeacherUnitQualifications.AddRange(
                new TeacherUnitQualification { TeacherId = qualified.Id, CurricularUnitId = first.Id },
                new TeacherUnitQualification { TeacherId = qualified.Id, CurricularUnitId = second.Id });
            await db.SaveChangesAsync();
            return host;
        }
        public ClassCreate CreateRequest(List<ClassUnitOfferingInput>? offerings) =>
            new(SemesterId, "Turma nova", 25, CourseId, null, ShiftId, ModuleId, offerings);
        public void As(string role)
        { Client.DefaultRequestHeaders.Remove("X-Test-Role"); Client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        public async ValueTask DisposeAsync()
        { Client.Dispose(); await app.DisposeAsync(); await connection.DisposeAsync(); }
    }

    private sealed class HeaderAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-Role", out var role))
                return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "test"),
                new Claim(ClaimTypes.Role, role.ToString())], "Test");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
        }
    }
}
