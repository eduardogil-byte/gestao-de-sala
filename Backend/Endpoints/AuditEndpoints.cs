using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapAudit(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/audit/{type}/{id}", async (string type, string id,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            var admin = current.IsInRole("Admin");
            var me = UserId(current);
            var number = int.TryParse(id, out var parsed) ? parsed : 0;
            var teacherKey = id.Split(':')[0];
            var exists = type switch
            {
                "Booking" => await db.Bookings.AnyAsync(b => b.Id == number),
                "Loan" => await db.Loans.AnyAsync(l => l.Id == number),
                "Assignment" => await db.Assignments.AnyAsync(a => a.Id == number),
                "Room" => await db.Rooms.AnyAsync(r => r.Id == number),
                "Resource" => await db.RoomResources.AnyAsync(r => r.Id == number),
                "ComputerGroup" => await db.ComputerGroups.AnyAsync(g => g.Id == number),
                "TeacherQualification" => await db.Users.AnyAsync(u => u.Id == teacherKey),
                _ => false
            };
            if (!exists) return Results.NotFound();
            if (!admin)
            {
                var allowed = type switch
                {
                    "Booking" => await db.Bookings.AnyAsync(b => b.Id == number && b.TeacherId == me),
                    "Loan" => await db.Loans.AnyAsync(l => l.Id == number &&
                        (l.BorrowerId == me || l.RoomOccupation.TeacherId == me)),
                    _ => false
                };
                if (!allowed) return Results.Forbid();
            }
            var entries = await db.AuditEntries.AsNoTracking()
                .Where(a => a.EntityType == type && a.EntityId == id)
                .OrderBy(a => a.CreatedAtUtc).ThenBy(a => a.Id).ToListAsync();
            var changes = type == "Booking"
                ? await db.OccupationChanges.AsNoTracking().Where(c => db.Occupations.Any(o =>
                    o.Id == c.RoomOccupationId && o.BookingRequestId == number)).ToListAsync()
                : [];
            var actorIds = entries.Select(a => a.ActorId).Concat(changes.Select(c => c.ChangedById))
                .Distinct().ToArray();
            var names = await db.Users.AsNoTracking().Where(u => actorIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName }).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
            var history = entries.Select(a => new AuditView(a.Id, a.EntityType, a.EntityId, a.Action,
                names.GetValueOrDefault(a.ActorId, "Usuário"),
                DateTime.SpecifyKind(a.CreatedAtUtc, DateTimeKind.Utc), a.BeforeJson, a.AfterJson,
                a.Reason, null)).Concat(changes.Select(c => new AuditView(c.Id, "Occupation",
                c.RoomOccupationId.ToString(), c.Action,
                names.GetValueOrDefault(c.ChangedById, "Usuário"),
                DateTime.SpecifyKind(c.ChangedAtUtc, DateTimeKind.Utc), null, null, null, c.Details)))
                .OrderBy(a => a.CreatedAtUtc).ThenBy(a => a.Id).ToList();
            return Results.Ok(history);
        }).RequireAuthorization().WithTags("Auditoria");
    }

    private sealed record AuditView(int Id, string EntityType, string EntityId, string Action,
        string ActorName, DateTime CreatedAtUtc, string? BeforeJson, string? AfterJson,
        string? Reason, string? Details);
}
