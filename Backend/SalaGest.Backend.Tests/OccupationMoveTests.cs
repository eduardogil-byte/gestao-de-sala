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

public sealed class OccupationMoveTests
{
    [Fact]
    public async Task UndoRedoPreserveOccurrenceAndHistoryAndRejectDuplicateConfirmation()
    {
        await using var host = await Host.CreateAsync();
        var move = await host.Preview(host.RecurringFirstId, host.RoomBId, new(2027, 3, 1), host.MorningId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.RecurringFirstId, move,
            host.RoomBId, new(2027, 3, 1), host.MorningId)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var original = await db.OccupationChanges.SingleAsync(c => c.RoomOccupationId == host.RecurringFirstId);
        Assert.Equal(host.RoomAId, original.FromRoomId);
        Assert.Equal(host.RoomBId, original.ToRoomId);
        var undo = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/occupations/{host.RecurringFirstId}/moves/{original.Id}/undo/preview");
        Assert.True(undo.GetProperty("allowed").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await Reverse(host, host.RecurringFirstId, original.Id, "undo", undo)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Reverse(host, host.RecurringFirstId, original.Id, "undo", undo)).StatusCode);
        await host.AssertOccupation(host.RecurringFirstId, host.RoomAId, new(2027, 3, 1, 8, 0, 0));
        await host.AssertOccupation(host.RecurringSecondId, host.RoomAId, new(2027, 3, 8, 8, 0, 0));
        var redo = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/occupations/{host.RecurringFirstId}/moves/{original.Id}/redo/preview");
        Assert.True(redo.GetProperty("allowed").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await Reverse(host, host.RecurringFirstId, original.Id, "redo", redo)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Reverse(host, host.RecurringFirstId, original.Id, "redo", redo)).StatusCode);
        await host.AssertOccupation(host.RecurringFirstId, host.RoomBId, new(2027, 3, 1, 8, 0, 0));
        var changes = await db.OccupationChanges.AsNoTracking().Where(c => c.RoomOccupationId == host.RecurringFirstId)
            .OrderBy(c => c.Id).ToListAsync();
        Assert.Equal(new[] { "Remanejada", "Desfeita", "Refeita" }, changes.Select(c => c.Action));
        Assert.All(changes.Skip(1), c => Assert.Equal(original.Id, c.ReferenceChangeId));
        Assert.Equal(3, await db.Notifications.CountAsync(n => n.RelatedType == "Occupation" &&
            n.RelatedId == host.RecurringFirstId));
    }

    [Fact]
    public async Task UndoRevalidatesOccupiedOriginAndOldMoveCannotBeReversed()
    {
        await using var host = await Host.CreateAsync();
        var first = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.AfternoonId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, first,
            host.RoomBId, new(2027, 3, 4), host.AfternoonId)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var original = await db.OccupationChanges.SingleAsync(c => c.RoomOccupationId == host.ManualId);
        var next = await host.Preview(host.ManualId, host.RoomCId, new(2027, 3, 4), host.AfternoonId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, next,
            host.RoomCId, new(2027, 3, 4), host.AfternoonId)).StatusCode);
        var old = await host.Client.GetAsync($"/api/occupations/{host.ManualId}/moves/{original.Id}/undo/preview");
        Assert.Equal(HttpStatusCode.Conflict, old.StatusCode);
        await host.AssertOccupation(host.ManualId, host.RoomCId, new(2027, 3, 4, 13, 0, 0));
    }

    [Fact]
    public async Task UndoBlockedWhenOriginWasOccupiedAndTeacherCannotReverse()
    {
        await using var host = await Host.CreateAsync();
        var move = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 2), host.MorningId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, move,
            host.RoomBId, new(2027, 3, 2), host.MorningId)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var original = await db.OccupationChanges.SingleAsync(c => c.RoomOccupationId == host.ManualId);
        db.Occupations.Add(new RoomOccupation { RoomId = host.RoomAId,
            StartsAt = new(2027, 3, 2, 8, 0, 0), EndsAt = new(2027, 3, 2, 12, 0, 0),
            Kind = OccupationKind.Avulsa, TeacherId = "teacher1" });
        await db.SaveChangesAsync();
        var preview = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/occupations/{host.ManualId}/moves/{original.Id}/undo/preview");
        Assert.False(preview.GetProperty("allowed").GetBoolean());
        Assert.Contains("sala", preview.GetProperty("blocks").ToString());
        Assert.Equal(HttpStatusCode.Conflict, (await Reverse(host, host.ManualId, original.Id, "undo", preview)).StatusCode);
        await host.AssertOccupation(host.ManualId, host.RoomBId, new(2027, 3, 2, 8, 0, 0));
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(
            $"/api/occupations/{host.ManualId}/moves/{original.Id}/undo/preview")).StatusCode);
    }

    [Fact]
    public async Task NewMoveAfterUndoInvalidatesRedo()
    {
        await using var host = await Host.CreateAsync();
        var first = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.AfternoonId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, first,
            host.RoomBId, new(2027, 3, 4), host.AfternoonId)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var original = await db.OccupationChanges.SingleAsync(c => c.RoomOccupationId == host.ManualId);
        var undo = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/occupations/{host.ManualId}/moves/{original.Id}/undo/preview");
        Assert.Equal(HttpStatusCode.OK, (await Reverse(host, host.ManualId, original.Id, "undo", undo)).StatusCode);
        var next = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 5), host.AfternoonId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, next,
            host.RoomBId, new(2027, 3, 5), host.AfternoonId)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.GetAsync(
            $"/api/occupations/{host.ManualId}/moves/{original.Id}/redo/preview")).StatusCode);
    }

    [Fact]
    public async Task RedoRevalidatesDestinationAndStalePreviewCannotConfirm()
    {
        await using var host = await Host.CreateAsync();
        var move = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.AfternoonId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, move,
            host.RoomBId, new(2027, 3, 4), host.AfternoonId)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var original = await db.OccupationChanges.SingleAsync(c => c.RoomOccupationId == host.ManualId);
        var undo = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/occupations/{host.ManualId}/moves/{original.Id}/undo/preview");
        Assert.Equal(HttpStatusCode.OK, (await Reverse(host, host.ManualId, original.Id, "undo", undo)).StatusCode);
        var redo = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/occupations/{host.ManualId}/moves/{original.Id}/redo/preview");
        db.Occupations.Add(new RoomOccupation { RoomId = host.RoomBId,
            StartsAt = new(2027, 3, 4, 13, 0, 0), EndsAt = new(2027, 3, 4, 17, 0, 0),
            Kind = OccupationKind.Avulsa, TeacherId = "teacher1" });
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await Reverse(host, host.ManualId, original.Id, "redo", redo)).StatusCode);
        await host.AssertOccupation(host.ManualId, host.RoomAId, new(2027, 3, 2, 8, 0, 0));
        Assert.Equal(2, await db.OccupationChanges.CountAsync(c => c.RoomOccupationId == host.ManualId));
        Assert.Equal(2, await db.Notifications.CountAsync(n => n.RelatedType == "Occupation" &&
            n.RelatedId == host.ManualId));
    }

    private static Task<HttpResponseMessage> Reverse(Host host, int occupationId, int changeId,
        string action, System.Text.Json.JsonElement preview)
    {
        var origin = preview.GetProperty("origin");
        return host.Client.PostAsJsonAsync($"/api/occupations/{occupationId}/moves/{changeId}/{action}", new
        {
            confirm = true, expectedLastChangeId = preview.GetProperty("expectedLastChangeId").GetInt32(),
            expectedRoomId = origin.GetProperty("roomId").GetInt32(),
            expectedStartsAt = origin.GetProperty("startsAt").GetDateTime(),
            expectedEndsAt = origin.GetProperty("endsAt").GetDateTime()
        });
    }
    [Fact]
    public async Task PreviewDoesNotWriteAndConfirmationMovesOnlyOneRecurringOccurrenceWithAudit()
    {
        await using var host = await Host.CreateAsync();
        var preview = await host.Preview(host.RecurringFirstId, host.RoomBId, new(2027, 3, 1), host.MorningId);
        Assert.True(preview.GetProperty("allowed").GetBoolean());
        Assert.Single(preview.GetProperty("affectedOccupationIds").EnumerateArray());
        Assert.Contains("demais datas", preview.GetProperty("warnings").ToString());
        await host.AssertOccupation(host.RecurringFirstId, host.RoomAId, new(2027, 3, 1, 8, 0, 0));

        var response = await host.Confirm(host.RecurringFirstId, preview, host.RoomBId,
            new(2027, 3, 1), host.MorningId, "Manutenção");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await host.AssertOccupation(host.RecurringFirstId, host.RoomBId, new(2027, 3, 1, 8, 0, 0));
        await host.AssertOccupation(host.RecurringSecondId, host.RoomAId, new(2027, 3, 8, 8, 0, 0));
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var change = Assert.Single(await db.OccupationChanges.Where(c => c.RoomOccupationId == host.RecurringFirstId).ToListAsync());
        Assert.Equal("Remanejada", change.Action);
        Assert.Equal("admin", change.ChangedById);
        Assert.Contains("Manutenção", change.Details);
        Assert.Contains("Laboratório A", change.Details);
        Assert.Contains("Laboratório B", change.Details);
    }

    [Fact]
    public async Task ManualOccupationCanChangeDateAndShiftWithoutChangingOtherRecords()
    {
        await using var host = await Host.CreateAsync();
        var preview = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.AfternoonId);
        Assert.True(preview.GetProperty("allowed").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, preview, host.RoomBId,
            new(2027, 3, 4), host.AfternoonId)).StatusCode);
        await host.AssertOccupation(host.ManualId, host.RoomBId, new(2027, 3, 4, 13, 0, 0));
    }

    [Fact]
    public async Task InvalidTargetsAndProgrammingAreBlockedWithoutChangingTheOccupation()
    {
        await using var host = await Host.CreateAsync();
        var outside = await host.Preview(host.RecurringFirstId, host.RoomBId, new(2027, 7, 1), host.MorningId);
        Assert.False(outside.GetProperty("allowed").GetBoolean());
        Assert.Contains("fora do semestre", outside.GetProperty("blocks").ToString());
        var changedTime = await host.Preview(host.RecurringFirstId, host.RoomBId, new(2027, 3, 4), host.MorningId);
        Assert.Contains("programação", changedTime.GetProperty("blocks").ToString());
        var badShift = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), 99999);
        Assert.Contains("Turno", badShift.GetProperty("blocks").ToString());
        var badRoom = await host.Preview(host.ManualId, 99999, new(2027, 3, 4), host.MorningId);
        Assert.Contains("Ambiente", badRoom.GetProperty("blocks").ToString());
        Assert.Equal(HttpStatusCode.Conflict, (await host.Confirm(host.RecurringFirstId, outside,
            host.RoomBId, new(2027, 7, 1), host.MorningId)).StatusCode);
        await host.AssertOccupation(host.RecurringFirstId, host.RoomAId, new(2027, 3, 1, 8, 0, 0));
    }

    [Fact]
    public async Task RoomTeacherAndClassConflictsAreReported()
    {
        await using var host = await Host.CreateAsync();
        var room = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 3), host.MorningId);
        Assert.Contains("sala", room.GetProperty("blocks").ToString());
        Assert.Contains("Professor 1", room.GetProperty("blocks").ToString());
        var teacher = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 2), host.AfternoonId);
        Assert.Contains("professor", teacher.GetProperty("blocks").ToString());
        var classGroup = await host.Preview(host.RecurringSecondId, host.RoomBId, new(2027, 3, 8), host.MorningId);
        Assert.Contains("turma", classGroup.GetProperty("blocks").ToString());
    }

    [Fact]
    public async Task CalendarAndTechnicalRequirementsBlockPedagogicalMove()
    {
        await using var host = await Host.CreateAsync();
        var holiday = await host.Preview(host.PedagogicalId, host.RoomBId, new(2027, 3, 19), host.MorningId);
        Assert.Contains("Calendário", holiday.GetProperty("blocks").ToString());
        var incompatible = await host.Preview(host.PedagogicalId, host.SmallRoomId, new(2027, 3, 15), host.MorningId);
        Assert.Equal("Incompatible", incompatible.GetProperty("technicalClassification").GetString());
        Assert.Contains("Compatibilidade", incompatible.GetProperty("blocks").ToString());
        var wrongAssignment = await host.Preview(host.PedagogicalId, host.RoomBId, new(2027, 3, 16), host.MorningId);
        Assert.Contains("atribuição", wrongAssignment.GetProperty("blocks").ToString());
    }

    [Fact]
    public async Task LoansBlockedAndLegacyBookingsDoNotRequireInventedCapability()
    {
        await using var host = await Host.CreateAsync();
        var loan = await host.Preview(host.LoanedId, host.RoomBId, new(2027, 3, 9), host.MorningId);
        Assert.Contains("empréstimo", loan.GetProperty("blocks").ToString());
        var legacy = await host.Preview(host.RecurringFirstId, host.RoomBId, new(2027, 3, 1), host.MorningId);
        Assert.True(legacy.GetProperty("allowed").GetBoolean());
        Assert.Equal("Unknown", legacy.GetProperty("technicalClassification").GetString());
    }

    [Fact]
    public async Task OnlyAdminCanMoveAndCancelledOrMissingOccupationsAreNotFound()
    {
        await using var host = await Host.CreateAsync();
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync(
            $"/api/occupations/{host.ManualId}/move-preview",
            new OccupationMovePreviewInput(host.RoomBId, new(2027, 3, 4), host.MorningId))).StatusCode);
        host.AsAdmin();
        var preview = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.MorningId);
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Confirm(host.ManualId, preview,
            host.RoomBId, new(2027, 3, 4), host.MorningId)).StatusCode);
        host.AsAdmin();
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.PostAsJsonAsync(
            "/api/occupations/99999/move-preview",
            new OccupationMovePreviewInput(host.RoomBId, new(2027, 3, 4), host.MorningId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.PostAsJsonAsync(
            $"/api/occupations/{host.CancelledId}/move-preview",
            new OccupationMovePreviewInput(host.RoomBId, new(2027, 3, 4), host.MorningId))).StatusCode);
    }

    [Fact]
    public async Task ConfirmationRequiresExplicitConsentAndRejectsStaleSourceOrDestination()
    {
        await using var host = await Host.CreateAsync();
        var preview = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.MorningId);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Confirm(host.ManualId, preview,
            host.RoomBId, new(2027, 3, 4), host.MorningId, confirm: false)).StatusCode);
        await host.AssertOccupation(host.ManualId, host.RoomAId, new(2027, 3, 2, 8, 0, 0));
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Occupations.Add(new RoomOccupation { RoomId = host.RoomBId,
                StartsAt = new(2027, 3, 4, 8, 0, 0), EndsAt = new(2027, 3, 4, 12, 0, 0),
                Kind = OccupationKind.Avulsa });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await host.Confirm(host.ManualId, preview,
            host.RoomBId, new(2027, 3, 4), host.MorningId)).StatusCode);
        await host.AssertOccupation(host.ManualId, host.RoomAId, new(2027, 3, 2, 8, 0, 0));
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.Occupations.FindAsync(host.ManualId);
            item!.RoomId = host.RoomCId;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await host.Confirm(host.ManualId, preview,
            host.RoomBId, new(2027, 3, 4), host.MorningId)).StatusCode);
        await host.AssertOccupation(host.ManualId, host.RoomCId, new(2027, 3, 2, 8, 0, 0));
    }

    [Fact]
    public async Task SecondConfirmationOfTheSameSourceCannotOverwriteTheFirstMove()
    {
        await using var host = await Host.CreateAsync();
        var first = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.MorningId);
        var second = await host.Preview(host.ManualId, host.RoomCId, new(2027, 3, 5), host.MorningId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, first,
            host.RoomBId, new(2027, 3, 4), host.MorningId)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Confirm(host.ManualId, second,
            host.RoomCId, new(2027, 3, 5), host.MorningId)).StatusCode);
        await host.AssertOccupation(host.ManualId, host.RoomBId, new(2027, 3, 4, 8, 0, 0));
    }

    [Fact]
    public async Task AuditWriteFailureRollsBackTheOriginalOccupation()
    {
        await using var host = await Host.CreateAsync();
        var preview = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.MorningId);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER fail_move_audit BEFORE INSERT ON OccupationChanges BEGIN SELECT RAISE(ABORT, 'audit failure'); END;");
        }
        await Assert.ThrowsAnyAsync<Exception>(() => host.Confirm(host.ManualId, preview,
            host.RoomBId, new(2027, 3, 4), host.MorningId));
        await host.AssertOccupation(host.ManualId, host.RoomAId, new(2027, 3, 2, 8, 0, 0));
        using var checkScope = host.App.Services.CreateScope();
        var checkDb = checkScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await checkDb.OccupationChanges.AnyAsync(c => c.RoomOccupationId == host.ManualId));
        Assert.False(await checkDb.Notifications.AnyAsync(n => n.RelatedType == "Occupation" && n.RelatedId == host.ManualId));
    }

    [Fact]
    public async Task NotificationWriteFailureRollsBackMoveAndAudit()
    {
        await using var host = await Host.CreateAsync();
        var preview = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.MorningId);
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER fail_move_notification BEFORE INSERT ON Notifications BEGIN SELECT RAISE(ABORT, 'notification failure'); END;");
        }
        await Assert.ThrowsAnyAsync<Exception>(() => host.Confirm(host.ManualId, preview,
            host.RoomBId, new(2027, 3, 4), host.MorningId));
        await host.AssertOccupation(host.ManualId, host.RoomAId, new(2027, 3, 2, 8, 0, 0));
        using var check = host.App.Services.CreateScope();
        var dbCheck = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await dbCheck.OccupationChanges.AnyAsync(c => c.RoomOccupationId == host.ManualId));
        Assert.False(await dbCheck.Notifications.AnyAsync(n => n.RelatedType == "Occupation" &&
            n.RelatedId == host.ManualId));
    }

    [Fact]
    public async Task ConfirmedMovesKeepHistoryAndNotifyOnlyTheAffectedTeacher()
    {
        await using var host = await Host.CreateAsync();
        var first = await host.Preview(host.ManualId, host.RoomBId, new(2027, 3, 4), host.MorningId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, first,
            host.RoomBId, new(2027, 3, 4), host.MorningId, "Ajuste de ambiente")).StatusCode);
        var second = await host.Preview(host.ManualId, host.RoomCId, new(2027, 3, 5), host.MorningId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.ManualId, second,
            host.RoomCId, new(2027, 3, 5), host.MorningId)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Confirm(host.ManualId, first,
            host.RoomBId, new(2027, 3, 4), host.MorningId)).StatusCode);

        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var changes = await db.OccupationChanges.AsNoTracking()
            .Where(c => c.RoomOccupationId == host.ManualId).OrderBy(c => c.Id).ToListAsync();
        Assert.Equal(2, changes.Count);
        Assert.All(changes, change => { Assert.Equal("admin", change.ChangedById);
            Assert.InRange(change.ChangedAtUtc, DateTime.UtcNow.AddMinutes(-2), DateTime.UtcNow.AddMinutes(2)); });
        Assert.Contains("Laboratório A", changes[0].Details);
        Assert.Contains("Laboratório B", changes[1].Details);
        var notices = await db.Notifications.AsNoTracking().Where(n => n.RelatedType == "Occupation" &&
            n.RelatedId == host.ManualId).ToListAsync();
        Assert.Equal(2, notices.Count);
        Assert.All(notices, notice => { Assert.Equal("teacher2", notice.UserId); Assert.Equal("admin", notice.ActorId); });

        host.AsTeacher();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await host.Client.GetAsync($"/api/occupations/{host.ManualId}/history")).StatusCode);
        Assert.Empty((await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/notifications"))!);
        host.AsOtherTeacher();
        var own = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/notifications");
        Assert.Equal(2, own!.Count);
        var notificationId = own[0].GetProperty("id").GetInt32();
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.NotFound,
            (await host.Client.PostAsync($"/api/notifications/{notificationId}/read", null)).StatusCode);
        host.AsOtherTeacher();
        Assert.Equal(HttpStatusCode.NoContent,
            (await host.Client.PostAsync($"/api/notifications/{notificationId}/read", null)).StatusCode);
    }

    [Fact]
    public async Task LoanRejectionCreatesOneAuditEventAndNotifiesTheOtherParty()
    {
        await using var host = await Host.CreateAsync();
        int loanId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            loanId = await db.Loans.Where(l => l.RoomOccupationId == host.LoanedId).Select(l => l.Id).SingleAsync();
        }
        host.AsTeacher();
        Assert.Equal(HttpStatusCode.OK,
            (await host.Client.PostAsync($"/api/loans/{loanId}/reject", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.PostAsync($"/api/loans/{loanId}/reject", null)).StatusCode);
        var ownHistory = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>(
            $"/api/audit/Loan/{loanId}");
        Assert.Single(ownHistory!);
        Assert.Equal("Recusado", ownHistory[0].GetProperty("action").GetString());
        using var check = host.App.Services.CreateScope();
        var checkDb = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Single(await checkDb.AuditEntries.Where(a => a.EntityType == "Loan" &&
            a.EntityId == loanId.ToString()).ToListAsync());
        var notice = Assert.Single(await checkDb.Notifications.Where(n => n.RelatedType == "Loan" &&
            n.RelatedId == loanId).ToListAsync());
        Assert.Equal("teacher2", notice.UserId);
        Assert.Equal("teacher1", notice.ActorId);
    }

    [Fact]
    public async Task LoanAcceptanceAndFinalizationAuditTransitionsAndNotifyEachCounterparty()
    {
        await using var host = await Host.CreateAsync();
        int loanId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            loanId = await db.Loans.Where(l => l.RoomOccupationId == host.LoanedId).Select(l => l.Id).SingleAsync();
        }
        host.AsTeacher();
        var input = new LoanAccept(null, 1, 1, false, false, false, HardwareTier.Basico, []);
        Assert.Equal(HttpStatusCode.OK,
            (await host.Client.PostAsJsonAsync($"/api/loans/{loanId}/accept", input)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await host.Client.PostAsJsonAsync($"/api/loans/{loanId}/accept", input)).StatusCode);
        host.AsOtherTeacher();
        Assert.Equal(HttpStatusCode.OK,
            (await host.Client.PostAsJsonAsync($"/api/loans/{loanId}/finalize",
                new LoanFinish(OwnerClassDisposition.Ead))).StatusCode);
        using var check = host.App.Services.CreateScope();
        var dbCheck = check.ServiceProvider.GetRequiredService<AppDbContext>();
        var entries = await dbCheck.AuditEntries.Where(a => a.EntityType == "Loan" &&
            a.EntityId == loanId.ToString()).OrderBy(a => a.Id).ToListAsync();
        Assert.Equal(new[] { "Aceito", "Confirmado" }, entries.Select(a => a.Action).ToArray());
        Assert.Equal("teacher1", entries[0].ActorId);
        Assert.Equal("teacher2", entries[1].ActorId);
        var notices = await dbCheck.Notifications.Where(n => n.RelatedType == "Loan" &&
            n.RelatedId == loanId).OrderBy(n => n.Id).ToListAsync();
        Assert.Equal(new[] { "teacher2", "teacher1" }, notices.Select(n => n.UserId).ToArray());
        Assert.Equal(LoanStatus.Aprovado,
            (await dbCheck.Loans.SingleAsync(l => l.Id == loanId)).Status);
    }

    [Fact]
    public async Task OfferedLoanPersistsAuditAndOneRecipientNotification()
    {
        await using var host = await Host.CreateAsync();
        using (var scope = host.App.Services.CreateScope())
        {
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            await roles.CreateAsync(new IdentityRole("Professor"));
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var borrower = (await users.FindByIdAsync("teacher2"))!;
            Assert.True((await users.AddToRoleAsync(borrower, "Professor")).Succeeded);
        }
        host.AsTeacher();
        var response = await host.Client.PostAsJsonAsync("/api/loans/offer",
            new LoanOffer([host.RecurringFirstId], "teacher2", "Uso pontual"));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var check = host.App.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<AppDbContext>();
        var loan = await db.Loans.SingleAsync(l => l.RoomOccupationId == host.RecurringFirstId);
        var audit = Assert.Single(await db.AuditEntries.Where(a => a.EntityType == "Loan" &&
            a.EntityId == loan.Id.ToString()).ToListAsync());
        Assert.Equal("Solicitado", audit.Action);
        Assert.Equal("teacher1", audit.ActorId);
        Assert.Equal("Uso pontual", audit.Reason);
        var notice = Assert.Single(await db.Notifications.Where(n => n.RelatedType == "Loan" &&
            n.RelatedId == loan.Id).ToListAsync());
        Assert.Equal("teacher2", notice.UserId);
        Assert.Equal("teacher1", notice.ActorId);
    }

    [Fact]
    public async Task BookingHistoryIncludesTheExistingOccurrenceMoveWithoutDuplicatingIt()
    {
        await using var host = await Host.CreateAsync();
        var preview = await host.Preview(host.RecurringFirstId, host.RoomBId,
            new(2027, 3, 1), host.MorningId);
        Assert.Equal(HttpStatusCode.OK, (await host.Confirm(host.RecurringFirstId, preview,
            host.RoomBId, new(2027, 3, 1), host.MorningId)).StatusCode);
        int bookingId;
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            bookingId = (await db.Occupations.SingleAsync(o => o.Id == host.RecurringFirstId)).BookingRequestId!.Value;
            Assert.Single(await db.OccupationChanges.Where(c => c.RoomOccupationId == host.RecurringFirstId).ToListAsync());
        }
        var history = await host.Client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>(
            $"/api/audit/Booking/{bookingId}");
        var move = Assert.Single(history!);
        Assert.Equal("Remanejada", move.GetProperty("action").GetString());
        Assert.Equal("Occupation", move.GetProperty("entityType").GetString());
        Assert.Contains("Laboratório", move.GetProperty("details").GetString());
    }

    [Fact]
    public async Task PublishedLessonsKeepTheirProgramAndEadOrBlockedOccupationsStayRestricted()
    {
        await using var host = await Host.CreateAsync();
        var scheduled = await host.Preview(host.ScheduledId, host.RoomBId, new(2027, 3, 22), host.MorningId);
        Assert.True(scheduled.GetProperty("allowed").GetBoolean());
        var movedDate = await host.Preview(host.ScheduledId, host.RoomBId, new(2027, 3, 29), host.MorningId);
        Assert.Contains("programação", movedDate.GetProperty("blocks").ToString());
        var eadDate = await host.Preview(host.EadId, host.RoomBId, new(2027, 3, 25), host.AfternoonId);
        Assert.Contains("EAD", eadDate.GetProperty("blocks").ToString());
        var blocked = await host.Preview(host.BlockedId, host.RoomBId, new(2027, 3, 24), host.MorningId);
        Assert.Contains("Bloqueios", blocked.GetProperty("blocks").ToString());
    }

    private sealed class Host : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public WebApplication App { get; }
        public HttpClient Client { get; }
        public int RoomAId { get; private set; }
        public int RoomBId { get; private set; }
        public int RoomCId { get; private set; }
        public int SmallRoomId { get; private set; }
        public int MorningId { get; private set; }
        public int AfternoonId { get; private set; }
        public int RecurringFirstId { get; private set; }
        public int RecurringSecondId { get; private set; }
        public int ManualId { get; private set; }
        public int PedagogicalId { get; private set; }
        public int LoanedId { get; private set; }
        public int CancelledId { get; private set; }
        public int ScheduledId { get; private set; }
        public int EadId { get; private set; }
        public int BlockedId { get; private set; }
        private Host(WebApplication app, SqliteConnection connection)
        { App = app; this.connection = connection; Client = app.GetTestClient(); }
        public void AsAdmin() => SetUser("admin", "Admin");
        public void AsTeacher() => SetUser("teacher1", "Professor");
        public void AsOtherTeacher() => SetUser("teacher2", "Professor");
        private void SetUser(string id, string role)
        { Client.DefaultRequestHeaders.Remove("X-Test-User"); Client.DefaultRequestHeaders.Remove("X-Test-Role");
            Client.DefaultRequestHeaders.Add("X-Test-User", id);
            Client.DefaultRequestHeaders.Add("X-Test-Role", role); }
        public async Task<System.Text.Json.JsonElement> Preview(int id, int roomId, DateOnly date, int shiftId)
        {
            var response = await Client.PostAsJsonAsync($"/api/occupations/{id}/move-preview",
                new OccupationMovePreviewInput(roomId, date, shiftId));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        }
        public Task<HttpResponseMessage> Confirm(int id, System.Text.Json.JsonElement preview,
            int roomId, DateOnly date, int shiftId, string? reason = null, bool confirm = true)
        {
            var origin = preview.GetProperty("origin");
            return Client.PostAsJsonAsync($"/api/occupations/{id}/move", new OccupationMoveConfirmInput(
                roomId, date, shiftId, origin.GetProperty("roomId").GetInt32(),
                origin.GetProperty("startsAt").GetDateTime(), origin.GetProperty("endsAt").GetDateTime(),
                confirm, reason));
        }
        public async Task AssertOccupation(int id, int roomId, DateTime startsAt)
        {
            using var scope = App.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.Occupations.AsNoTracking().SingleAsync(o => o.Id == id);
            Assert.Equal(roomId, item.RoomId);
            Assert.Equal(startsAt, item.StartsAt);
            Assert.Null(item.CancelledAtUtc);
        }
        public static async Task<Host> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
            builder.Services.AddIdentityCore<AppUser>().AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<AppDbContext>().AddSignInManager();
            builder.Services.AddAuthentication("Test")
                .AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>("Test", _ => { });
            builder.Services.AddAuthorization(options => options.AddPolicy("Admin", p => p.RequireRole("Admin")));
            var app = builder.Build();
            app.UseAuthentication(); app.UseAuthorization(); app.MapSalaGestEndpoints();
            await app.StartAsync();
            var host = new Host(app, connection);
            host.AsAdmin();
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Users.AddRange(new AppUser { Id = "admin", UserName = "admin", DisplayName = "Coordenação" },
                new AppUser { Id = "teacher1", UserName = "teacher1", DisplayName = "Professor 1" },
                new AppUser { Id = "teacher2", UserName = "teacher2", DisplayName = "Professor 2" });
            var semester = new Semester { Name = "2027/1", StartDate = new(2027, 3, 1), EndDate = new(2027, 6, 30) };
            var morning = new SchoolShift { Name = "Manhã", StartsAt = new(8, 0), EndsAt = new(12, 0) };
            var afternoon = new SchoolShift { Name = "Tarde", StartsAt = new(13, 0), EndsAt = new(17, 0) };
            var roomA = new Room { Name = "Laboratório A", Seats = 30, Kind = RoomKind.Laboratorio };
            var roomB = new Room { Name = "Laboratório B", Seats = 30, Kind = RoomKind.Laboratorio };
            var roomC = new Room { Name = "Laboratório C", Seats = 30, Kind = RoomKind.Laboratorio };
            var small = new Room { Name = "Sala pequena", Seats = 5, Kind = RoomKind.Comum };
            var course = new Course { Code = "C", NormalizedCode = "C", Name = "Curso", NormalizedName = "CURSO" };
            var module = new CourseModule { Course = course, Name = "Módulo", NormalizedName = "MÓDULO", Order = 1 };
            var unit = new CurricularUnit { CourseModule = module, Code = "U", NormalizedCode = "U", Name = "UC", NormalizedName = "UC" };
            var capability = new CurricularCapability { CurricularUnit = unit, Description = "Capacidade",
                NormalizedDescription = "CAPACIDADE", Contents = "Conteúdo", RequiredHours = 4, Order = 1 };
            var classGroup = new ClassGroup { Name = "M1", Semester = semester, Course = course, Students = 20 };
            var mondayAssignment = new TeachingAssignment { TeacherId = "teacher1", ClassGroup = classGroup,
                CurricularUnit = unit, DisciplineName = "UC", Weekday = 1, PreferredShift = morning };
            db.Assignments.AddRange(mondayAssignment,
                new TeachingAssignment { TeacherId = "teacher1", ClassGroup = classGroup,
                    CurricularUnit = unit, DisciplineName = "UC", Weekday = 5, PreferredShift = morning });
            db.CurricularCapabilities.Add(capability);
            db.CapabilityEnvironmentRequirements.Add(new CapabilityEnvironmentRequirement
                { CurricularCapability = capability, RoomKind = RoomKind.Laboratorio });
            db.Rooms.AddRange(roomA, roomB, roomC, small);
            db.Shifts.Add(afternoon);
            await db.SaveChangesAsync();
            var schedule = new Schedule { SemesterId = semester.Id, Status = ScheduleStatus.Publicada };
            var weekly = new WeeklyClass { Schedule = schedule, Assignment = mondayAssignment,
                Weekday = 1, ShiftId = morning.Id, RoomId = roomA.Id };
            db.WeeklyClasses.Add(weekly);
            await db.SaveChangesAsync();
            var recurring = new BookingRequest { TeacherId = "teacher1", ClassGroupId = classGroup.Id,
                StartsAt = new(2027, 3, 1, 8, 0, 0), EndsAt = new(2027, 3, 1, 12, 0, 0),
                Recurrence = BookingRecurrence.Semanal, RepeatUntil = new(2027, 3, 8),
                Students = 20, Status = BookingStatus.Aprovada, Reason = "Reserva" };
            var pedagogical = new BookingRequest { TeacherId = "teacher1", ClassGroupId = classGroup.Id,
                CurricularUnitId = unit.Id, CurricularCapabilityId = capability.Id,
                StartsAt = new(2027, 3, 15, 8, 0, 0), EndsAt = new(2027, 3, 15, 12, 0, 0),
                Students = 20, Status = BookingStatus.Aprovada, Reason = "UC" };
            db.Bookings.AddRange(recurring, pedagogical);
            await db.SaveChangesAsync();
            var first = new RoomOccupation { RoomId = roomA.Id, StartsAt = new(2027, 3, 1, 8, 0, 0),
                EndsAt = new(2027, 3, 1, 12, 0, 0), Kind = OccupationKind.Avulsa,
                TeacherId = "teacher1", ClassGroupId = classGroup.Id, BookingRequestId = recurring.Id };
            var second = new RoomOccupation { RoomId = roomA.Id, StartsAt = new(2027, 3, 8, 8, 0, 0),
                EndsAt = new(2027, 3, 8, 12, 0, 0), Kind = OccupationKind.Avulsa,
                TeacherId = "teacher1", ClassGroupId = classGroup.Id, BookingRequestId = recurring.Id };
            var manual = new RoomOccupation { RoomId = roomA.Id, StartsAt = new(2027, 3, 2, 8, 0, 0),
                EndsAt = new(2027, 3, 2, 12, 0, 0), Kind = OccupationKind.Avulsa, TeacherId = "teacher2" };
            var ped = new RoomOccupation { RoomId = roomA.Id, StartsAt = new(2027, 3, 15, 8, 0, 0),
                EndsAt = new(2027, 3, 15, 12, 0, 0), Kind = OccupationKind.Avulsa,
                TeacherId = "teacher1", ClassGroupId = classGroup.Id, BookingRequestId = pedagogical.Id };
            var loaned = new RoomOccupation { RoomId = roomA.Id, StartsAt = new(2027, 3, 9, 8, 0, 0),
                EndsAt = new(2027, 3, 9, 12, 0, 0), Kind = OccupationKind.Avulsa, TeacherId = "teacher2" };
            var cancelled = new RoomOccupation { RoomId = roomA.Id, StartsAt = new(2027, 3, 10, 8, 0, 0),
                EndsAt = new(2027, 3, 10, 12, 0, 0), Kind = OccupationKind.Avulsa,
                CancelledAtUtc = DateTime.UtcNow };
            var scheduled = new RoomOccupation { RoomId = roomA.Id,
                StartsAt = new(2027, 3, 22, 8, 0, 0), EndsAt = new(2027, 3, 22, 12, 0, 0),
                Kind = OccupationKind.Aula, TeacherId = "teacher1", ClassGroupId = classGroup.Id,
                WeeklyClassId = weekly.Id };
            var ead = new RoomOccupation { RoomId = roomA.Id,
                StartsAt = new(2027, 3, 23, 13, 0, 0), EndsAt = new(2027, 3, 23, 17, 0, 0),
                Kind = OccupationKind.Avulsa, TeacherId = "teacher2", DayStatus = ClassDayStatus.Ead };
            var blocked = new RoomOccupation { RoomId = roomA.Id,
                StartsAt = new(2027, 3, 24, 8, 0, 0), EndsAt = new(2027, 3, 24, 12, 0, 0),
                Kind = OccupationKind.Bloqueio };
            db.Occupations.AddRange(first, second, manual, ped, loaned, cancelled, scheduled, ead, blocked,
                new RoomOccupation { RoomId = roomB.Id, StartsAt = new(2027, 3, 3, 8, 0, 0),
                    EndsAt = new(2027, 3, 3, 12, 0, 0), Kind = OccupationKind.Avulsa, TeacherId = "teacher1" },
                new RoomOccupation { RoomId = roomC.Id, StartsAt = new(2027, 3, 2, 13, 0, 0),
                    EndsAt = new(2027, 3, 2, 17, 0, 0), Kind = OccupationKind.Avulsa, TeacherId = "teacher2" },
                new RoomOccupation { RoomId = roomC.Id, StartsAt = new(2027, 3, 8, 8, 0, 0),
                    EndsAt = new(2027, 3, 8, 12, 0, 0), Kind = OccupationKind.Avulsa,
                    TeacherId = "teacher2", ClassGroupId = classGroup.Id });
            db.AcademicCalendarEvents.Add(new AcademicCalendarEvent { SemesterId = semester.Id,
                StartDate = new(2027, 3, 19), EndDate = new(2027, 3, 19),
                Kind = AcademicDayKind.Holiday, Description = "Feriado" });
            await db.SaveChangesAsync();
            db.Loans.Add(new RoomLoan { RoomOccupationId = loaned.Id, BookingRequestId = recurring.Id,
                BorrowerId = "teacher1", Status = LoanStatus.AguardandoDestinatario, Reason = "Empréstimo" });
            await db.SaveChangesAsync();
            host.RoomAId = roomA.Id; host.RoomBId = roomB.Id; host.RoomCId = roomC.Id;
            host.SmallRoomId = small.Id; host.MorningId = morning.Id; host.AfternoonId = afternoon.Id;
            host.RecurringFirstId = first.Id; host.RecurringSecondId = second.Id;
            host.ManualId = manual.Id; host.PedagogicalId = ped.Id;
            host.LoanedId = loaned.Id; host.CancelledId = cancelled.Id;
            host.ScheduledId = scheduled.Id; host.EadId = ead.Id; host.BlockedId = blocked.Id;
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
