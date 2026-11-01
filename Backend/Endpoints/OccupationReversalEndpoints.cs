using System.Data;
using System.Security.Claims;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private sealed record ReversalConfirm(bool Confirm, int ExpectedRoomId,
        DateTime ExpectedStartsAt, DateTime ExpectedEndsAt, int ExpectedLastChangeId);

    private static void MapOccupationReversals(RouteGroupBuilder api)
    {
        api.MapGet("/{id:int}/moves/{changeId:int}/{action}/preview", async
            (int id, int changeId, string action, AppDbContext db) =>
        {
            if (action is not ("undo" or "redo")) return Results.NotFound();
            var state = await ReversalState(db, id, changeId, action);
            if (state.Occupation is null || state.Reference is null) return Results.NotFound();
            if (state.Error is not null) return Results.Conflict(new ApiError(state.Error));
            var assessment = await AssessMove(db, state.Occupation!, state.Target!);
            return Results.Ok(new { Action = action, OccupationId = id, ReferenceChangeId = changeId,
                ExpectedLastChangeId = state.Latest!.Id, assessment.Origin, assessment.Destination,
                assessment.Allowed, assessment.Blocks, assessment.Warnings,
                assessment.TechnicalClassification, assessment.TechnicalFindings,
                assessment.AffectedOccupationIds });
        }).RequireAuthorization("Admin");

        api.MapPost("/{id:int}/moves/{changeId:int}/{action}", async
            (int id, int changeId, string action, ReversalConfirm input, ClaimsPrincipal current, AppDbContext db) =>
        {
            if (action is not ("undo" or "redo")) return Results.NotFound();
            if (!input.Confirm) return Error("Confirme a operação após consultar a prévia");
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
                var state = await ReversalState(db, id, changeId, action);
                if (state.Occupation is null || state.Reference is null) return Results.NotFound();
                if (state.Error is not null) return Results.Conflict(new ApiError(state.Error));
                var occupation = state.Occupation!;
                if (occupation.RoomId != input.ExpectedRoomId ||
                    occupation.StartsAt != input.ExpectedStartsAt || occupation.EndsAt != input.ExpectedEndsAt ||
                    state.Latest!.Id != input.ExpectedLastChangeId)
                    return Results.Conflict(new ApiError("A ocupação ou o histórico mudou desde a prévia"));
                var assessment = await AssessMove(db, occupation, state.Target!);
                if (!assessment.Allowed)
                    return Results.Conflict(new { Error = "O destino não atende às regras atuais", assessment.Blocks });
                occupation.RoomId = assessment.Destination.RoomId;
                occupation.StartsAt = assessment.Destination.StartsAt;
                occupation.EndsAt = assessment.Destination.EndsAt;
                occupation.ChangedById = UserId(current);
                var undo = action == "undo";
                db.OccupationChanges.Add(new OccupationChange
                {
                    RoomOccupationId = id, ChangedById = UserId(current),
                    Action = undo ? "Desfeita" : "Refeita", ReferenceChangeId = changeId,
                    FromRoomId = assessment.Origin.RoomId, FromStartsAt = assessment.Origin.StartsAt,
                    FromEndsAt = assessment.Origin.EndsAt, ToRoomId = assessment.Destination.RoomId,
                    ToStartsAt = assessment.Destination.StartsAt, ToEndsAt = assessment.Destination.EndsAt,
                    Details = $"Movimentação {changeId} {(undo ? "desfeita" : "refeita")}: " +
                        $"{assessment.Origin.RoomName} → {assessment.Destination.RoomName} " +
                        $"({assessment.Destination.StartsAt:dd/MM/yyyy HH:mm})"
                });
                if (occupation.TeacherId is string teacherId)
                    AuditTrail.Notify(db, teacherId, UserId(current),
                        undo ? "Movimentação desfeita" : "Movimentação refeita",
                        $"Sua ocupação foi {(undo ? "devolvida" : "movida")} de {assessment.Origin.RoomName} para " +
                        $"{assessment.Destination.RoomName} em {assessment.Destination.StartsAt:dd/MM/yyyy HH:mm}.",
                        "Occupation", id);
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return Results.Ok(new { occupation.Id, occupation.RoomId, occupation.StartsAt, occupation.EndsAt });
            }
            catch (SqlException error) when (error.Number is 1205 or 3960 or 1222 or 2601 or 2627)
            {
                return Results.Conflict(new ApiError("Conflito de concorrência. Consulte a prévia novamente"));
            }
            catch (DbUpdateConcurrencyException)
            {
                return Results.Conflict(new ApiError("A ocupação foi alterada durante a confirmação"));
            }
            catch (DbUpdateException error) when (error.InnerException is SqlException sql &&
                sql.Number is 1205 or 3960 or 1222 or 2601 or 2627)
            {
                return Results.Conflict(new ApiError("Conflito de concorrência. Consulte a prévia novamente"));
            }
        }).RequireAuthorization("Admin");
    }

    private static async Task<(RoomOccupation? Occupation, OccupationChange? Reference,
        OccupationChange? Latest, OccupationMovePreviewInput? Target, string? Error)>
        ReversalState(AppDbContext db, int id, int changeId, string action)
    {
        var occupation = await db.Occupations.FirstOrDefaultAsync(o => o.Id == id);
        var reference = await db.OccupationChanges.AsNoTracking().FirstOrDefaultAsync(c =>
            c.Id == changeId && c.RoomOccupationId == id && c.Action == "Remanejada");
        if (occupation is null || reference is null) return (occupation, reference, null, null, null);
        var latest = await db.OccupationChanges.AsNoTracking().Where(c => c.RoomOccupationId == id)
            .OrderByDescending(c => c.Id).FirstAsync();
        if (reference.FromRoomId is null || reference.FromStartsAt is null ||
            reference.FromEndsAt is null || reference.ToRoomId is null ||
            reference.ToStartsAt is null || reference.ToEndsAt is null)
            return (occupation, reference, latest, null, "Movimentação antiga sem dados estruturados para reversão");
        if (occupation.CancelledAtUtc is not null)
            return (occupation, reference, latest, null, "Ocupação cancelada");
        var eligible = action == "undo"
            ? (latest.Id == reference.Id || latest.Action == "Refeita" && latest.ReferenceChangeId == reference.Id)
            : latest.Action == "Desfeita" && latest.ReferenceChangeId == reference.Id;
        if (!eligible)
            return (occupation, reference, latest, null,
                action == "undo" ? "Movimentação não é a última reversível ou já foi desfeita" : "Refazer indisponível após alteração posterior");
        var expectedRoom = action == "undo" ? reference.ToRoomId : reference.FromRoomId;
        var expectedStart = action == "undo" ? reference.ToStartsAt : reference.FromStartsAt;
        var expectedEnd = action == "undo" ? reference.ToEndsAt : reference.FromEndsAt;
        if (occupation.RoomId != expectedRoom || occupation.StartsAt != expectedStart || occupation.EndsAt != expectedEnd)
            return (occupation, reference, latest, null, "Estado atual diferente do esperado após a movimentação");
        var targetRoom = action == "undo" ? reference.FromRoomId.Value : reference.ToRoomId.Value;
        var targetStart = action == "undo" ? reference.FromStartsAt.Value : reference.ToStartsAt.Value;
        var targetEnd = action == "undo" ? reference.FromEndsAt.Value : reference.ToEndsAt.Value;
        var shift = await db.Shifts.AsNoTracking().FirstOrDefaultAsync(s =>
            s.StartsAt == TimeOnly.FromDateTime(targetStart) && s.EndsAt == TimeOnly.FromDateTime(targetEnd));
        if (shift is null) return (occupation, reference, latest, null, "Turno histórico não existe mais");
        return (occupation, reference, latest,
            new OccupationMovePreviewInput(targetRoom, DateOnly.FromDateTime(targetStart), shift.Id), null);
    }
}
