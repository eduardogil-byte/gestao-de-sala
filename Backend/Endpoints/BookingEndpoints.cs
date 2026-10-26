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
    private static void MapBookings(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/bookings").RequireAuthorization().WithTags("Reservas por turno");

        api.MapPost("", async (BookingCreate input, ClaimsPrincipal current, AppDbContext db) =>
        {
            var error = BookingPeriods.ValidationError(input.StartsAt, input.EndsAt,
                input.Recurrence, input.RepeatUntil, input.WeekdaysMask);
            if (error is not null) return Error(error);
            if (input.RecurringEadWeekday is int ed && (ed < 0 || ed > 6 ||
                input.Recurrence == BookingRecurrence.Nenhuma ||
                (input.Recurrence == BookingRecurrence.Semanal &&
                    (input.WeekdaysMask == 0
                        ? (int)input.StartsAt.DayOfWeek != ed
                        : (input.WeekdaysMask & (1 << ed)) == 0))))
                return Error("Dia recorrente de EAD deve existir entre os dias selecionados");
            if (!await db.Shifts.AnyAsync(s => s.StartsAt == TimeOnly.FromDateTime(input.StartsAt)
                && s.EndsAt == TimeOnly.FromDateTime(input.EndsAt)))
                return Error("A reserva deve ocupar exatamente um dos turnos cadastrados");
            if (input.Students is < 1 or > 500 || input.StudentsPerComputer is < 1 or > 20 ||
                !Enum.IsDefined(input.MinTier) || input.MinRamGb is < 0 or > 512 ||
                string.IsNullOrWhiteSpace(input.Reason) || input.SoftwareIds is null ||
                !await SoftwareExists(db, input.SoftwareIds) ||
                (input.ClassGroupId is int classId && !await db.Classes.AnyAsync(c => c.Id == classId)))
                return Error("Dados inválidos: confira turma, alunos, computadores e recursos");

            var booking = new BookingRequest
            {
                TeacherId = UserId(current),
                ClassGroupId = input.ClassGroupId,
                StartsAt = input.StartsAt,
                EndsAt = input.EndsAt,
                Recurrence = input.Recurrence,
                RepeatUntil = input.RepeatUntil,
                WeekdaysMask = input.WeekdaysMask,
                StudentsPerComputer = input.StudentsPerComputer,
                RecurringEadWeekday = input.RecurringEadWeekday,
                Students = input.Students,
                NeedsProjector = input.NeedsProjector,
                NeedsTeacherComputer = input.NeedsTeacherComputer,
                NeedsStudentComputers = input.NeedsStudentComputers,
                MinTier = input.MinTier,
                MinRamGb = input.MinRamGb,
                NeedsDedicatedGpu = input.NeedsDedicatedGpu,
                Reason = input.Reason.Trim(),
                LessonPlanLink = input.LessonPlanLink,
                Software = input.SoftwareIds.Distinct().Select(id => new BookingSoftware { SoftwareId = id }).ToList()
            };
            db.Bookings.Add(booking);
            await db.SaveChangesAsync();
            return Results.Created($"/api/bookings/{booking.Id}", new
            {
                booking.Id,
                booking.Status,
                Occurrences = BookingPeriods.Expand(booking).Count,
                NextStep = $"GET /api/bookings/{booking.Id}/suggestions"
            });
        });

        api.MapGet("", async (ClaimsPrincipal current, AppDbContext db) =>
        {
            var teacherId = UserId(current);
            var isAdmin = current.IsInRole("Admin");
            var bookings = await db.Bookings.AsNoTracking().Include(b => b.Software)
                .Where(b => isAdmin || b.TeacherId == teacherId)
                .OrderByDescending(b => b.Id).ToListAsync();
            return Results.Ok(bookings.Select(b => new
            {
                b.Id,
                b.TeacherId,
                b.ClassGroupId,
                b.StartsAt,
                b.EndsAt,
                b.Recurrence,
                b.RepeatUntil,
                b.WeekdaysMask,
                b.StudentsPerComputer,
                b.RecurringEadWeekday,
                b.Students,
                b.NeedsProjector,
                b.NeedsTeacherComputer,
                b.NeedsStudentComputers,
                b.MinTier,
                b.MinRamGb,
                b.NeedsDedicatedGpu,
                b.Status,
                b.Reason,
                b.LessonPlanLink,
                b.ApprovedRoomId,
                SoftwareIds = b.Software.Select(s => s.SoftwareId)
            }));
        });

        // Apresenta TODAS as salas, inclusive ocupadas ou incompatíveis.
        // A classificação prioriza compatibilidade e capacidade ANTES da disponibilidade.
        api.MapGet("/{id:int}/suggestions", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var booking = await db.Bookings.Include(b => b.Software).FirstOrDefaultAsync(b => b.Id == id);
            if (booking is null) return Results.NotFound();
            if (booking.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            var periods = BookingPeriods.Expand(booking);
            var rooms = await AllRooms(db);
            var from = periods.Min(p => p.Start);
            var to = periods.Max(p => p.End);
            var occupations = await db.Occupations.AsNoTracking()
                .Where(o => o.CancelledAtUtc == null && o.StartsAt < to && o.EndsAt > from)
                .ToListAsync();
            var ids = occupations.Select(o => o.Id).ToArray();
            var activeLoans = await db.Loans.AsNoTracking()
                .Where(l => l.Status == LoanStatus.Aprovado && ids.Contains(l.RoomOccupationId))
                .ToListAsync();
            var need = Need(booking);
            var list = rooms.Select(room =>
            {
                var mismatch = RoomCompatibility.Incompatibility(room, need);
                var conflicts = occupations.Where(o => o.RoomId == room.Id &&
                    periods.Any(p => ScheduleGenerator.Overlap(o.StartsAt, o.EndsAt, p.Start, p.End)))
                    .OrderBy(o => o.StartsAt).Select(o => new
                    {
                        o.Id,
                        o.StartsAt,
                        o.EndsAt,
                        o.ClassGroupId,
                        TeacherId = activeLoans.FirstOrDefault(l => l.RoomOccupationId == o.Id)?.BorrowerId ?? o.TeacherId
                    }).ToArray();
                return new
                {
                    room.Id,
                    room.Name,
                    room.Location,
                    room.Purpose,
                    room.Kind,
                    room.Seats,
                    room.Desks,
                    room.HasProjector,
                    room.HasTeacherComputer,
                    room.HasInternet,
                    room.Active,
                    Computers = room.ComputerGroups.Sum(g => g.Quantity),
                    ComputerGroups = room.ComputerGroups.Select(g => new
                    {
                        g.Quantity,
                        g.RamGb,
                        g.Tier,
                        g.DedicatedGpu,
                        Software = g.Software.Select(s => new { s.SoftwareId, s.Software.Name, s.InstalledQuantity })
                    }),
                    Compatible = mismatch is null,
                    Incompatibility = mismatch,
                    Available = conflicts.Length == 0,
                    Conflicts = conflicts,
                    AvailableOccurrences = periods.Count(p => !occupations.Any(o => o.RoomId == room.Id &&
                        ScheduleGenerator.Overlap(o.StartsAt, o.EndsAt, p.Start, p.End))),
                    TotalOccurrences = periods.Count,
                    Score = RoomCompatibility.Score(room, need)
                };
            }).OrderByDescending(x => x.Compatible)
                .ThenByDescending(x => x.Compatible ? x.Score : x.Seats >= booking.Students ? 1 : 0)
                .ThenByDescending(x => x.Available)
                .ThenByDescending(x => x.AvailableOccurrences)
                .ToList();
            return Results.Ok(list);
        });

        api.MapGet("/{id:int}/availability", async (int id, int roomId, ClaimsPrincipal current, AppDbContext db) =>
        {
            var booking = await db.Bookings.Include(b => b.Software).FirstOrDefaultAsync(b => b.Id == id);
            if (booking is null) return Results.NotFound();
            if (booking.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            if (!await db.Rooms.AnyAsync(r => r.Id == roomId)) return Results.NotFound();
            var periods = BookingPeriods.Expand(booking);
            var from = periods.Min(p => p.Start);
            var to = periods.Max(p => p.End);
            var occ = await db.Occupations.AsNoTracking().Where(o => o.CancelledAtUtc == null
                && o.StartsAt < to && o.EndsAt > from).ToListAsync();
            var result = periods.Select(p =>
            {
                var blockers = occ.Where(o => ScheduleGenerator.Overlap(o.StartsAt, o.EndsAt, p.Start, p.End)
                    && (o.RoomId == roomId || o.TeacherId == booking.TeacherId ||
                        (booking.ClassGroupId.HasValue && o.ClassGroupId == booking.ClassGroupId)))
                    .Select(o => new
                    {
                        o.Id,
                        o.RoomId,
                        o.TeacherId,
                        o.ClassGroupId,
                        o.StartsAt,
                        o.EndsAt
                    }).ToList();
                return new { p.Start, p.End, Available = blockers.Count == 0, Conflicts = blockers };
            }).ToList();
            return Results.Ok(new
            {
                RoomId = roomId,
                Total = result.Count,
                Available = result.Count(x => x.Available),
                Unavailable = result.Count(x => !x.Available),
                Days = result
            });
        });

        // O próprio professor confirma. Uma série parcialmente disponível exige confirmação EXPLÍCITA.
        api.MapPost("/{id:int}/confirm", async (int id, ConfirmBooking input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var booking = await db.Bookings.Include(b => b.Software).FirstOrDefaultAsync(b => b.Id == id);
            if (booking is null) return Results.NotFound();
            if (booking.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            if (booking.Status != BookingStatus.Pendente) return Error("A reserva já foi processada");
            var room = (await AllRooms(db)).FirstOrDefault(r => r.Id == input.RoomId);
            if (room is null) return Results.NotFound();
            var mismatch = RoomCompatibility.Incompatibility(room, Need(booking));
            if (mismatch is not null) return Error($"A sala não atende aos requisitos: {mismatch}");
            var free = new List<(DateTime Start, DateTime End)>();
            var unavailable = new List<object>();
            var replaced = new List<int>();
            foreach (var period in BookingPeriods.Expand(booking))
            {
                RoomOccupation? original = null;
                if (input.ReplaceOwnClassBooking && booking.ClassGroupId.HasValue)
                {
                    var old = await db.Occupations.Where(o => o.CancelledAtUtc == null &&
                        o.TeacherId == booking.TeacherId && o.ClassGroupId == booking.ClassGroupId &&
                        o.StartsAt < period.End && period.Start < o.EndsAt).ToListAsync();
                    if (old.Count == 1 && old[0].Kind != OccupationKind.Bloqueio &&
                        !await db.Loans.AnyAsync(l => l.RoomOccupationId == old[0].Id &&
                            l.Status != LoanStatus.Rejeitado))
                        original = old[0];
                }
                var conflict = await ReservationRules.ConflictAsync(db, room.Id,
                    period.Start, period.End, booking.TeacherId, booking.ClassGroupId,
                    exceptOccupationId: original?.Id);
                if (conflict is null)
                {
                    free.Add(period);
                    if (original is not null)
                    {
                        original.CancelledAtUtc = DateTime.UtcNow;
                        original.ChangedById = UserId(current);
                        db.OccupationChanges.Add(new OccupationChange
                        {
                            RoomOccupationId = original.Id,
                            ChangedById = UserId(current),
                            Action = "Substituida",
                            Details = $"Nova solicitação #{booking.Id} na sala {room.Id}"
                        });
                        replaced.Add(original.Id);
                        // A próxima iteração vê a data já substituída dentro da mesma transação.
                        await db.SaveChangesAsync();
                    }
                }
                else unavailable.Add(new { period.Start, period.End, Reason = conflict });
            }
            if (unavailable.Count > 0 && !input.ConfirmPartial)
                return Results.Conflict(new
                {
                    Error = "Existem datas indisponíveis. Confirme a reserva parcial.",
                    AvailableDates = free.Select(p => p.Start).ToArray(),
                    UnavailableDates = unavailable
                });
            if (free.Count == 0) return Results.Conflict(new ApiError("Não há datas disponíveis para essa sala"));
            db.Occupations.AddRange(free.Select(period => new RoomOccupation
            {
                RoomId = room.Id,
                StartsAt = period.Start,
                EndsAt = period.End,
                Kind = OccupationKind.Avulsa,
                TeacherId = booking.TeacherId,
                ClassGroupId = booking.ClassGroupId,
                BookingRequestId = booking.Id,
                DayStatus = booking.RecurringEadWeekday == (int)period.Start.DayOfWeek
                    ? ClassDayStatus.Ead : ClassDayStatus.Letivo,
                Description = booking.Reason
            }));
            booking.Status = BookingStatus.Aprovada; // preserva enum antigo para o frontend
            booking.ApprovedRoomId = room.Id;
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new
            {
                booking.Id,
                booking.Status,
                booking.ApprovedRoomId,
                ReservedCount = free.Count,
                ReplacedOccupationIds = replaced,
                UnavailableDates = unavailable
            });
        });

        // Compatibilidade com clientes antigos: endpoint administrativo continua disponível,
        // mas não é o caminho indicado: professores devem chamar /confirm.
        api.MapPost("/{id:int}/approve", async (int id, ApproveBooking input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            return Results.BadRequest(new ApiError("Use POST /api/bookings/{id}/confirm (sem aprovação administrativa)"));
        }).RequireAuthorization("Admin");

        api.MapPost("/{id:int}/reject", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var booking = await db.Bookings.FindAsync(id);
            if (booking is null) return Results.NotFound();
            if (booking.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            if (booking.Status != BookingStatus.Pendente) return Error("Somente solicitações pendentes podem ser descartadas");
            booking.Status = BookingStatus.Rejeitada;
            await db.SaveChangesAsync();
            return Results.Ok(new { booking.Id, booking.Status });
        });
    }
}
