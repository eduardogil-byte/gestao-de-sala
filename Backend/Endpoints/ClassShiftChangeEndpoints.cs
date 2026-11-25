using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapClassShiftChange(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/classes/{id:int}/shift-change").RequireAuthorization("Admin");
        api.MapGet("", async (int id, int shiftId, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var item = await db.Classes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (item is null) return Results.NotFound();
            if (!await db.Shifts.AnyAsync(x => x.Id == shiftId)) return Error("Turno não encontrado");
            var preview = await PreviewClassShift(db, item, shiftId);
            await tx.CommitAsync();
            return Results.Ok(preview);
        });
        api.MapPut("", async (int id, ClassShiftChangeInput input, AppDbContext db, ClaimsPrincipal current) =>
        {
            if (!input.Confirmed || string.IsNullOrWhiteSpace(input.PreviewToken))
                return Error("Consulte os vínculos e confirme explicitamente a mudança de turno.");
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var item = await db.Classes.FirstOrDefaultAsync(x => x.Id == id);
            if (item is null) return Results.NotFound();
            if (!await db.Shifts.AnyAsync(x => x.Id == input.ShiftId)) return Error("Turno não encontrado");
            var preview = await PreviewClassShift(db, item, input.ShiftId);
            if (preview.PreviewToken != input.PreviewToken)
                return Results.Conflict(new ApiError("O turno ou os vínculos da turma mudaram. Cancele e consulte novamente antes de confirmar."));
            if (item.ShiftId == input.ShiftId) return Error("A turma já utiliza esse turno.");
            var previous = item.ShiftId;
            item.ShiftId = input.ShiftId;
            AuditTrail.Add(db, "ClassGroup", id.ToString(), "TurnoOficialAlterado", UserId(current),
                new { ShiftId = previous }, new { item.ShiftId, Confirmed = true, preview.Links });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.NoContent();
        });
    }

    private static async Task<ClassShiftChangePreview> PreviewClassShift(AppDbContext db, ClassGroup item, int shiftId)
    {
        // Include historical records, matching the protection on the general class update endpoint.
        var assignments = await db.Assignments.Where(x => x.ClassGroupId == item.Id).OrderBy(x => x.Id).Select(x => x.Id).ToListAsync();
        var bookings = await db.Bookings.Where(x => x.ClassGroupId == item.Id).OrderBy(x => x.Id).Select(x => x.Id).ToListAsync();
        var occupations = await db.Occupations.Where(x => x.ClassGroupId == item.Id).OrderBy(x => x.Id).Select(x => x.Id).ToListAsync();
        var plans = await db.ScheduleUnitPlans.Where(x => x.ClassGroupId == item.Id && x.Schedule.Status == ScheduleStatus.Publicada).OrderBy(x => x.Id).Select(x => x.Id).ToListAsync();
        var proposals = await db.PlanProposals.Where(x => x.Assignment.ClassGroupId == item.Id).OrderBy(x => x.Id).Select(x => x.Id).ToListAsync();
        var links = new List<ClassShiftLink>
        {
            new("Atribuições pedagógicas", assignments.Count), new("Reservas", bookings.Count),
            new("Ocupações", occupations.Count), new("Planos de UC em grades publicadas", plans.Count),
            new("Propostas de planejamento", proposals.Count)
        };
        var snapshot = JsonSerializer.Serialize(new { item.Id, item.ShiftId, TargetShiftId = shiftId,
            assignments, bookings, occupations, plans, proposals });
        var token = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(snapshot)));
        var shifts = await db.Shifts.AsNoTracking().Where(x => x.Id == shiftId || x.Id == item.ShiftId).ToListAsync();
        return new(item.Id, item.ShiftId, shifts.FirstOrDefault(x => x.Id == item.ShiftId)?.Name,
            shiftId, shifts.Single(x => x.Id == shiftId).Name, links.Where(x => x.Count > 0).ToList(), token);
    }
}
