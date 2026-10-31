using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private sealed record BlockMoveMeeting(RoomOccupation Occupation,
        CurricularCapability Capability, int FromRoomId, DateTime FromStartsAt,
        DateTime FromEndsAt, OccupationMoveSlot Destination);
    private sealed record BlockMoveAssessment(SemesterPlan Plan, TeachingAssignment Assignment,
        IReadOnlyList<PlanProposal> Proposals, IReadOnlyList<CurricularCapability> Capabilities,
        IReadOnlyList<BlockMoveMeeting> Meetings, IReadOnlyDictionary<int, string> RoomNames,
        OccupationBlockMovePreview Preview);

    private static void MapOccupationMoves(RouteGroupBuilder api)
    {
        api.MapPost("/{id:int}/block-move-preview", async (int id,
            OccupationBlockMoveInput input, AppDbContext db) =>
        {
            var assessment = await AssessBlockMove(db, id, input, track: false);
            return assessment is null ? Results.NotFound() : Results.Ok(assessment.Preview);
        }).RequireAuthorization("Admin");

        api.MapPost("/{id:int}/block-move", async (int id,
            OccupationBlockMoveConfirmInput input, ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!input.Confirm || input.Reason?.Length > 500)
                return Error("Confirme a movimentação do bloco e informe um motivo de até 500 caracteres");
            if (string.IsNullOrWhiteSpace(input.ExpectedSignature))
                return Error("Consulte novamente a prévia do bloco antes de confirmar");
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
                var assessment = await AssessBlockMove(db, id,
                    new OccupationBlockMoveInput(input.RoomId, input.StartDate), track: true);
                if (assessment is null) return Results.NotFound();
                if (assessment.Preview.Signature != input.ExpectedSignature)
                    return Results.Conflict(new ApiError("O bloco ou os dados utilizados na prévia mudaram. Consulte novamente"));
                if (!assessment.Preview.Allowed)
                    return Results.Conflict(new { Error = "A movimentação do bloco foi bloqueada", assessment.Preview.Blocks });

                var changed = assessment.Meetings.Where(m => m.Occupation.RoomId != input.RoomId ||
                    m.Occupation.StartsAt != m.Destination.StartsAt ||
                    m.Occupation.EndsAt != m.Destination.EndsAt).ToArray();
                if (changed.Length == 0)
                    return Results.Conflict(new ApiError("O bloco já está na distribuição consultada"));

                var before = assessment.Proposals.Select(p => new
                {
                    p.Id, p.CurricularCapabilityId, p.RoomId, p.StartDate, p.EndDate
                }).ToArray();
                foreach (var meeting in changed)
                {
                    var occupation = meeting.Occupation;
                    var originRoom = assessment.RoomNames.GetValueOrDefault(occupation.RoomId, "Ambiente não identificado");
                    occupation.RoomId = input.RoomId;
                    occupation.StartsAt = meeting.Destination.StartsAt;
                    occupation.EndsAt = meeting.Destination.EndsAt;
                    occupation.ChangedById = UserId(current);
                    db.OccupationChanges.Add(new OccupationChange
                    {
                        RoomOccupationId = occupation.Id,
                        ChangedById = UserId(current),
                        Action = "BlocoRemanejado",
                        FromRoomId = meeting.FromRoomId,
                        FromStartsAt = meeting.FromStartsAt,
                        FromEndsAt = meeting.FromEndsAt,
                        ToRoomId = input.RoomId,
                        ToStartsAt = meeting.Destination.StartsAt,
                        ToEndsAt = meeting.Destination.EndsAt,
                        Details = $"Bloco {assessment.Preview.AssignmentId}; capacidade {meeting.Capability.Description}; " +
                            $"{originRoom} ({meeting.FromStartsAt:dd/MM/yyyy HH:mm}) -> " +
                            $"{assessment.Preview.DestinationRoomName} ({meeting.Destination.StartsAt:dd/MM/yyyy HH:mm})" +
                            (string.IsNullOrWhiteSpace(input.Reason) ? "" : $"; motivo: {input.Reason.Trim()}")
                    });
                }
                foreach (var proposal in assessment.Proposals)
                {
                    var dates = assessment.Meetings.Where(m => m.Occupation.PlanProposalId == proposal.Id)
                        .Select(m => DateOnly.FromDateTime(m.Destination.StartsAt)).Order().ToArray();
                    proposal.RoomId = input.RoomId;
                    proposal.StartDate = dates[0];
                    proposal.EndDate = dates[^1];
                }
                assessment.Plan.Revision++;
                var after = assessment.Proposals.Select(p => new
                {
                    p.Id, p.CurricularCapabilityId, p.RoomId, p.StartDate, p.EndDate
                }).ToArray();
                AuditTrail.Add(db, "SemesterPlan", assessment.Plan.Id.ToString(), "BlocoRemanejado",
                    UserId(current), new { Revision = assessment.Plan.Revision - 1, Proposals = before },
                    new { assessment.Plan.Revision, Proposals = after }, input.Reason);
                AuditTrail.Notify(db, assessment.Assignment.TeacherId, UserId(current),
                    "Bloco pedagógico remanejado",
                    $"O bloco da UC {assessment.Preview.CurricularUnitName} para a turma " +
                    $"{assessment.Preview.ClassGroupName} foi movido para {assessment.Preview.DestinationRoomName}, " +
                    $"a partir de {assessment.Preview.Capabilities.First().NewDates.First():dd/MM/yyyy}. " +
                    $"{changed.Length} encontro(s) foram atualizados.", "SemesterPlan", assessment.Plan.Id);
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return Results.Ok(new { assessment.Plan.Id, assessment.Preview.AssignmentId,
                    MovedMeetings = changed.Length, assessment.Plan.Revision });
            }
            catch (SqlException error) when (error.Number is 1205 or 3960 or 1222 or 2601 or 2627)
            {
                return Results.Conflict(new ApiError("Os dados mudaram durante a confirmação. Consulte a prévia novamente"));
            }
            catch (DbUpdateConcurrencyException)
            {
                return Results.Conflict(new ApiError("O bloco foi alterado durante a confirmação. Consulte a prévia novamente"));
            }
            catch (DbUpdateException error) when (error.InnerException is SqlException sql &&
                sql.Number is 1205 or 3960 or 1222 or 2601 or 2627)
            {
                return Results.Conflict(new ApiError("A disponibilidade ou os dados mudaram durante a confirmação. Consulte a prévia novamente"));
            }
        }).RequireAuthorization("Admin");

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

    private static async Task<BlockMoveAssessment?> AssessBlockMove(AppDbContext db,
        int occupationId, OccupationBlockMoveInput input, bool track)
    {
        IQueryable<RoomOccupation> occupationQuery = db.Occupations;
        if (!track) occupationQuery = occupationQuery.AsNoTracking();
        var anchor = await occupationQuery.FirstOrDefaultAsync(o => o.Id == occupationId &&
            o.CancelledAtUtc == null);
        if (anchor is null || anchor.PlanProposalId is not int anchorProposalId) return null;

        IQueryable<PlanProposal> anchorQuery = db.PlanProposals
            .Include(p => p.SemesterPlan).ThenInclude(p => p.Semester)
            .Include(p => p.Assignment).ThenInclude(a => a.ClassGroup).ThenInclude(c => c.Course)
            .Include(p => p.Assignment).ThenInclude(a => a.ClassGroup).ThenInclude(c => c.Semester)
            .Include(p => p.Assignment).ThenInclude(a => a.Teacher)
            .Include(p => p.Assignment).ThenInclude(a => a.CurricularUnit)
                .ThenInclude(u => u!.CourseModule).ThenInclude(m => m.Course)
            .Include(p => p.Shift);
        if (!track) anchorQuery = anchorQuery.AsNoTracking();
        var anchorProposal = await anchorQuery.FirstOrDefaultAsync(p => p.Id == anchorProposalId);
        if (anchorProposal is null) return null;

        var plan = anchorProposal.SemesterPlan;
        var assignment = anchorProposal.Assignment;
        var classGroup = assignment.ClassGroup;
        var unit = assignment.CurricularUnit;
        var semester = plan.Semester;
        var blocks = new List<string>();
        var warnings = new List<string>();
        if (!plan.Published || anchorProposal.Status != PlanProposalStatus.Publicada)
            blocks.Add("A ocupação não pertence a uma proposta de planejamento publicada");
        if (assignment.EndedAtUtc is not null || unit is null || assignment.Weekday is not int ||
            assignment.PreferredShiftId is not int preferredShiftId)
            blocks.Add("A atribuição ativa não contém UC, dia da semana e turno identificáveis");
        if (classGroup.SemesterId != plan.SemesterId || unit is not null && classGroup.CourseId != unit.CourseModule.CourseId)
            blocks.Add("Os vínculos de turma, curso, UC e semestre da oferta são inconsistentes");
        var allCapabilities = unit is null ? [] : await db.CurricularCapabilities.AsNoTracking()
            .Where(c => c.CurricularUnitId == unit.Id).OrderBy(c => c.Order).ThenBy(c => c.Id).ToListAsync();
        var offerAssignments = unit is null ? [] : await db.Assignments
            .Where(a => a.EndedAtUtc == null && a.ClassGroupId == classGroup.Id &&
                a.TeacherId == assignment.TeacherId && a.CurricularUnitId == unit.Id &&
                a.PreferredShiftId == assignment.PreferredShiftId)
            .OrderBy(a => a.Weekday).ThenBy(a => a.Id).ToListAsync();
        if (offerAssignments.Count == 0 || offerAssignments.Any(a => a.Weekday is not int day || day is < 0 or > 6) ||
            offerAssignments.Select(a => a.Weekday).Distinct().Count() != offerAssignments.Count)
            blocks.Add("Os dias semanais da oferta não podem ser determinados sem ambiguidade");
        var assignmentIds = offerAssignments.Select(a => a.Id).ToArray();
        IQueryable<PlanProposal> proposalsQuery = db.PlanProposals
            .Include(p => p.CurricularCapability).Include(p => p.Shift).Include(p => p.Assignment)
            .Where(p => p.SemesterPlanId == plan.Id && assignmentIds.Contains(p.AssignmentId))
            .OrderBy(p => p.CurricularCapability == null ? int.MaxValue : p.CurricularCapability.Order)
            .ThenBy(p => p.Assignment.Weekday).ThenBy(p => p.Id);
        if (!track) proposalsQuery = proposalsQuery.AsNoTracking();
        var proposals = await proposalsQuery.ToListAsync();
        var expectedProposalCount = allCapabilities.Count * offerAssignments.Count;
        if (unit is null || allCapabilities.Count == 0 || proposals.Count != expectedProposalCount ||
            proposals.Any(p => p.Status != PlanProposalStatus.Publicada ||
                p.CurricularCapabilityId is null || p.CurricularCapability?.CurricularUnitId != unit.Id ||
                !assignmentIds.Contains(p.AssignmentId)) ||
            proposals.GroupBy(p => (p.AssignmentId, p.CurricularCapabilityId)).Any(g => g.Count() != 1) ||
            offerAssignments.Any(a => allCapabilities.Any(c => proposals.Count(p =>
                p.AssignmentId == a.Id && p.CurricularCapabilityId == c.Id) != 1)))
            blocks.Add("Não é possível comprovar uma proposta publicada única para cada capacidade e dia da mesma oferta");

        var proposalIds = proposals.Select(p => p.Id).ToArray();
        var allRowsQuery = db.Occupations.Where(o => proposalIds.Contains(o.PlanProposalId!.Value));
        if (!track) allRowsQuery = allRowsQuery.AsNoTracking();
        var allRows = proposalIds.Length == 0 ? [] : await allRowsQuery.OrderBy(o => o.StartsAt)
            .ThenBy(o => o.Id).ToListAsync();
        var sourceOccupations = allRows.Where(o => o.CancelledAtUtc is null).ToArray();
        if (allRows.Any(o => o.CancelledAtUtc is not null))
            blocks.Add("Uma ocorrência do bloco foi cancelada; a composição não está completa");
        if (sourceOccupations.Any(o => o.Kind != OccupationKind.Aula || o.TeacherId != assignment.TeacherId ||
            o.ClassGroupId != assignment.ClassGroupId || o.DayStatus != ClassDayStatus.Letivo))
            blocks.Add("As ocupações não correspondem à mesma oferta letiva em situação presencial");

        var shift = await db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.Id == assignment.PreferredShiftId);
        if (shift is null || shift.EndsAt <= shift.StartsAt || anchorProposal.ShiftId != shift.Id ||
            proposals.Any(p => p.ShiftId != shift.Id || p.Assignment.PreferredShiftId != shift.Id ||
                p.Assignment.Weekday is not int day || day is < 0 or > 6))
            blocks.Add("O turno da atribuição e das propostas não é único ou não possui duração válida");
        var hoursPerShift = shift is null ? 0m :
            (decimal)(shift.EndsAt.ToTimeSpan() - shift.StartsAt.ToTimeSpan()).TotalHours;
        var requirements = new Dictionary<int, int>();
        if (shift is not null && unit is not null)
        {
            foreach (var capability in allCapabilities)
            {
                try
                {
                    requirements[capability.Id] = PedagogicalCatalogRules.EstimateMeetings(
                        capability.RequiredHours, hoursPerShift);
                }
                catch (ArgumentOutOfRangeException)
                {
                    blocks.Add($"A carga horária da capacidade {capability.Description} não permite estimar encontros");
                }
            }
        }
        foreach (var proposal in proposals)
        {
            if (proposal.StartDate < semester.StartDate || proposal.EndDate > semester.EndDate ||
                proposal.StartDate > proposal.EndDate || proposal.EndDate.DayNumber - proposal.StartDate.DayNumber > 370)
            {
                blocks.Add($"O intervalo publicado da capacidade {proposal.CurricularCapability?.Description ?? proposal.Id.ToString()} é inválido");
                continue;
            }
            var meetings = sourceOccupations.Where(o => o.PlanProposalId == proposal.Id)
                .OrderBy(o => o.StartsAt).ThenBy(o => o.Id).ToArray();
            if (proposal.CurricularCapabilityId is not int capabilityId ||
                !requirements.ContainsKey(capabilityId)) continue;
            if (meetings.Length == 0 || DateOnly.FromDateTime(meetings[0].StartsAt) != proposal.StartDate ||
                DateOnly.FromDateTime(meetings[^1].StartsAt) != proposal.EndDate)
                blocks.Add($"As datas efetivas da capacidade {proposal.CurricularCapability?.Description} divergem do planejamento publicado");
            if (meetings.Any(o => o.StartsAt.TimeOfDay != shift!.StartsAt.ToTimeSpan() ||
                o.EndsAt.TimeOfDay != shift.EndsAt.ToTimeSpan() ||
                (int)DateOnly.FromDateTime(o.StartsAt).DayOfWeek != proposal.Assignment.Weekday))
                blocks.Add($"As ocorrências da capacidade {proposal.CurricularCapability?.Description} não respeitam o dia e turno publicados");
            if (meetings.Length > 0 && shift is not null && proposal.Assignment.Weekday is int sourceWeekday)
            {
                var sourceDates = AcademicCalendarRules.Preview(semester, proposal.StartDate,
                    proposal.EndDate, 1 << sourceWeekday, classGroup,
                    await EventsFor(db, semester.Id, proposal.StartDate, proposal.EndDate),
                    await ExceptionsFor(db, classGroup.Id, proposal.StartDate, proposal.EndDate))
                    .Dates.Where(d => d.CountsAsPresential).Select(d => d.Date).ToArray();
                if (!sourceDates.SequenceEqual(meetings.Select(o => DateOnly.FromDateTime(o.StartsAt))))
                    blocks.Add($"A sequência efetiva da capacidade {proposal.CurricularCapability?.Description} não corresponde às datas letivas publicadas");
            }
        }
        foreach (var capability in allCapabilities)
        {
            var actualCount = proposals.Where(p => p.CurricularCapabilityId == capability.Id)
                .Sum(p => sourceOccupations.Count(o => o.PlanProposalId == p.Id));
            if (actualCount != requirements.GetValueOrDefault(capability.Id))
                blocks.Add($"A capacidade {capability.Description} tem {actualCount} encontro(s) efetivo(s), mas a CH requer {requirements.GetValueOrDefault(capability.Id)}; a sequência é indeterminada");
        }
        var orderedCapabilities = allCapabilities.OrderBy(c => c.Order).ThenBy(c => c.Id).ToArray();
        for (var index = 1; index < orderedCapabilities.Length; index++)
        {
            var previousDates = sourceOccupations.Where(o => proposals.Any(p => p.Id == o.PlanProposalId &&
                p.CurricularCapabilityId == orderedCapabilities[index - 1].Id)).Select(o => o.StartsAt).ToArray();
            var nextDates = sourceOccupations.Where(o => proposals.Any(p => p.Id == o.PlanProposalId &&
                p.CurricularCapabilityId == orderedCapabilities[index].Id)).Select(o => o.StartsAt).ToArray();
            if (previousDates.Length == 0 || nextDates.Length == 0 || previousDates.Max() >= nextDates.Min())
                blocks.Add("As capacidades publicadas não estão em uma sequência pedagógica sem sobreposição");
        }

        var occupiedIds = sourceOccupations.Select(o => o.Id).Order().ToArray();
        if (occupiedIds.Length > 0 && await db.Loans.AnyAsync(l => occupiedIds.Contains(l.RoomOccupationId) &&
            l.Status != LoanStatus.Rejeitado))
            blocks.Add("O bloco possui empréstimo ativo ou pendente; resolva-o antes da movimentação");

        var destinationRoom = await RoomQuery(db).FirstOrDefaultAsync(r => r.Id == input.RoomId);
        if (destinationRoom is null) blocks.Add("Ambiente de destino não encontrado");
        else if (!destinationRoom.Active) blocks.Add("Ambiente de destino inativo");
        if (input.RoomId <= 0) blocks.Add("Ambiente de destino inválido");

        var calendarDates = new Dictionary<DateOnly, CalendarDateResult>();
        if (input.StartDate < semester.StartDate || input.StartDate > semester.EndDate)
            blocks.Add("Data inicial fora do semestre da oferta");
        else if (!offerAssignments.Any(a => a.Weekday == (int)input.StartDate.DayOfWeek))
            blocks.Add("A data inicial deve coincidir com um dia da semana da oferta");
        else if (semester.EndDate.DayNumber - input.StartDate.DayNumber > 370)
            blocks.Add("O período restante excede o limite de consulta do calendário; escolha uma data mais próxima");
        else if (offerAssignments.Count > 0 && offerAssignments.All(a => a.Weekday is >= 0 and <= 6))
        {
            var events = await EventsFor(db, semester.Id, input.StartDate, semester.EndDate);
            var exceptions = await ExceptionsFor(db, classGroup.Id, input.StartDate, semester.EndDate);
            var weekdaysMask = offerAssignments.Aggregate(0, (mask, item) => mask | (1 << item.Weekday!.Value));
            calendarDates = AcademicCalendarRules.Preview(semester, input.StartDate, semester.EndDate,
                weekdaysMask, classGroup, events, exceptions).Dates.ToDictionary(d => d.Date);
            if (calendarDates.TryGetValue(input.StartDate, out var startCalendar) && !startCalendar.CountsAsPresential)
                warnings.Add($"A data inicial não é elegível para aula presencial ({startCalendar.Reason}); o bloco começa no próximo encontro elegível");
        }
        var operatingShift = destinationRoom is null || shift is null ? null :
            await db.RoomOperatingShifts.AsNoTracking().FirstOrDefaultAsync(x =>
                x.SemesterId == semester.Id && x.RoomId == destinationRoom.Id && x.ShiftId == shift.Id);
        if (operatingShift is null)
            blocks.Add("Turno não configurado como oferecido pelo ambiente no semestre");
        else if (offerAssignments.Any(a => a.Weekday is int offeredWeekday &&
            (operatingShift.WeekdaysMask & (1 << offeredWeekday)) == 0))
            blocks.Add("O ambiente não oferece o turno em todos os dias da oferta");

        var destinationDates = new Dictionary<int, List<DateOnly>>();
        var destinationDatesByProposal = new Dictionary<int, List<DateOnly>>();
        var canEnumerate = input.StartDate >= semester.StartDate && input.StartDate <= semester.EndDate &&
            offerAssignments.Any(a => a.Weekday == (int)input.StartDate.DayOfWeek) &&
            semester.EndDate.DayNumber - input.StartDate.DayNumber <= 370 && calendarDates.Count > 0;
        var cursor = input.StartDate;
        foreach (var capability in orderedCapabilities)
        {
            var capabilityProposals = proposals.Where(p => p.CurricularCapabilityId == capability.Id)
                .OrderBy(p => p.Assignment.Weekday).ThenBy(p => p.Id).ToArray();
            var remaining = capabilityProposals.ToDictionary(p => p.Id,
                p => sourceOccupations.Count(o => o.PlanProposalId == p.Id));
            var dates = new List<DateOnly>();
            while (canEnumerate && remaining.Values.Sum() > 0 && cursor <= semester.EndDate)
            {
                if (calendarDates.TryGetValue(cursor, out var calendar) && calendar.CountsAsPresential)
                {
                    var proposal = capabilityProposals.FirstOrDefault(p => p.Assignment.Weekday == (int)cursor.DayOfWeek &&
                        remaining.GetValueOrDefault(p.Id) > 0);
                    if (proposal is not null)
                    {
                        dates.Add(cursor);
                        if (!destinationDatesByProposal.TryGetValue(proposal.Id, out var proposalDates))
                            destinationDatesByProposal[proposal.Id] = proposalDates = [];
                        proposalDates.Add(cursor);
                        remaining[proposal.Id]--;
                    }
                }
                cursor = cursor.AddDays(1);
            }
            destinationDates[capability.Id] = dates;
            if (remaining.Values.Any(count => count > 0))
                blocks.Add($"Fim do semestre: {remaining.Values.Sum()} encontro(s) da capacidade {capability.Description} não cabem na sequência");
        }

        var sourceRoomIds = sourceOccupations.Select(o => o.RoomId).Distinct().ToArray();
        var roomNames = await db.Rooms.AsNoTracking().Where(r => sourceRoomIds.Contains(r.Id) ||
                destinationRoom != null && r.Id == destinationRoom.Id)
            .ToDictionaryAsync(r => r.Id, r => r.Name);
        var meetingsToAssess = new List<BlockMoveMeeting>();
        var capabilityPreviews = new List<BlockCapabilityMovePreview>();
        var affected = sourceOccupations.Select(o => o.Id).Order().ToArray();
        var technicalByCapability = new Dictionary<int, List<RequirementFinding>>();
        var moveWarnings = new List<string>();
        if (destinationRoom is not null && shift is not null && assignment.PreferredShiftId is int shiftId)
        {
            foreach (var proposal in proposals.OrderBy(p => p.CurricularCapability!.Order)
                .ThenBy(p => p.Assignment.Weekday).ThenBy(p => p.Id))
            {
                if (proposal.CurricularCapability is not { } capability) continue;
                var origins = sourceOccupations.Where(o => o.PlanProposalId == proposal.Id)
                    .OrderBy(o => o.StartsAt).ThenBy(o => o.Id).ToArray();
                var dates = destinationDatesByProposal.GetValueOrDefault(proposal.Id) ?? [];
                if (origins.Length != dates.Count)
                {
                    blocks.Add($"A capacidade {capability.Description} não manteve a quantidade de encontros para o dia {proposal.Assignment.Weekday}");
                    continue;
                }
                var findings = new List<RequirementFinding>();
                for (var index = 0; index < origins.Length; index++)
                {
                    var origin = origins[index];
                    var move = await AssessMove(db, origin,
                        new OccupationMovePreviewInput(destinationRoom.Id, dates[index], shiftId),
                        occupiedIds, allowUnchanged: true);
                    blocks.AddRange(move.Blocks.Select(b => $"{capability.Description}, {dates[index]:dd/MM/yyyy}: {b}"));
                    moveWarnings.AddRange(move.Warnings.Select(w => $"{capability.Description}: {w}"));
                    findings.AddRange(move.TechnicalFindings);
                    meetingsToAssess.Add(new BlockMoveMeeting(origin, capability, origin.RoomId,
                        origin.StartsAt, origin.EndsAt, move.Destination));
                }
                technicalByCapability[capability.Id] = findings.DistinctBy(f => (f.Requirement, f.Status, f.Detail)).ToList();
            }
        }
        foreach (var capability in allCapabilities)
        {
            var capabilityProposals = proposals.Where(p => p.CurricularCapabilityId == capability.Id).ToArray();
            var proposalIdsForCapability = capabilityProposals.Select(p => p.Id).ToArray();
            var origins = sourceOccupations.Where(o => o.PlanProposalId is int proposalId &&
                    proposalIdsForCapability.Contains(proposalId))
                .OrderBy(o => o.StartsAt).ThenBy(o => o.Id).ToArray();
            var dates = destinationDates.GetValueOrDefault(capability.Id) ?? [];
            capabilityPreviews.Add(new BlockCapabilityMovePreview(capability.Id, capability.Description,
                capability.Order, capability.RequiredHours, requirements.GetValueOrDefault(capability.Id),
                requirements.GetValueOrDefault(capability.Id) * hoursPerShift,
                origins.Select(o => DateOnly.FromDateTime(o.StartsAt)).ToArray(), dates,
                origins.Select(o => o.RoomId).Distinct().ToArray(),
                technicalByCapability.GetValueOrDefault(capability.Id) ?? []));
        }
        warnings.AddRange(moveWarnings.Distinct());
        if (meetingsToAssess.Count == 0) blocks.Add("Não foi possível identificar todos os encontros do bloco");
        if (meetingsToAssess.Count == sourceOccupations.Length && meetingsToAssess.All(m =>
            m.Occupation.RoomId == destinationRoom?.Id && m.Occupation.StartsAt == m.Destination.StartsAt &&
            m.Occupation.EndsAt == m.Destination.EndsAt))
            blocks.Add("A sequência já está no ambiente e período solicitados");

        var basePreview = new OccupationBlockMovePreview(anchor.Id, plan.Id, assignment.Id,
            assignment.Teacher.DisplayName, classGroup.Name, classGroup.Course?.Name ?? "Curso não informado",
            unit?.CourseModule.Name ?? "Módulo não informado", unit?.Name ?? "UC não informada",
            shift?.Id ?? 0, shift?.Name ?? "Turno não identificado", input.RoomId,
            destinationRoom?.Name ?? "Ambiente não identificado", input.StartDate, blocks.Count == 0,
            blocks.Distinct().ToArray(), warnings.Distinct().ToArray(), capabilityPreviews,
            affected, "");
        var signature = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            JsonSerializer.Serialize(new
            {
                Preview = basePreview,
                plan.Revision,
                Sources = sourceOccupations.OrderBy(o => o.Id).Select(o => new
                {
                    o.Id, o.PlanProposalId, o.RoomId, o.StartsAt, o.EndsAt, o.DayStatus, o.ChangedById
                }),
                Proposals = proposals.OrderBy(p => p.Id).Select(p => new
                {
                    p.Id, p.AssignmentId, p.CurricularCapabilityId, p.RoomId,
                    p.ShiftId, p.StartDate, p.EndDate, p.Status
                })
            }))));
        var preview = basePreview with { Signature = signature };
        return new BlockMoveAssessment(plan, assignment, proposals, allCapabilities,
            meetingsToAssess, roomNames, preview);
    }

    private static async Task<OccupationMovePreview> AssessMove(AppDbContext db,
        RoomOccupation occupation, OccupationMovePreviewInput input,
        IReadOnlyCollection<int>? exceptOccupationIds = null, bool allowUnchanged = false)
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
        if (!allowUnchanged && occupation.RoomId == input.RoomId && occupation.StartsAt == startsAt && occupation.EndsAt == endsAt)
            blocks.Add("A origem e o destino são iguais");
        var changesTime = occupation.StartsAt != startsAt || occupation.EndsAt != endsAt;
        if (await db.Loans.AsNoTracking().AnyAsync(l => l.RoomOccupationId == occupation.Id &&
            l.Status != LoanStatus.Rejeitado))
            blocks.Add("A ocupação possui empréstimo ativo ou pendente; resolva o empréstimo antes do remanejamento");

        BookingRequest? booking = null;
        WeeklyClass? weekly = null;
        PlanProposal? planProposal = null;
        if (occupation.PlanProposalId is int planProposalId)
        {
            planProposal = await db.PlanProposals.AsNoTracking().Include(p => p.Assignment)
                .ThenInclude(a => a.ClassGroup).Include(p => p.Assignment)
                .ThenInclude(a => a.Software).FirstOrDefaultAsync(p => p.Id == planProposalId);
            if (planProposal is null || planProposal.Status != PlanProposalStatus.Publicada ||
                planProposal.Assignment.TeacherId != occupation.TeacherId ||
                planProposal.Assignment.ClassGroupId != occupation.ClassGroupId)
                blocks.Add("Vínculo com planejamento publicado inválido");
        }
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
                var assignmentUnitId = booking?.CurricularUnitId ?? planProposal?.Assignment.CurricularUnitId;
                if (changesTime && assignmentUnitId is null && weekly is null)
                    blocks.Add("A programação da turma não está vinculada a uma UC; mova apenas o ambiente");
                if (changesTime && assignmentUnitId is int assignedUnitId && shift is not null &&
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
            if ((booking?.CurricularCapabilityId ?? planProposal?.CurricularCapabilityId) is int capabilityId)
            {
                var requirement = await RequirementQuery(db).FirstOrDefaultAsync(r => r.CurricularCapabilityId == capabilityId);
                var technical = EnvironmentCompatibility.Evaluate(requirement, room,
                    booking?.Students ?? planProposal!.Assignment.ClassGroup.Students, input.Date);
                technicalClassification = technical.Classification;
                technicalFindings.AddRange(technical.Findings);
                if (technical.Classification != "Compatible")
                    blocks.Add("Compatibilidade técnica do ambiente de destino não comprovada");
            }
            else
            {
                RoomNeed? need = booking is not null ? Need(booking) :
                    weekly is not null ? Need(weekly.Assignment) :
                    planProposal is not null ? Need(planProposal.Assignment) :
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
                    occupation.TeacherId, occupation.ClassGroupId, exceptOccupationId: occupation.Id,
                    exceptOccupationIds: exceptOccupationIds);
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
