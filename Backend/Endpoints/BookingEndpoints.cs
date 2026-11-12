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
        var api = app.MapGroup("/api/bookings").RequireAuthorization(policy => policy.RequireRole("Admin", "Professor")).WithTags("Reservas por turno");

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
            var shift = await db.Shifts.FirstOrDefaultAsync(s => s.StartsAt == TimeOnly.FromDateTime(input.StartsAt)
                && s.EndsAt == TimeOnly.FromDateTime(input.EndsAt));
            if (shift is null)
                return Error("A reserva deve ocupar exatamente um dos turnos cadastrados");
            if (input.Students is < 1 or > 500 || input.StudentsPerComputer is < 1 or > 20 ||
                !Enum.IsDefined(input.MinTier) || input.MinRamGb is < 0 or > 512 ||
                string.IsNullOrWhiteSpace(input.Reason) || input.SoftwareIds is null ||
                !await SoftwareExists(db, input.SoftwareIds) ||
                (input.ClassGroupId is int classId && !await db.Classes.AnyAsync(c => c.Id == classId)))
                return Error("Dados inválidos: confira turma, alunos, computadores e recursos");

            var isAdmin = current.IsInRole("Admin");
            var responsibleId = UserId(current);
            if (isAdmin)
            {
                if (string.IsNullOrWhiteSpace(input.TeacherId))
                    return Error("Selecione o instrutor responsável pela reserva.");
                responsibleId = input.TeacherId;
                var responsible = await db.Users.AnyAsync(u => u.Id == responsibleId);
                var hasTeacherRole = await db.UserRoles.Join(db.Roles,
                    link => link.RoleId, role => role.Id, (link, role) => new { link.UserId, role.Name })
                    .AnyAsync(x => x.UserId == responsibleId && x.Name == "Professor");
                if (!responsible || !hasTeacherRole)
                    return Error("Instrutor responsável não encontrado.");
            }
            else if (input.TeacherId is not null && input.TeacherId != responsibleId)
                return Results.Forbid();

            var turnError = await ValidateBookingTurn(db, input, shift.Id);
            if (turnError is not null) return turnError;

            var booking = new BookingRequest
            {
                TeacherId = responsibleId,
                TurnExceptionConfirmed = input.TurnExceptionConfirmed,
                ClassGroupId = input.ClassGroupId,
                CurricularUnitId = input.CurricularUnitId,
                CurricularCapabilityId = input.CurricularCapabilityId,
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
            var pedagogical = input.CurricularUnitId is not null || input.CurricularCapabilityId is not null;
            var qualificationWarning = false;
            if (pedagogical)
            {
                if (input.ClassGroupId is null || input.CurricularUnitId is null || input.CurricularCapabilityId is null)
                    return Error("Turma, UC e capacidade são obrigatórias na reserva pedagógica");
                var classGroup = await db.Classes.FirstAsync(x => x.Id == input.ClassGroupId);
                if (!await db.CurricularUnits.AnyAsync(x => x.Id == input.CurricularUnitId &&
                    x.CourseModule.CourseId == classGroup.CourseId))
                    return Error("A UC não pertence ao curso da turma");
                if (!await db.CurricularCapabilities.AnyAsync(x => x.Id == input.CurricularCapabilityId &&
                    x.CurricularUnitId == input.CurricularUnitId))
                    return Error("A capacidade não pertence à UC informada");
                if (!await db.Assignments.AnyAsync(x => x.TeacherId == booking.TeacherId &&
                    x.ClassGroupId == booking.ClassGroupId && x.CurricularUnitId == booking.CurricularUnitId &&
                    x.EndedAtUtc == null))
                    return Results.Forbid();
                if (!await PedagogicalAssignmentValid(db, booking, shift.Id))
                    return Error("Datas e turno não correspondem à atribuição da UC para esta turma");
                qualificationWarning = !await db.TeacherUnitQualifications.AnyAsync(x =>
                    x.TeacherId == booking.TeacherId && x.CurricularUnitId == input.CurricularUnitId);
            }
            await using var createTx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            db.Bookings.Add(booking);
            await db.SaveChangesAsync();
            AuditTrail.Add(db, "Booking", booking.Id.ToString(), "Criada", UserId(current), null,
                new { booking.TeacherId, booking.ClassGroupId, booking.CurricularUnitId,
                    booking.CurricularCapabilityId, booking.StartsAt, booking.EndsAt,
                    booking.Recurrence, booking.RepeatUntil, booking.Status, booking.TurnExceptionConfirmed });
            await db.SaveChangesAsync();
            await createTx.CommitAsync();
            return Results.Created($"/api/bookings/{booking.Id}", new
            {
                booking.Id,
                booking.Status,
                booking.CurricularUnitId,
                booking.CurricularCapabilityId,
                QualificationWarning = qualificationWarning,
                Occurrences = BookingPeriods.Expand(booking).Count,
                NextStep = $"GET /api/bookings/{booking.Id}/suggestions"
            });
        });

        api.MapGet("", async (ClaimsPrincipal current, AppDbContext db) =>
        {
            var teacherId = UserId(current);
            var isAdmin = current.IsInRole("Admin");
            var bookings = await db.Bookings.AsNoTracking().Include(b => b.Software)
                .Include(b => b.CurricularUnit).Include(b => b.CurricularCapability)
                .Where(b => isAdmin || b.TeacherId == teacherId)
                .OrderByDescending(b => b.Id).ToListAsync();
            return Results.Ok(bookings.Select(b => new
            {
                b.Id,
                Version = b.Revision.ToString("D"),
                b.TurnExceptionConfirmed,
                b.TeacherId,
                b.ClassGroupId,
                b.CurricularUnitId,
                b.CurricularCapabilityId,
                CurricularUnitName = b.CurricularUnit?.Name,
                CurricularCapabilityDescription = b.CurricularCapability?.Description,
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

        api.MapPut("/{id:int}", async (int id, BookingUpdate update, ClaimsPrincipal current, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var booking = await db.Bookings.Include(b => b.Software).FirstOrDefaultAsync(b => b.Id == id);
            if (booking is null) return Results.NotFound();
            if (booking.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            if (booking.Status != BookingStatus.Pendente) return Results.Conflict(new ApiError("Somente solicitações pendentes podem ser editadas"));
            if (!Guid.TryParse(update.Version, out var version)) return Error("Versão da solicitação inválida");
            if (booking.Revision != version)
                return Results.Conflict(new ApiError("A solicitação mudou. Recarregue antes de salvar."));
            var input = update.Booking;
            var validation = BookingPeriods.ValidationError(input.StartsAt, input.EndsAt,
                input.Recurrence, input.RepeatUntil, input.WeekdaysMask);
            if (validation is not null) return Error(validation);
            if (input.RecurringEadWeekday is int ed && (ed < 0 || ed > 6 ||
                input.Recurrence == BookingRecurrence.Nenhuma ||
                (input.Recurrence == BookingRecurrence.Semanal &&
                    (input.WeekdaysMask == 0 ? (int)input.StartsAt.DayOfWeek != ed :
                        (input.WeekdaysMask & (1 << ed)) == 0))))
                return Error("Dia recorrente de EAD inválido");
            var shift = await db.Shifts.FirstOrDefaultAsync(s => s.StartsAt == TimeOnly.FromDateTime(input.StartsAt)
                && s.EndsAt == TimeOnly.FromDateTime(input.EndsAt));
            if (shift is null) return Error("A reserva deve ocupar um turno cadastrado");
            if (input.TeacherId is not null && input.TeacherId != booking.TeacherId) return Results.Forbid();
            if (input.Students is < 1 or > 500 || input.StudentsPerComputer is < 1 or > 20 ||
                !Enum.IsDefined(input.MinTier) || input.MinRamGb is < 0 or > 512 ||
                string.IsNullOrWhiteSpace(input.Reason) || input.SoftwareIds is null ||
                !await SoftwareExists(db, input.SoftwareIds) ||
                (input.ClassGroupId is int classId && !await db.Classes.AnyAsync(c => c.Id == classId)))
                return Error("Dados inválidos: confira turma, alunos, computadores e recursos");
            var turnError = await ValidateBookingTurn(db, input, shift.Id);
            if (turnError is not null) return turnError;
            var pedagogical = input.CurricularUnitId is not null || input.CurricularCapabilityId is not null;
            if (pedagogical)
            {
                if (input.ClassGroupId is null || input.CurricularUnitId is null || input.CurricularCapabilityId is null)
                    return Error("Turma, UC e capacidade são obrigatórias na reserva pedagógica");
                var group = await db.Classes.FirstAsync(c => c.Id == input.ClassGroupId);
                if (!await db.CurricularUnits.AnyAsync(u => u.Id == input.CurricularUnitId && u.CourseModule.CourseId == group.CourseId) ||
                    !await db.CurricularCapabilities.AnyAsync(c => c.Id == input.CurricularCapabilityId && c.CurricularUnitId == input.CurricularUnitId))
                    return Error("UC ou capacidade não pertence à turma");
                if (!await db.Assignments.AnyAsync(a => a.TeacherId == booking.TeacherId && a.ClassGroupId == input.ClassGroupId &&
                    a.CurricularUnitId == input.CurricularUnitId && a.EndedAtUtc == null)) return Results.Forbid();
                var candidate = new BookingRequest { TeacherId = booking.TeacherId, ClassGroupId = input.ClassGroupId,
                    CurricularUnitId = input.CurricularUnitId, StartsAt = input.StartsAt, EndsAt = input.EndsAt,
                    Recurrence = input.Recurrence, RepeatUntil = input.RepeatUntil, WeekdaysMask = input.WeekdaysMask,
                    TurnExceptionConfirmed = input.TurnExceptionConfirmed };
                if (!await PedagogicalAssignmentValid(db, candidate, shift.Id))
                    return Error("Dia e turno não correspondem à atribuição ativa");
            }
            var before = new { booking.ClassGroupId, booking.StartsAt, booking.EndsAt, booking.Recurrence,
                booking.RepeatUntil, booking.TurnExceptionConfirmed };
            booking.ClassGroupId = input.ClassGroupId;
            booking.CurricularUnitId = input.CurricularUnitId;
            booking.CurricularCapabilityId = input.CurricularCapabilityId;
            booking.StartsAt = input.StartsAt; booking.EndsAt = input.EndsAt;
            booking.Recurrence = input.Recurrence; booking.RepeatUntil = input.RepeatUntil;
            booking.WeekdaysMask = input.WeekdaysMask; booking.RecurringEadWeekday = input.RecurringEadWeekday;
            booking.Students = input.Students; booking.StudentsPerComputer = input.StudentsPerComputer;
            booking.NeedsProjector = input.NeedsProjector; booking.NeedsTeacherComputer = input.NeedsTeacherComputer;
            booking.NeedsStudentComputers = input.NeedsStudentComputers; booking.MinTier = input.MinTier;
            booking.MinRamGb = input.MinRamGb; booking.NeedsDedicatedGpu = input.NeedsDedicatedGpu;
            booking.Reason = input.Reason.Trim(); booking.LessonPlanLink = input.LessonPlanLink;
            booking.TurnExceptionConfirmed = input.TurnExceptionConfirmed; booking.ApprovedRoomId = null;
            booking.Revision = Guid.NewGuid();
            var requestedSoftware = input.SoftwareIds.ToHashSet();
            db.BookingSoftware.RemoveRange(booking.Software.Where(s => !requestedSoftware.Contains(s.SoftwareId)));
            foreach (var softwareId in requestedSoftware.Where(softwareId =>
                booking.Software.All(s => s.SoftwareId != softwareId)))
                booking.Software.Add(new BookingSoftware { SoftwareId = softwareId });
            AuditTrail.Add(db, "Booking", id.ToString(), "Alterada", UserId(current), before,
                new { booking.ClassGroupId, booking.StartsAt, booking.EndsAt, booking.Recurrence,
                    booking.RepeatUntil, booking.TurnExceptionConfirmed });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new ApiError("A solicitação mudou. Recarregue antes de salvar.")); }
            await tx.CommitAsync();
            return Results.Ok(new { booking.Id, Version = booking.Revision.ToString("D") });
        });

        // Apresenta TODAS as salas, inclusive ocupadas ou incompatíveis.
        // A classificação prioriza compatibilidade e capacidade ANTES da disponibilidade.
        api.MapGet("/{id:int}/suggestions", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var booking = await db.Bookings.Include(b => b.Software).FirstOrDefaultAsync(b => b.Id == id);
            if (booking is null) return Results.NotFound();
            if (booking.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            var periods = BookingPeriods.Expand(booking);
            if (booking.CurricularCapabilityId is int capabilityId)
            {
                var calendar = await CalendarForBooking(db, booking);
                var requirement = await RequirementQuery(db).FirstOrDefaultAsync(x => x.CurricularCapabilityId == capabilityId);
                var technicalRooms = await RoomQuery(db).ToListAsync();
                var fromDate = periods.Min(p => p.Start);
                var toDate = periods.Max(p => p.End);
                var occupied = await db.Occupations.AsNoTracking().Where(o => o.CancelledAtUtc == null &&
                    o.StartsAt < toDate && o.EndsAt > fromDate).ToListAsync();
                var occupiedIds = occupied.Select(o => o.Id).ToArray();
                var loans = await db.Loans.AsNoTracking().Include(l => l.BookingRequest)
                    .Where(l => l.Status == LoanStatus.Aprovado && occupiedIds.Contains(l.RoomOccupationId))
                    .ToListAsync();
                var choices = technicalRooms.Select(room =>
                {
                    var technical = EnvironmentCompatibility.Evaluate(requirement, room, booking.Students,
                        DateOnly.FromDateTime(periods.Max(p => p.Start)));
                    bool Blocks(RoomOccupation o, (DateTime Start, DateTime End) p)
                    {
                        if (!ScheduleGenerator.Overlap(o.StartsAt, o.EndsAt, p.Start, p.End)) return false;
                        var loan = loans.FirstOrDefault(l => l.RoomOccupationId == o.Id);
                        return o.RoomId == room.Id || (loan?.BorrowerId ?? o.TeacherId) == booking.TeacherId ||
                            (loan is null ? o.ClassGroupId : loan.BookingRequest.ClassGroupId) == booking.ClassGroupId;
                    }
                    var conflicts = occupied.Where(o => periods.Any(p => Blocks(o, p)))
                        .Select(o => new { o.Id, o.StartsAt, o.EndsAt, o.RoomId,
                            TeacherId = loans.FirstOrDefault(l => l.RoomOccupationId == o.Id)?.BorrowerId ?? o.TeacherId,
                            ClassGroupId = loans.Any(l => l.RoomOccupationId == o.Id)
                                ? loans.First(l => l.RoomOccupationId == o.Id).BookingRequest.ClassGroupId
                                : o.ClassGroupId }).ToArray();
                    var free = room.Active ? periods.Count(p => calendar[DateOnly.FromDateTime(p.Start)].CountsAsPresential &&
                        !occupied.Any(o => Blocks(o, p))) : 0;
                    return new
                    {
                        room.Id, room.Name, room.Location, room.Purpose, room.Kind, room.Seats,
                        room.Active, Computers = room.ComputerGroups.Sum(g => g.Quantity),
                        Compatible = technical.Classification == "Compatible",
                        Incompatibility = string.Join("; ", technical.Findings.Where(x => x.Status != "Met")
                            .Select(x => x.Detail)),
                        TechnicalClassification = technical.Classification,
                        TechnicalFindings = technical.Findings,
                        Available = room.Active && free == periods.Count,
                        AvailabilityReason = room.Active ? null : "Sala inativa",
                        AvailableOccurrences = free, TotalOccurrences = periods.Count,
                        CalendarBlockedCount = periods.Count(p => !calendar[DateOnly.FromDateTime(p.Start)].CountsAsPresential),
                        Conflicts = conflicts,
                        ComputerGroups = room.ComputerGroups.Select(g => new
                        {
                            g.Quantity, g.RamGb, g.Tier,
                            Software = g.Software.Select(s => new { s.Software.Name, s.InstalledQuantity })
                        })
                    };
                }).OrderBy(x => x.TechnicalClassification switch
                { "Compatible" => 0, "Partial" => 1, _ => 2 })
                    .ThenBy(x => x.Name).ThenBy(x => x.Id).ToList();
                return Results.Ok(choices);
            }
            var rooms = await AllRooms(db);
            var from = periods.Min(p => p.Start);
            var to = periods.Max(p => p.End);
            var occupations = await db.Occupations.AsNoTracking()
                .Where(o => o.CancelledAtUtc == null && o.StartsAt < to && o.EndsAt > from)
                .ToListAsync();
            var ids = occupations.Select(o => o.Id).ToArray();
            var activeLoans = await db.Loans.AsNoTracking().Include(l => l.BookingRequest)
                .Where(l => l.Status == LoanStatus.Aprovado && ids.Contains(l.RoomOccupationId))
                .ToListAsync();
            var need = Need(booking);
            var lastDate = DateOnly.FromDateTime(periods.Max(p => p.Start));
            var list = rooms.Select(room =>
            {
                var mismatch = RoomCompatibility.Incompatibility(room, need, lastDate);
                int? ActualClass(RoomOccupation o)
                {
                    var loan = activeLoans.FirstOrDefault(l => l.RoomOccupationId == o.Id);
                    return loan is null ? o.ClassGroupId : loan.BookingRequest.ClassGroupId;
                }
                bool Blocks(RoomOccupation o, (DateTime Start, DateTime End) p) =>
                    ScheduleGenerator.Overlap(o.StartsAt, o.EndsAt, p.Start, p.End) &&
                    (o.RoomId == room.Id ||
                        (activeLoans.FirstOrDefault(l => l.RoomOccupationId == o.Id)?.BorrowerId ?? o.TeacherId) == booking.TeacherId ||
                        (booking.ClassGroupId.HasValue && ActualClass(o) == booking.ClassGroupId));
                var conflicts = occupations.Where(o =>
                    periods.Any(p => Blocks(o, p)))
                    .OrderBy(o => o.StartsAt).Select(o => new
                    {
                        o.Id,
                        o.StartsAt,
                        o.EndsAt,
                        ClassGroupId = ActualClass(o),
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
                    AvailableOccurrences = periods.Count(p => !occupations.Any(o => Blocks(o, p))),
                    TotalOccurrences = periods.Count,
                    Score = RoomCompatibility.Score(room, need)
                };
            }).OrderByDescending(x => x.Compatible)
                .ThenByDescending(x => x.Available)
                .ThenByDescending(x => x.AvailableOccurrences)
                .ThenByDescending(x => x.Compatible ? x.Score : x.Seats >= booking.Students ? 1 : 0)
                .ToList();
            return Results.Ok(list);
        });

        api.MapGet("/{id:int}/availability", async (int id, int roomId, ClaimsPrincipal current, AppDbContext db) =>
        {
            var booking = await db.Bookings.Include(b => b.Software).FirstOrDefaultAsync(b => b.Id == id);
            if (booking is null) return Results.NotFound();
            if (booking.TeacherId != UserId(current) && !current.IsInRole("Admin")) return Results.Forbid();
            var selectedRoom = await db.Rooms.AsNoTracking().Where(r => r.Id == roomId)
                .Select(r => new { r.Active }).FirstOrDefaultAsync();
            if (selectedRoom is null) return Results.NotFound();
            var periods = BookingPeriods.Expand(booking);
            var calendar = booking.CurricularCapabilityId is null ? null : await CalendarForBooking(db, booking);
            var from = periods.Min(p => p.Start);
            var to = periods.Max(p => p.End);
            var occ = await db.Occupations.AsNoTracking().Where(o => o.CancelledAtUtc == null
                && o.StartsAt < to && o.EndsAt > from).ToListAsync();
            var occIds = occ.Select(o => o.Id).ToArray();
            var loans = await db.Loans.AsNoTracking().Include(l => l.BookingRequest)
                    .Where(l => l.Status == LoanStatus.Aprovado && occIds.Contains(l.RoomOccupationId)).ToListAsync();
            var result = periods.Select(p =>
            {
                var blockers = occ.Where(o => ScheduleGenerator.Overlap(o.StartsAt, o.EndsAt, p.Start, p.End)
                    && (o.RoomId == roomId ||
                        (loans.FirstOrDefault(l => l.RoomOccupationId == o.Id)?.BorrowerId ?? o.TeacherId) == booking.TeacherId ||
                        (booking.ClassGroupId.HasValue &&
                            (loans.Any(l => l.RoomOccupationId == o.Id)
                                ? loans.First(l => l.RoomOccupationId == o.Id).BookingRequest.ClassGroupId
                                : o.ClassGroupId) == booking.ClassGroupId)))
                    .Select(o => new
                    {
                        o.Id,
                        o.RoomId,
                        TeacherId = loans.FirstOrDefault(l => l.RoomOccupationId == o.Id)?.BorrowerId ?? o.TeacherId,
                        ClassGroupId = loans.Any(l => l.RoomOccupationId == o.Id)
                            ? loans.First(l => l.RoomOccupationId == o.Id).BookingRequest.ClassGroupId
                            : o.ClassGroupId,
                        o.StartsAt,
                        o.EndsAt
                    }).ToList();
                var day = calendar?.GetValueOrDefault(DateOnly.FromDateTime(p.Start));
                return new
                {
                    p.Start, p.End,
                    Available = selectedRoom.Active && blockers.Count == 0 && (day is null || day.CountsAsPresential),
                    AvailabilityReason = selectedRoom.Active ? null : "Sala inativa",
                    CalendarStatus = day?.Kind,
                    CalendarReason = day is not null && !day.CountsAsPresential ? day.Reason : null,
                    Conflicts = blockers
                };
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
            var room = booking.CurricularCapabilityId is null
                ? (await AllRooms(db)).FirstOrDefault(r => r.Id == input.RoomId)
                : await RoomQuery(db).FirstOrDefaultAsync(r => r.Id == input.RoomId);
            if (room is null) return Results.NotFound();
            var bookingShift = await db.Shifts.Where(s => s.StartsAt == TimeOnly.FromDateTime(booking.StartsAt)
                && s.EndsAt == TimeOnly.FromDateTime(booking.EndsAt)).Select(s => s.Id).FirstOrDefaultAsync();
            if (bookingShift == 0) return Error("Turno da solicitação não encontrado");
            var currentTurnError = await ValidateBookingTurn(db, new BookingCreate(booking.ClassGroupId,
                booking.StartsAt, booking.EndsAt, booking.Students, booking.NeedsProjector,
                booking.NeedsTeacherComputer, booking.NeedsStudentComputers, booking.MinTier,
                booking.Software.Select(s => s.SoftwareId).ToList(), booking.Reason, booking.LessonPlanLink,
                booking.Recurrence, booking.RepeatUntil, booking.MinRamGb, booking.NeedsDedicatedGpu,
                booking.WeekdaysMask, booking.StudentsPerComputer, booking.RecurringEadWeekday,
                booking.CurricularUnitId, booking.CurricularCapabilityId, booking.TeacherId,
                booking.TurnExceptionConfirmed), bookingShift);
            if (currentTurnError is not null) return currentTurnError;
            Dictionary<DateOnly, CalendarDateResult>? calendar = null;
            if (booking.CurricularCapabilityId is int capabilityId)
            {
                var shiftId = await db.Shifts.Where(s => s.StartsAt == TimeOnly.FromDateTime(booking.StartsAt)
                    && s.EndsAt == TimeOnly.FromDateTime(booking.EndsAt)).Select(s => s.Id).FirstOrDefaultAsync();
                if (shiftId == 0 || !await PedagogicalAssignmentValid(db, booking, shiftId))
                    return Results.Forbid();
                var requirement = await RequirementQuery(db).FirstOrDefaultAsync(x => x.CurricularCapabilityId == capabilityId);
                var technical = EnvironmentCompatibility.Evaluate(requirement, room, booking.Students,
                    DateOnly.FromDateTime(BookingPeriods.Expand(booking).Max(p => p.Start)));
                if (technical.Classification != "Compatible")
                    return Results.Conflict(new { Error = "Compatibilidade técnica não comprovada",
                        technical.Classification, technical.Findings });
                calendar = await CalendarForBooking(db, booking);
            }
            if (booking.CurricularCapabilityId is null)
            {
                var mismatch = RoomCompatibility.Incompatibility(room, Need(booking),
                    DateOnly.FromDateTime(BookingPeriods.Expand(booking).Max(p => p.Start)));
                if (mismatch is not null) return Error($"A sala não atende aos requisitos: {mismatch}");
            }
            else if (!room.Active) return Results.Conflict(new ApiError("Sala inativa"));
            var free = new List<(DateTime Start, DateTime End)>();
            var unavailable = new List<object>();
            var replaced = new List<int>();
            foreach (var period in BookingPeriods.Expand(booking))
            {
                if (calendar is not null &&
                    !calendar[DateOnly.FromDateTime(period.Start)].CountsAsPresential)
                {
                    unavailable.Add(new { period.Start, period.End,
                        Reason = calendar[DateOnly.FromDateTime(period.Start)].Reason });
                    continue;
                }
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
            if (calendar is not null)
            {
                var expected = input.ExpectedAvailableDates;
                var actual = free.Select(p => DateOnly.FromDateTime(p.Start)).OrderBy(x => x).ToArray();
                if (expected is null || expected.Count != expected.Distinct().Count() ||
                    !actual.SequenceEqual(expected.OrderBy(x => x)))
                    return Results.Conflict(new ApiError("A disponibilidade mudou; consulte a prévia e confirme as datas novamente"));
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
            AuditTrail.Add(db, "Booking", booking.Id.ToString(), "Confirmada", UserId(current),
                new { Status = BookingStatus.Pendente, ApprovedRoomId = (int?)null },
                new { booking.Status, booking.ApprovedRoomId, ReservedCount = free.Count,
                    ReplacedOccupationIds = replaced.ToArray() });
            AuditTrail.Notify(db, booking.TeacherId, UserId(current), "Reserva confirmada",
                $"Sua reserva foi confirmada em {room.Name} para {free.Count} data(s).",
                "Booking", booking.Id);
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
            AuditTrail.Add(db, "Booking", booking.Id.ToString(), "Descartada", UserId(current),
                new { Status = BookingStatus.Pendente }, new { booking.Status });
            AuditTrail.Notify(db, booking.TeacherId, UserId(current), "Reserva descartada",
                "Sua solicitação de reserva pendente foi descartada.", "Booking", booking.Id);
            await db.SaveChangesAsync();
            return Results.Ok(new { booking.Id, booking.Status });
        });
    }

    private static async Task<IResult?> ValidateBookingTurn(AppDbContext db, BookingCreate input, int shiftId)
    {
        if (input.ClassGroupId is not int classId)
            return input.TurnExceptionConfirmed ? Error("Exceção de turno exige turma vinculada") : null;
        var official = await db.Classes.Where(c => c.Id == classId).Select(c => c.ShiftId).FirstOrDefaultAsync();
        if (official is null)
            return input.TurnExceptionConfirmed ? Error("Regularize o turno oficial da turma antes da exceção") : null;
        if (official == shiftId)
            return input.TurnExceptionConfirmed ? Error("A reserva já usa o turno oficial da turma") : null;
        if (!input.TurnExceptionConfirmed) return Error("Confirme explicitamente a exceção ao turno oficial da turma");
        if (input.Recurrence != BookingRecurrence.Nenhuma)
            return Error("Exceção de turno permitida apenas para uma data, sem recorrência");
        return null;
    }
}
