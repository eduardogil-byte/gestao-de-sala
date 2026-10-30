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
    private static void MapOccupationMoves(RouteGroupBuilder api)
    {
        api.MapPost("/{id:int}/move-preview", async (int id, OccupationMovePreviewInput input,
            AppDbContext db) =>
        {
            var occupation = await db.Occupations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id);
            if (occupation is null || occupation.CancelledAtUtc is not null) return Results.NotFound();
            return Results.Ok(await AssessMove(db, occupation, input));
        }).RequireAuthorization("Admin");

        api.MapPost("/{id:int}/move", async (int id, OccupationMoveConfirmInput input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!input.Confirm || input.Reason?.Length > 500)
                return Error("Confirme a movimentação e informe um motivo de até 500 caracteres");
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
                var occupation = await db.Occupations.FirstOrDefaultAsync(o => o.Id == id);
                if (occupation is null || occupation.CancelledAtUtc is not null) return Results.NotFound();
                if (occupation.RoomId != input.ExpectedRoomId ||
                    occupation.StartsAt != input.ExpectedStartsAt || occupation.EndsAt != input.ExpectedEndsAt)
                    return Results.Conflict(new ApiError("A ocupação mudou desde a prévia. Atualize o cronograma e consulte novamente"));
                var assessment = await AssessMove(db, occupation,
                    new OccupationMovePreviewInput(input.RoomId, input.Date, input.ShiftId));
                if (!assessment.Allowed)
                    return Results.Conflict(new { Error = "O destino mudou ou não atende às regras. Consulte a prévia novamente",
                        assessment.Blocks });
                occupation.RoomId = input.RoomId;
                occupation.StartsAt = assessment.Destination.StartsAt;
                occupation.EndsAt = assessment.Destination.EndsAt;
                occupation.ChangedById = UserId(current);
                db.OccupationChanges.Add(new OccupationChange
                {
                    RoomOccupationId = occupation.Id,
                    ChangedById = UserId(current),
                    Action = "Remanejada",
                    FromRoomId = assessment.Origin.RoomId,
                    FromStartsAt = assessment.Origin.StartsAt,
                    FromEndsAt = assessment.Origin.EndsAt,
                    ToRoomId = assessment.Destination.RoomId,
                    ToStartsAt = assessment.Destination.StartsAt,
                    ToEndsAt = assessment.Destination.EndsAt,
                    Details = $"{assessment.Origin.RoomName} ({assessment.Origin.RoomId}), " +
                        $"{assessment.Origin.StartsAt:dd/MM/yyyy HH:mm}-{assessment.Origin.EndsAt:HH:mm} -> " +
                        $"{assessment.Destination.RoomName} ({assessment.Destination.RoomId}), " +
                        $"{assessment.Destination.StartsAt:dd/MM/yyyy HH:mm}-{assessment.Destination.EndsAt:HH:mm}" +
                        (string.IsNullOrWhiteSpace(input.Reason) ? "" : $"; motivo: {input.Reason.Trim()}")
                });
                if (occupation.TeacherId is string teacherId)
                    AuditTrail.Notify(db, teacherId, UserId(current), "Aula remanejada",
                        $"Sua ocupação de {assessment.Origin.StartsAt:dd/MM/yyyy HH:mm} foi remanejada de " +
                        $"{assessment.Origin.RoomName} para {assessment.Destination.RoomName} " +
                        $"em {assessment.Destination.StartsAt:dd/MM/yyyy HH:mm}.",
                        "Occupation", occupation.Id);
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return Results.Ok(new { occupation.Id, occupation.RoomId, occupation.StartsAt, occupation.EndsAt });
            }
            catch (SqlException error) when (error.Number is 1205 or 3960 or 1222)
            {
                return Results.Conflict(new ApiError("A disponibilidade mudou durante a confirmação. Atualize o cronograma e tente novamente"));
            }
            catch (DbUpdateConcurrencyException)
            {
                return Results.Conflict(new ApiError("A ocupação foi alterada durante a confirmação. Consulte a prévia novamente"));
            }
        }).RequireAuthorization("Admin");
    }

    private static async Task<OccupationMovePreview> AssessMove(AppDbContext db,
        RoomOccupation occupation, OccupationMovePreviewInput input)
    {
        var blocks = new List<string>();
        var warnings = new List<string>();
        var technicalFindings = new List<RequirementFinding>();
        var technicalClassification = "Unknown";
        var sourceRoom = await db.Rooms.AsNoTracking().FirstOrDefaultAsync(r => r.Id == occupation.RoomId);
        var sourceShift = await db.Shifts.AsNoTracking().FirstOrDefaultAsync(s =>
            s.StartsAt == TimeOnly.FromDateTime(occupation.StartsAt) &&
            s.EndsAt == TimeOnly.FromDateTime(occupation.EndsAt));
        var origin = new OccupationMoveSlot(occupation.RoomId, sourceRoom?.Name ?? "Ambiente não encontrado",
            DateOnly.FromDateTime(occupation.StartsAt), sourceShift?.Id, sourceShift?.Name,
            occupation.StartsAt, occupation.EndsAt);
        var room = await RoomQuery(db).FirstOrDefaultAsync(r => r.Id == input.RoomId);
        var shift = await db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.Id == input.ShiftId);
        if (room is null) blocks.Add("Ambiente de destino não encontrado");
        else if (!room.Active) blocks.Add("Ambiente de destino inativo");
        if (shift is null) blocks.Add("Turno de destino não encontrado");
        if (input.Date == DateOnly.MinValue) blocks.Add("Data de destino inválida");
        if (sourceShift is null) blocks.Add("A ocupação original não corresponde a um turno cadastrado");
        if (occupation.Kind == OccupationKind.Bloqueio) blocks.Add("Bloqueios não podem ser remanejados");
        var startsAt = shift is null ? occupation.StartsAt : input.Date.ToDateTime(shift.StartsAt);
        var endsAt = shift is null ? occupation.EndsAt : input.Date.ToDateTime(shift.EndsAt);
        var destination = new OccupationMoveSlot(input.RoomId, room?.Name ?? "Ambiente não encontrado",
            input.Date, shift?.Id, shift?.Name, startsAt, endsAt);
        if (occupation.RoomId == input.RoomId && occupation.StartsAt == startsAt && occupation.EndsAt == endsAt)
            blocks.Add("A origem e o destino são iguais");
        var changesTime = occupation.StartsAt != startsAt || occupation.EndsAt != endsAt;
        if (await db.Loans.AsNoTracking().AnyAsync(l => l.RoomOccupationId == occupation.Id &&
            l.Status != LoanStatus.Rejeitado))
            blocks.Add("A ocupação possui empréstimo ativo ou pendente; resolva o empréstimo antes do remanejamento");

        BookingRequest? booking = null;
        WeeklyClass? weekly = null;
        if (occupation.BookingRequestId is int bookingId)
        {
            booking = await db.Bookings.AsNoTracking().Include(b => b.Software)
                .FirstOrDefaultAsync(b => b.Id == bookingId);
            if (booking is null || booking.Status != BookingStatus.Aprovada)
                blocks.Add("A reserva vinculada não está aprovada ou não foi encontrada");
            if (booking is not null && (booking.TeacherId != occupation.TeacherId ||
                booking.ClassGroupId != occupation.ClassGroupId))
                blocks.Add("Os vínculos da ocupação não correspondem à reserva original");
            if (booking?.CurricularCapabilityId is not null &&
                (booking.CurricularUnitId is null || booking.ClassGroupId is null))
                blocks.Add("A reserva pedagógica não possui vínculos suficientes para validar o remanejamento");
            if (booking is not null && booking.Recurrence != BookingRecurrence.Nenhuma)
                warnings.Add("Somente esta ocorrência será movida; as demais datas da reserva recorrente permanecem iguais");
            if (booking is not null)
                warnings.Add("A solicitação original permanece no histórico; a ocupação efetiva passa a usar o destino informado");
            if (changesTime && booking?.RecurringEadWeekday == (int)input.Date.DayOfWeek)
                blocks.Add("A solicitação marca o dia de destino como EAD; altere a programação antes de mover a aula");
        }
        if (occupation.WeeklyClassId is int weeklyId)
        {
            weekly = await db.WeeklyClasses.AsNoTracking().Include(w => w.Schedule)
                .Include(w => w.Assignment).ThenInclude(a => a.ClassGroup)
                .Include(w => w.Assignment).ThenInclude(a => a.Software)
                .FirstOrDefaultAsync(w => w.Id == weeklyId);
            if (weekly?.Schedule.Status != ScheduleStatus.Publicada)
                blocks.Add("A aula vinculada não pertence a uma grade publicada");
            if (weekly is not null && (weekly.Assignment.TeacherId != occupation.TeacherId ||
                weekly.Assignment.ClassGroupId != occupation.ClassGroupId))
                blocks.Add("Os vínculos da ocupação não correspondem à aula publicada");
            if (changesTime) blocks.Add("Data e turno de aula publicada exigem alteração da programação; mova apenas o ambiente");
            warnings.Add("O modelo da grade publicada permanece inalterado; somente esta ocorrência será movida");
        }

        ClassGroup? classGroup = null;
        if (occupation.ClassGroupId is int classId)
        {
            classGroup = await db.Classes.AsNoTracking().Include(c => c.Semester)
                .FirstOrDefaultAsync(c => c.Id == classId);
            if (classGroup is null) blocks.Add("Turma vinculada não encontrada");
            else
            {
                if (input.Date < classGroup.Semester.StartDate || input.Date > classGroup.Semester.EndDate)
                    blocks.Add("Data fora do semestre da turma");
                if (changesTime && booking?.CurricularUnitId is not int && weekly is null)
                    blocks.Add("A programação da turma não está vinculada a uma UC; mova apenas o ambiente");
                if (changesTime && booking?.CurricularUnitId is int assignedUnitId && shift is not null &&
                    !await db.Assignments.AsNoTracking().AnyAsync(a => a.TeacherId == occupation.TeacherId &&
                        a.ClassGroupId == classId && a.CurricularUnitId == assignedUnitId &&
                        a.EndedAtUtc == null && a.Weekday == (int)input.Date.DayOfWeek &&
                        a.PreferredShiftId == shift.Id))
                    blocks.Add("Data e turno não correspondem à atribuição pedagógica ativa");
                if (changesTime && input.Date >= classGroup.Semester.StartDate &&
                    input.Date <= classGroup.Semester.EndDate)
                {
                    var events = await EventsFor(db, classGroup.SemesterId, input.Date, input.Date);
                    var exceptions = await ExceptionsFor(db, classId, input.Date, input.Date);
                    var calendar = AcademicCalendarRules.Preview(classGroup.Semester, input.Date,
                        input.Date, 1 << (int)input.Date.DayOfWeek, classGroup, events, exceptions).Dates[0];
                    if (!calendar.CountsAsPresential)
                        blocks.Add($"Calendário da turma impede aula presencial: {calendar.Reason}");
                }
            }
        }
        else if (changesTime)
            warnings.Add("Sem turma vinculada, não há calendário pedagógico para validar esta data");

        if (room is not null)
        {
            if (booking?.CurricularCapabilityId is int capabilityId)
            {
                var requirement = await RequirementQuery(db).FirstOrDefaultAsync(r => r.CurricularCapabilityId == capabilityId);
                var technical = EnvironmentCompatibility.Evaluate(requirement, room, booking.Students, input.Date);
                technicalClassification = technical.Classification;
                technicalFindings.AddRange(technical.Findings);
                if (technical.Classification != "Compatible")
                    blocks.Add("Compatibilidade técnica do ambiente de destino não comprovada");
            }
            else
            {
                RoomNeed? need = booking is not null ? Need(booking) :
                    weekly is not null ? Need(weekly.Assignment) :
                    classGroup is not null ? new RoomNeed(Math.Max(1, classGroup.Students), false,
                        false, false, HardwareTier.Basico, Array.Empty<int>(), 0, false) : null;
                if (need is not null)
                {
                    var mismatch = RoomCompatibility.Incompatibility(room, need);
                    if (mismatch is not null) blocks.Add($"Ambiente inadequado: {mismatch}");
                }
                warnings.Add("Requisitos técnicos detalhados não comprovados para esta ocupação");
            }
            if (shift is not null && input.Date != DateOnly.MinValue)
            {
                var conflict = await ReservationRules.ConflictAsync(db, room.Id, startsAt, endsAt,
                    occupation.TeacherId, occupation.ClassGroupId, exceptOccupationId: occupation.Id);
                if (conflict is not null)
                {
                    blocks.Add(conflict);
                    var roomOccupant = await db.Occupations.AsNoTracking().FirstOrDefaultAsync(o =>
                        o.Id != occupation.Id && o.CancelledAtUtc == null && o.RoomId == room.Id &&
                        o.StartsAt < endsAt && startsAt < o.EndsAt);
                    if (roomOccupant is not null)
                    {
                        var approvedLoan = await db.Loans.AsNoTracking().Include(l => l.BookingRequest)
                            .FirstOrDefaultAsync(l => l.RoomOccupationId == roomOccupant.Id &&
                                l.Status == LoanStatus.Aprovado);
                        var teacherId = approvedLoan?.BorrowerId ?? roomOccupant.TeacherId;
                        var occupantClassId = approvedLoan?.BookingRequest.ClassGroupId ?? roomOccupant.ClassGroupId;
                        var teacherName = teacherId is null ? null : await db.Users.AsNoTracking()
                            .Where(u => u.Id == teacherId).Select(u => u.DisplayName).FirstOrDefaultAsync();
                        var className = occupantClassId is null ? null : await db.Classes.AsNoTracking()
                            .Where(c => c.Id == occupantClassId).Select(c => c.Name).FirstOrDefaultAsync();
                        blocks.Add($"Ocupante do ambiente: {teacherName ?? "professor não informado"}; " +
                            $"turma: {className ?? "não informada"}");
                    }
                }
            }
        }
        if (changesTime && occupation.DayStatus != ClassDayStatus.Letivo)
            blocks.Add("A ocupação está marcada como EAD ou não letiva; altere a programação antes de mudar data ou turno");
        if (!changesTime && occupation.DayStatus != ClassDayStatus.Letivo)
            warnings.Add("A situação EAD ou não letiva da ocupação permanece inalterada; ela não libera a sala");
        return new OccupationMovePreview(occupation.Id, origin, destination, blocks.Count == 0,
            blocks, warnings, technicalClassification, technicalFindings, [occupation.Id]);
    }
}
