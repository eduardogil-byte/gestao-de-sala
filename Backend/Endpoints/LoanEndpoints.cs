using System.Data;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapLoans(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/loans").RequireAuthorization().WithTags("Empréstimos entre professores");
        api.MapGet("", async (ClaimsPrincipal current, AppDbContext db) =>
        {
            var me = UserId(current);
            var admin = current.IsInRole("Admin");
            var loans = await db.Loans.AsNoTracking().Include(l => l.RoomOccupation)
                .Include(l => l.BookingRequest)
                .Where(l => admin || l.BorrowerId == me || l.RoomOccupation.TeacherId == me)
                .OrderByDescending(l => l.RequestedAtUtc).ToListAsync();
            return Results.Ok(loans.Select(l => new
            {
                l.Id,
                l.RoomOccupationId,
                l.RoomOccupation.RoomId,
                l.RoomOccupation.StartsAt,
                l.RoomOccupation.EndsAt,
                OwnerTeacherId = l.RoomOccupation.TeacherId,
                l.BorrowerId,
                l.BookingRequest.ClassGroupId,
                l.Reason,
                l.Status,
                l.OwnerDisposition,
                l.ReplacementOccupationId,
                l.RequestedAtUtc,
                l.ApprovedAtUtc
            }));
        });

        // O titular escolhe uma ou várias ocorrências concretas da sua própria alocação.
        api.MapPost("/offer", async (LoanOffer input, ClaimsPrincipal current,
            UserManager<AppUser> users, AppDbContext db) =>
        {
            var ownerId = UserId(current);
            if (string.IsNullOrWhiteSpace(input.Reason) || input.RoomOccupationIds is null ||
                input.RoomOccupationIds.Count == 0 || input.RoomOccupationIds.Count > 150 ||
                input.RoomOccupationIds.Distinct().Count() != input.RoomOccupationIds.Count ||
                input.BorrowerId == ownerId) return Error("Informe destinatário, motivo e ocorrências sem repetições");
            var borrower = await users.FindByIdAsync(input.BorrowerId);
            if (borrower is null || !await users.IsInRoleAsync(borrower, "Professor"))
                return Error("Destinatário deve ser professor cadastrado");

            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var occurrences = await db.Occupations.Where(o => input.RoomOccupationIds.Contains(o.Id)).ToListAsync();
            if (occurrences.Count != input.RoomOccupationIds.Count ||
                occurrences.Any(o => o.TeacherId != ownerId || o.Kind == OccupationKind.Bloqueio ||
                    o.CancelledAtUtc != null || o.StartsAt < DateTime.Now))
                return Error("Só pode emprestar ocorrências futuras, ativas, dos seus próprios turnos");
            var occIds = occurrences.Select(x => x.Id).ToArray();
            if (await db.Loans.AnyAsync(l => occIds.Contains(l.RoomOccupationId) && l.Status != LoanStatus.Rejeitado))
                return Results.Conflict(new ApiError("Alguma ocorrência já possui empréstimo ativo ou em negociação"));
            var offers = new List<RoomLoan>();
            foreach (var occ in occurrences)
            {
                var request = new BookingRequest
                {
                    TeacherId = input.BorrowerId,
                    StartsAt = occ.StartsAt,
                    EndsAt = occ.EndsAt,
                    Students = 1,
                    StudentsPerComputer = 1,
                    Reason = input.Reason.Trim(),
                    Status = BookingStatus.Pendente
                };
                var loan = new RoomLoan
                {
                    RoomOccupationId = occ.Id,
                    BorrowerId = input.BorrowerId,
                    BookingRequest = request,
                    Reason = input.Reason.Trim(),
                    Status = LoanStatus.AguardandoDestinatario
                };
                db.Loans.Add(loan);
                offers.Add(loan);
            }
            db.Notifications.Add(new UserNotification
            {
                UserId = input.BorrowerId,
                ActorId = ownerId,
                Message = $"Você recebeu {offers.Count} oferta(s) de empréstimo de sala."
            });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created("/api/loans", offers.Select(l => new { l.Id, l.RoomOccupationId, l.Status }));
        });

        // O destinatário aceita e informa a turma e recursos de sua aula.
        api.MapPost("/{id:int}/accept", async (int id, LoanAccept input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var loan = await db.Loans.Include(l => l.RoomOccupation)
                .Include(l => l.BookingRequest).ThenInclude(b => b.Software)
                .FirstOrDefaultAsync(l => l.Id == id);
            if (loan is null) return Results.NotFound();
            if (loan.BorrowerId != UserId(current)) return Results.Forbid();
            if (loan.Status != LoanStatus.AguardandoDestinatario) return Error("Oferta não está aguardando aceite");
            if (input.Students is < 1 or > 500 || input.StudentsPerComputer is < 1 or > 20 ||
                !Enum.IsDefined(input.MinTier) || input.MinRamGb is < 0 or > 512 ||
                input.SoftwareIds is null || !await SoftwareExists(db, input.SoftwareIds) ||
                (input.ClassGroupId is int classId && !await db.Classes.AnyAsync(c => c.Id == classId)))
                return Error("Informações da aula do destinatário inválidas");
            var booking = loan.BookingRequest;
            var occ = loan.RoomOccupation;
            if (occ.CancelledAtUtc != null) return Results.Conflict(new ApiError("Alocação original foi liberada"));
            booking.ClassGroupId = input.ClassGroupId;
            booking.Students = input.Students;
            booking.StudentsPerComputer = input.StudentsPerComputer;
            booking.NeedsProjector = input.NeedsProjector;
            booking.NeedsTeacherComputer = input.NeedsTeacherComputer;
            booking.NeedsStudentComputers = input.NeedsStudentComputers;
            booking.MinTier = input.MinTier;
            booking.MinRamGb = input.MinRamGb;
            booking.NeedsDedicatedGpu = input.NeedsDedicatedGpu;
            db.BookingSoftware.RemoveRange(booking.Software);
            booking.Software = input.SoftwareIds.Distinct().Select(x => new BookingSoftware { SoftwareId = x }).ToList();
            var room = (await AllRooms(db)).FirstOrDefault(r => r.Id == occ.RoomId);
            if (room is null) return Results.NotFound();
            var mismatch = RoomCompatibility.Incompatibility(room, Need(booking));
            if (mismatch is not null) return Error($"Sala incompatível com a aula do destinatário: {mismatch}");
            var conflict = await ReservationRules.ConflictAsync(db, occ.RoomId,
                occ.StartsAt, occ.EndsAt, booking.TeacherId, booking.ClassGroupId, exceptOccupationId: occ.Id);
            if (conflict is not null) return Results.Conflict(new ApiError(conflict));
            loan.Status = LoanStatus.AguardandoSituacaoTitular;
            db.Notifications.Add(new UserNotification
            {
                UserId = occ.TeacherId!,
                ActorId = UserId(current),
                Message = "Empréstimo aceito. Defina EAD, dia não letivo ou outra sala para sua turma."
            });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { loan.Id, loan.Status });
        });

        api.MapPost("/{id:int}/finalize", async (int id, LoanFinish input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var loan = await db.Loans.Include(l => l.RoomOccupation)
                .Include(l => l.BookingRequest).ThenInclude(b => b.Software)
                .FirstOrDefaultAsync(l => l.Id == id);
            if (loan is null) return Results.NotFound();
            var owner = loan.RoomOccupation.TeacherId;
            if (owner != UserId(current)) return Results.Forbid();
            if (loan.Status != LoanStatus.AguardandoSituacaoTitular)
                return Error("Aguarde o aceite do destinatário");
            if (!Enum.IsDefined(input.Disposition)) return Error("Destino da turma inválido");
            if (input.Disposition == OwnerClassDisposition.OutraSala && !input.ReplacementRoomId.HasValue)
                return Error("Informe a sala para onde irá a turma titular");
            if (input.Disposition == OwnerClassDisposition.OutraSala &&
                input.ReplacementRoomId == loan.RoomOccupation.RoomId)
                return Error("A turma titular não pode permanecer na sala que será emprestada");
            if (input.Disposition != OwnerClassDisposition.OutraSala && input.ReplacementRoomId.HasValue)
                return Error("Sala substituta só é permitida quando a turma irá para outra sala");
            var occ = loan.RoomOccupation;
            if (occ.CancelledAtUtc != null) return Results.Conflict(new ApiError("A alocação original foi liberada"));
            if (await db.Loans.AnyAsync(l => l.RoomOccupationId == occ.Id &&
                l.Id != loan.Id && l.Status == LoanStatus.Aprovado))
                return Results.Conflict(new ApiError("Esta ocorrência já está emprestada"));
            var booking = loan.BookingRequest;
            var receiverConflict = await ReservationRules.ConflictAsync(db, occ.RoomId,
                occ.StartsAt, occ.EndsAt, booking.TeacherId, booking.ClassGroupId, exceptOccupationId: occ.Id);
            if (receiverConflict is not null) return Results.Conflict(new ApiError(receiverConflict));

            if (input.Disposition == OwnerClassDisposition.OutraSala)
            {
                var room = (await AllRooms(db)).FirstOrDefault(r => r.Id == input.ReplacementRoomId);
                if (room is null) return Results.NotFound();
                RoomNeed ownerNeed;
                if (occ.BookingRequestId is int originalBookingId)
                {
                    var originalBooking = await db.Bookings.Include(b => b.Software)
                        .FirstOrDefaultAsync(b => b.Id == originalBookingId);
                    if (originalBooking is null) return Error("Reserva original não encontrada");
                    ownerNeed = Need(originalBooking);
                }
                else if (occ.WeeklyClassId is int weeklyId)
                {
                    var weekly = await db.WeeklyClasses.Include(w => w.Assignment)
                        .ThenInclude(a => a.ClassGroup).Include(w => w.Assignment)
                        .ThenInclude(a => a.Software).FirstOrDefaultAsync(w => w.Id == weeklyId);
                    if (weekly is null) return Error("Atribuição original não encontrada");
                    ownerNeed = Need(weekly.Assignment);
                }
                else
                {
                    var count = occ.ClassGroupId is int cid
                        ? await db.Classes.Where(c => c.Id == cid).Select(c => c.Students).FirstOrDefaultAsync() : 1;
                    ownerNeed = new RoomNeed(Math.Max(1, count), false, false, false,
                        HardwareTier.Basico, Array.Empty<int>(), 0, false);
                }
                var mismatch = RoomCompatibility.Incompatibility(room, ownerNeed);
                if (mismatch is not null) return Error($"Sala substituta inadequada: {mismatch}");
                var ownerConflict = await ReservationRules.ConflictAsync(db, room.Id,
                    occ.StartsAt, occ.EndsAt, owner, occ.ClassGroupId, exceptOccupationId: occ.Id);
                if (ownerConflict is not null) return Results.Conflict(new ApiError(ownerConflict));
                var replacement = new RoomOccupation
                {
                    RoomId = room.Id,
                    StartsAt = occ.StartsAt,
                    EndsAt = occ.EndsAt,
                    Kind = OccupationKind.Aula,
                    TeacherId = owner,
                    ClassGroupId = occ.ClassGroupId,
                    Description = $"Realocação durante empréstimo #{loan.Id}",
                    ChangedById = owner
                };
                db.Occupations.Add(replacement);
                await db.SaveChangesAsync();
                loan.ReplacementOccupationId = replacement.Id;
            }
            loan.OwnerConfirmsNotUsing = true;
            loan.OwnerDisposition = input.Disposition;
            loan.Status = LoanStatus.Aprovado;
            loan.ApprovedAtUtc = DateTime.UtcNow;
            booking.Status = BookingStatus.Aprovada;
            booking.ApprovedRoomId = occ.RoomId;
            db.Notifications.Add(new UserNotification
            {
                UserId = booking.TeacherId,
                ActorId = owner!,
                Message = $"Empréstimo #{loan.Id} confirmado para {occ.StartsAt:dd/MM/yyyy} ({occ.StartsAt:HH:mm}–{occ.EndsAt:HH:mm})."
            });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { loan.Id, loan.Status, loan.OwnerDisposition, loan.ReplacementOccupationId });
        });

        api.MapPost("/{id:int}/reject", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var loan = await db.Loans.Include(l => l.RoomOccupation).FirstOrDefaultAsync(l => l.Id == id);
            if (loan is null) return Results.NotFound();
            if (loan.BorrowerId != UserId(current) && loan.RoomOccupation.TeacherId != UserId(current)
                && !current.IsInRole("Admin")) return Results.Forbid();
            if (loan.Status != LoanStatus.AguardandoDestinatario &&
                loan.Status != LoanStatus.AguardandoSituacaoTitular) return Error("Só é possível recusar empréstimos pendentes");
            loan.Status = LoanStatus.Rejeitado;
            await db.SaveChangesAsync();
            return Results.Ok(new { loan.Id, loan.Status });
        });
    }
}
