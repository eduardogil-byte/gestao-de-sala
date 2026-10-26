using System.Data;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapOccupationManagement(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/occupations").RequireAuthorization().WithTags("Gerenciar alocações");

        api.MapGet("/{id:int}/history", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var occ = await db.Occupations.FindAsync(id);
            if (occ is null) return Results.NotFound();
            if (occ.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            return Results.Ok(await db.OccupationChanges.AsNoTracking()
                .Where(c => c.RoomOccupationId == id).OrderByDescending(c => c.ChangedAtUtc).ToListAsync());
        });

        // Editar letivo/EAD/não letivo NÃO libera a sala: a liberação é uma ação explícita.
        api.MapPut("/{id:int}/day-status", async (int id, DayStatusChange input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            var occ = await db.Occupations.FindAsync(id);
            if (occ is null || occ.CancelledAtUtc != null) return Results.NotFound();
            if (occ.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            if (occ.Kind == OccupationKind.Bloqueio || !Enum.IsDefined(input.Status))
                return Error("Situação letiva inválida");
            if (await db.Loans.AnyAsync(l => l.RoomOccupationId == id &&
                l.Status == LoanStatus.Aprovado))
                return Results.Conflict(new ApiError("A ocorrência emprestada precisa preservar a situação da turma titular no empréstimo"));
            var old = occ.DayStatus;
            occ.DayStatus = input.Status;
            occ.ChangedById = UserId(current);
            db.OccupationChanges.Add(new OccupationChange
            {
                RoomOccupationId = id,
                ChangedById = UserId(current),
                Action = "DiaLetivo",
                Details = $"{old} -> {input.Status}"
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { occ.Id, occ.DayStatus, RoomRemainsReserved = true });
        });

        api.MapPost("/release-many", async (ReleaseMultiple input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!input.Confirm || input.OccupationIds is null || input.OccupationIds.Count == 0 ||
                input.OccupationIds.Count > 150 || input.OccupationIds.Distinct().Count() != input.OccupationIds.Count)
                return Error("Selecione até 150 datas distintas e confirme a liberação");
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var items = await db.Occupations.Where(o => input.OccupationIds.Contains(o.Id)).ToListAsync();
            if (items.Count != input.OccupationIds.Count) return Results.NotFound();
            if (items.Any(o => o.TeacherId != UserId(current) && !current.IsInRole("Admin")))
                return Results.Forbid();
            if (items.Any(o => o.CancelledAtUtc != null || o.Kind == OccupationKind.Bloqueio))
                return Error("A seleção contém uma ocorrência liberada ou bloqueada");
            var ids = items.Select(o => o.Id).ToArray();
            if (await db.Loans.AnyAsync(l => ids.Contains(l.RoomOccupationId) &&
                l.Status != LoanStatus.Rejeitado))
                return Results.Conflict(new ApiError("A seleção contém empréstimos ativos ou pendentes"));
            foreach (var occ in items)
            {
                occ.CancelledAtUtc = DateTime.UtcNow;
                occ.ChangedById = UserId(current);
                db.OccupationChanges.Add(new OccupationChange
                {
                    RoomOccupationId = occ.Id,
                    ChangedById = UserId(current),
                    Action = "Liberada",
                    Details = $"Sala {occ.RoomId}, {occ.StartsAt:dd/MM/yyyy HH:mm}"
                });
            }
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { ReleasedCount = items.Count, OccupationIds = ids });
        });

        api.MapPost("/{id:int}/release", async (int id, ReleaseOccupation input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!input.Confirm) return Error("Confirme explicitamente a liberação da data");
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var occ = await db.Occupations.FirstOrDefaultAsync(o => o.Id == id && o.CancelledAtUtc == null);
            if (occ is null) return Results.NotFound();
            if (occ.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            if (occ.Kind == OccupationKind.Bloqueio) return Error("Bloqueios só podem ser retirados pela coordenação");
            if (await db.Loans.AnyAsync(l => l.RoomOccupationId == id && l.Status != LoanStatus.Rejeitado))
                return Results.Conflict(new ApiError("Resolva os empréstimos desta ocorrência antes de liberá-la"));
            occ.CancelledAtUtc = DateTime.UtcNow;
            occ.ChangedById = UserId(current);
            db.OccupationChanges.Add(new OccupationChange
            {
                RoomOccupationId = id,
                ChangedById = UserId(current),
                Action = "Liberada",
                Details = $"Sala {occ.RoomId}, {occ.StartsAt:dd/MM/yyyy HH:mm}"
            });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { occ.Id, Released = true });
        });

        // Recomenda outras salas, inclusive ocupadas, mostrando as diferenças técnicas.
        api.MapGet("/{id:int}/room-options", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var occ = await db.Occupations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id && o.CancelledAtUtc == null);
            if (occ is null) return Results.NotFound();
            if (occ.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            RoomNeed need;
            if (occ.BookingRequestId is int bookingId)
            {
                var booking = await db.Bookings.Include(b => b.Software).FirstOrDefaultAsync(b => b.Id == bookingId);
                if (booking is null) return Error("Reserva original não encontrada");
                need = Need(booking);
            }
            else if (occ.WeeklyClassId is int weeklyId)
            {
                var weekly = await db.WeeklyClasses.Include(w => w.Assignment)
                    .ThenInclude(a => a.ClassGroup).Include(w => w.Assignment)
                    .ThenInclude(a => a.Software).FirstOrDefaultAsync(w => w.Id == weeklyId);
                if (weekly is null) return Error("Atribuição original não encontrada");
                need = Need(weekly.Assignment);
            }
            else
            {
                var count = occ.ClassGroupId is int classId
                    ? await db.Classes.Where(c => c.Id == classId).Select(c => c.Students).FirstOrDefaultAsync() : 1;
                need = new RoomNeed(Math.Max(1, count), false, false, false,
                    HardwareTier.Basico, Array.Empty<int>(), 0, false);
            }
            var rooms = await AllRooms(db);
            var overlapping = await db.Occupations.AsNoTracking().Where(o =>
                o.Id != id && o.CancelledAtUtc == null &&
                o.StartsAt < occ.EndsAt && occ.StartsAt < o.EndsAt).ToListAsync();
            return Results.Ok(rooms.Select(room =>
            {
                var mismatch = RoomCompatibility.Incompatibility(room, need);
                var occupiedBy = overlapping.Where(o => o.RoomId == room.Id)
                    .Select(o => new { o.Id, o.TeacherId, o.ClassGroupId }).ToList();
                return new
                {
                    room.Id,
                    room.Name,
                    room.Location,
                    room.Purpose,
                    room.Kind,
                    room.Seats,
                    Computers = room.ComputerGroups.Sum(g => g.Quantity),
                    Compatible = mismatch is null,
                    Incompatibility = mismatch,
                    Available = occupiedBy.Count == 0,
                    OccupiedBy = occupiedBy,
                    Score = RoomCompatibility.Score(room, need)
                };
            }).OrderByDescending(x => x.Compatible)
              .ThenByDescending(x => x.Score)
              .ThenByDescending(x => x.Available).ToList());
        });

        // Transferir a própria ocorrência não requer aprovação e preserva histórico.
        api.MapPut("/{id:int}/room", async (int id, MoveOccupation input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var occ = await db.Occupations.FirstOrDefaultAsync(o => o.Id == id && o.CancelledAtUtc == null);
            if (occ is null) return Results.NotFound();
            if (occ.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            if (occ.Kind == OccupationKind.Bloqueio) return Error("Bloqueios não podem ser transferidos");
            if (occ.RoomId == input.RoomId) return Error("A ocorrência já está nessa sala");
            if (await db.Loans.AnyAsync(l => l.RoomOccupationId == id && l.Status != LoanStatus.Rejeitado))
                return Results.Conflict(new ApiError("Não transfira uma sala com empréstimo ativo ou pendente"));
            var room = (await AllRooms(db)).FirstOrDefault(r => r.Id == input.RoomId);
            if (room is null) return Results.NotFound();
            RoomNeed need;
            if (occ.BookingRequestId is int bookingId)
            {
                var booking = await db.Bookings.Include(b => b.Software).FirstOrDefaultAsync(b => b.Id == bookingId);
                if (booking is null) return Error("Reserva de origem não encontrada");
                need = Need(booking);
            }
            else if (occ.WeeklyClassId is int weeklyId)
            {
                var weekly = await db.WeeklyClasses.Include(w => w.Assignment)
                    .ThenInclude(a => a.ClassGroup).Include(w => w.Assignment)
                    .ThenInclude(a => a.Software).FirstOrDefaultAsync(w => w.Id == weeklyId);
                if (weekly is null) return Error("Atribuição original não encontrada");
                need = Need(weekly.Assignment);
            }
            else
            {
                var count = occ.ClassGroupId is int classId
                    ? await db.Classes.Where(c => c.Id == classId).Select(c => c.Students).FirstOrDefaultAsync() : 1;
                need = new RoomNeed(Math.Max(1, count), false, false, false,
                    HardwareTier.Basico, Array.Empty<int>(), 0, false);
            }
            var mismatch = RoomCompatibility.Incompatibility(room, need);
            if (mismatch is not null) return Error($"Sala substituta inadequada: {mismatch}");
            var conflict = await ReservationRules.ConflictAsync(db, room.Id,
                occ.StartsAt, occ.EndsAt, occ.TeacherId, occ.ClassGroupId, exceptOccupationId: occ.Id);
            if (conflict is not null) return Results.Conflict(new ApiError(conflict));
            var oldRoomId = occ.RoomId;
            occ.RoomId = input.RoomId;
            occ.ChangedById = UserId(current);
            db.OccupationChanges.Add(new OccupationChange
            {
                RoomOccupationId = id,
                ChangedById = UserId(current),
                Action = "Transferida",
                Details = $"Sala {oldRoomId} -> sala {room.Id}"
            });
            if (input.NotifyTeachers && occ.TeacherId != UserId(current) && occ.TeacherId is not null)
                db.Notifications.Add(new UserNotification
                {
                    UserId = occ.TeacherId,
                    ActorId = UserId(current),
                    Message = $"Sua aula em {occ.StartsAt:dd/MM/yyyy HH:mm} foi transferida da sala {oldRoomId} para {room.Name}."
                });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { occ.Id, OldRoomId = oldRoomId, occ.RoomId });
        });

        var notifications = app.MapGroup("/api/notifications").RequireAuthorization().WithTags("Notificações");
        notifications.MapGet("", async (ClaimsPrincipal current, AppDbContext db) =>
        {
            var items = await db.Notifications.AsNoTracking()
                .Where(n => n.UserId == UserId(current))
                .OrderByDescending(n => n.CreatedAtUtc).Take(100).ToListAsync();
            var actorIds = items.Select(n => n.ActorId).Distinct().ToArray();
            var names = await db.Users.AsNoTracking().Where(u => actorIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName }).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
            return Results.Ok(items.Select(n => new
            {
                n.Id,
                n.UserId,
                n.ActorId,
                ActorName = names.GetValueOrDefault(n.ActorId, "Usuário"),
                n.Message,
                n.CreatedAtUtc,
                n.ReadAtUtc
            }));
        });
        notifications.MapGet("/unread-count", async (ClaimsPrincipal current, AppDbContext db) =>
            Results.Ok(new { count = await db.Notifications.CountAsync(n => n.UserId == UserId(current) && n.ReadAtUtc == null) }));
        notifications.MapPost("/read-all", async (ClaimsPrincipal current, AppDbContext db) =>
        {
            await db.Notifications.Where(n => n.UserId == UserId(current) && n.ReadAtUtc == null)
                .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAtUtc, (DateTime?)DateTime.UtcNow));
            return Results.NoContent();
        });
        notifications.MapPost("/{id:int}/read", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var n = await db.Notifications.FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId(current));
            if (n is null) return Results.NotFound();
            n.ReadAtUtc ??= DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        app.MapGet("/api/dashboard/usage", async (DateOnly from, DateOnly to, int? shiftId,
            int? classGroupId, AppDbContext db) =>
        {
            if (to < from || to.DayNumber - from.DayNumber > 366)
                return Error("Informe período válido de até 366 dias");
            var start = from.ToDateTime(TimeOnly.MinValue);
            var end = to.AddDays(1).ToDateTime(TimeOnly.MinValue);
            var shifts = await db.Shifts.AsNoTracking().ToListAsync();
            if (shiftId.HasValue && shifts.All(s => s.Id != shiftId)) return Results.NotFound();
            var occ = await db.Occupations.AsNoTracking()
                .Where(o => o.CancelledAtUtc == null && o.StartsAt < end && o.EndsAt > start)
                .ToListAsync();
            var ids = occ.Select(o => o.Id).ToArray();
            var loans = await db.Loans.AsNoTracking().Include(l => l.BookingRequest)
                .Where(l => l.Status == LoanStatus.Aprovado && ids.Contains(l.RoomOccupationId))
                .ToListAsync();
            var visible = occ.Where(o =>
            {
                var loan = loans.FirstOrDefault(l => l.RoomOccupationId == o.Id);
                var actualClass = loan is null ? o.ClassGroupId : loan.BookingRequest.ClassGroupId;
                return (shiftId is null || shifts.Any(s => s.Id == shiftId &&
                        s.StartsAt == TimeOnly.FromDateTime(o.StartsAt) && s.EndsAt == TimeOnly.FromDateTime(o.EndsAt))) &&
                    (classGroupId == null || actualClass == classGroupId) &&
                    (loan is not null || o.DayStatus == ClassDayStatus.Letivo);
            }).ToList();
            var dailyCounts = visible.GroupBy(o => DateOnly.FromDateTime(o.StartsAt))
                .ToDictionary(g => g.Key, g => g.Select(o => o.RoomId).Distinct().Count());
            var days = Enumerable.Range(0, to.DayNumber - from.DayNumber + 1)
                .Select(n =>
                {
                    var day = from.AddDays(n);
                    return new { Date = day, OccupiedRooms = dailyCounts.GetValueOrDefault(day) };
                })
                .ToList();
            var roomIds = await db.Rooms.AsNoTracking().Select(r => r.Id).ToListAsync();
            var byRoom = roomIds.Select(roomId =>
            {
                var uses = visible.Where(o => o.RoomId == roomId).ToList();
                return new
                {
                    RoomId = roomId,
                    Occurrences = uses.Count,
                    Hours = uses.Sum(o => (o.EndsAt - o.StartsAt).TotalHours)
                };
            }).OrderByDescending(r => r.Hours).ToList();
            return Results.Ok(new
            {
                From = from,
                To = to,
                ShiftId = shiftId,
                ClassGroupId = classGroupId,
                Days = days,
                Rooms = byRoom
            });
        }).RequireAuthorization();
    }
}
