using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private sealed record ProposalInput(int AssignmentId, int? CurricularCapabilityId,
        int RoomId, int ShiftId, DateOnly StartDate, DateOnly EndDate);
    private sealed record ProposalDecision(string? Reason);
    private sealed record PublishPlanInput(bool Confirm, int ExpectedRevision, string ExpectedSignature);
    private sealed record PlanCheck(int ProposalId, DateTime StartsAt, DateTime EndsAt,
        int? ExistingOccupationId, IReadOnlyList<string> Blocks, IReadOnlyList<string> Warnings);
    private sealed record PlanPreview(bool Allowed, int Revision, int ProposalCount, int Approved,
        int ToCreate, int Existing, IReadOnlyList<string> Blocks,
        IReadOnlyList<string> Warnings, IReadOnlyList<PlanCheck> Checks, string Signature);

    private static void MapSemesterPlanning(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/semester-plans").RequireAuthorization().WithTags("Planejamento semestral");
        api.MapGet("", async (int? semesterId, ClaimsPrincipal current, AppDbContext db) =>
        {
            var admin = current.IsInRole("Admin");
            var me = UserId(current);
            return Results.Ok(await db.SemesterPlans.AsNoTracking()
                .Where(p => semesterId == null || p.SemesterId == semesterId)
                .Where(p => admin || p.Proposals.Any(x => x.Assignment.TeacherId == me) ||
                    db.Assignments.Any(a => a.TeacherId == me &&
                        a.ClassGroup.SemesterId == p.SemesterId && a.EndedAtUtc == null))
                .Select(p => new { p.Id, p.SemesterId, p.Published, p.Revision, p.CreatedAtUtc,
                    p.PublishedAtUtc, ProposalCount = admin ? p.Proposals.Count :
                        p.Proposals.Count(x => x.Assignment.TeacherId == me) }).ToListAsync());
        });
        api.MapPost("/{semesterId:int}", async (int semesterId, ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!await db.Semesters.AnyAsync(s => s.Id == semesterId)) return Results.NotFound();
            if (!current.IsInRole("Admin") && !await db.Assignments.AnyAsync(a =>
                a.ClassGroup.SemesterId == semesterId && a.TeacherId == UserId(current) &&
                a.EndedAtUtc == null && a.CurricularUnitId != null)) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var existing = await db.SemesterPlans.FirstOrDefaultAsync(p => p.SemesterId == semesterId);
            if (existing is not null) return Results.Ok(new { existing.Id, existing.SemesterId, existing.Published });
            var plan = new SemesterPlan { SemesterId = semesterId };
            db.SemesterPlans.Add(plan);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/semester-plans/{plan.Id}", new { plan.Id, plan.SemesterId, plan.Published });
        });
        api.MapGet("/{id:int}", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var plan = await PlanQuery(db).AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
            if (plan is null) return Results.NotFound();
            var admin = current.IsInRole("Admin");
            var me = UserId(current);
            if (!admin && !plan.Proposals.Any(p => p.Assignment.TeacherId == me) &&
                !await db.Assignments.AnyAsync(a => a.TeacherId == me &&
                    a.ClassGroup.SemesterId == plan.SemesterId && a.EndedAtUtc == null)) return Results.Forbid();
            return Results.Ok(new { plan.Id, plan.SemesterId, plan.Published, plan.Revision,
                plan.PublishedAtUtc, Proposals = plan.Proposals
                    .Where(p => admin || p.Assignment.TeacherId == me)
                    .OrderBy(p => p.Id).Select(p => new { p.Id, p.AssignmentId,
                        p.Assignment.TeacherId, p.Assignment.ClassGroupId, p.Assignment.CurricularUnitId,
                        p.CurricularCapabilityId, p.RoomId, RoomName = p.Room.Name,
                        p.ShiftId, ShiftName = p.Shift.Name, p.StartDate, p.EndDate,
                        p.Status, p.DecidedById, p.DecidedAtUtc, p.RejectionReason }) });
        });
        api.MapGet("/{id:int}/capabilities", async (int id, int assignmentId,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            var assignment = await db.Assignments.AsNoTracking().Include(a => a.ClassGroup)
                .FirstOrDefaultAsync(a => a.Id == assignmentId);
            if (assignment is null || !await db.SemesterPlans.AnyAsync(p => p.Id == id &&
                p.SemesterId == assignment.ClassGroup.SemesterId)) return Results.NotFound();
            if (!current.IsInRole("Admin") && assignment.TeacherId != UserId(current)) return Results.Forbid();
            return Results.Ok(await db.CurricularCapabilities.AsNoTracking()
                .Where(c => c.CurricularUnitId == assignment.CurricularUnitId)
                .OrderBy(c => c.Order).Select(c => new { c.Id, c.Description }).ToListAsync());
        });
        api.MapPost("/{id:int}/proposals", async (int id, ProposalInput input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var plan = await db.SemesterPlans.Include(p => p.Semester).FirstOrDefaultAsync(p => p.Id == id);
            if (plan is null) return Results.NotFound();
            if (plan.Published) return Results.Conflict(new ApiError("Planejamento já publicado"));
            if (!current.IsInRole("Admin") && !await db.Assignments.AnyAsync(a =>
                a.Id == input.AssignmentId && a.TeacherId == UserId(current))) return Results.Forbid();
            var error = await ProposalInputError(db, plan, input, current);
            if (error is not null) return Error(error);
            var proposal = new PlanProposal { SemesterPlanId = id, AssignmentId = input.AssignmentId,
                CurricularCapabilityId = input.CurricularCapabilityId, RoomId = input.RoomId,
                ShiftId = input.ShiftId, StartDate = input.StartDate, EndDate = input.EndDate,
                CreatedById = UserId(current) };
            db.PlanProposals.Add(proposal);
            plan.Revision++;
            await db.SaveChangesAsync();
            AuditTrail.Add(db, "PlanProposal", proposal.Id.ToString(), "Criada", UserId(current),
                null, new { proposal.AssignmentId, proposal.CurricularCapabilityId, proposal.RoomId,
                    proposal.ShiftId, proposal.StartDate, proposal.EndDate, proposal.Status });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/semester-plans/{id}", new { proposal.Id });
        });
        api.MapPut("/{id:int}/proposals/{proposalId:int}", async (int id, int proposalId,
            ProposalInput input, ClaimsPrincipal current, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var plan = await db.SemesterPlans.Include(p => p.Semester).FirstOrDefaultAsync(p => p.Id == id);
            var proposal = await db.PlanProposals.Include(p => p.Assignment)
                .FirstOrDefaultAsync(p => p.Id == proposalId && p.SemesterPlanId == id);
            if (plan is null || proposal is null) return Results.NotFound();
            if (!current.IsInRole("Admin") && proposal.Assignment.TeacherId != UserId(current)) return Results.Forbid();
            if (plan.Published || proposal.Status != PlanProposalStatus.Rascunho)
                return Results.Conflict(new ApiError("Somente rascunhos podem ser alterados"));
            var error = await ProposalInputError(db, plan, input, current);
            if (error is not null) return Error(error);
            var before = new { proposal.AssignmentId, proposal.CurricularCapabilityId, proposal.RoomId,
                proposal.ShiftId, proposal.StartDate, proposal.EndDate };
            proposal.AssignmentId = input.AssignmentId; proposal.CurricularCapabilityId = input.CurricularCapabilityId;
            proposal.RoomId = input.RoomId; proposal.ShiftId = input.ShiftId;
            proposal.StartDate = input.StartDate; proposal.EndDate = input.EndDate;
            plan.Revision++;
            AuditTrail.Add(db, "PlanProposal", proposal.Id.ToString(), "Alterada", UserId(current),
                before, input);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { proposal.Id, proposal.Status });
        });
        api.MapPost("/{id:int}/proposals/{proposalId:int}/submit", async
            (int id, int proposalId, ClaimsPrincipal current, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var proposal = await db.PlanProposals.Include(p => p.SemesterPlan).ThenInclude(p => p.Semester)
                .Include(p => p.Assignment).FirstOrDefaultAsync(p => p.Id == proposalId && p.SemesterPlanId == id);
            if (proposal is null) return Results.NotFound();
            if (!current.IsInRole("Admin") && proposal.Assignment.TeacherId != UserId(current)) return Results.Forbid();
            if (proposal.SemesterPlan.Published || proposal.Status != PlanProposalStatus.Rascunho)
                return Results.Conflict(new ApiError("Somente rascunhos podem ser enviados"));
            var input = new ProposalInput(proposal.AssignmentId, proposal.CurricularCapabilityId,
                proposal.RoomId, proposal.ShiftId, proposal.StartDate, proposal.EndDate);
            var error = await ProposalInputError(db, proposal.SemesterPlan, input, current);
            if (error is not null) return Error(error);
            proposal.Status = PlanProposalStatus.Enviada;
            proposal.SemesterPlan.Revision++;
            AuditTrail.Add(db, "PlanProposal", proposal.Id.ToString(), "Enviada", UserId(current),
                new { Status = PlanProposalStatus.Rascunho }, new { proposal.Status });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { proposal.Id, proposal.Status });
        });
        api.MapPost("/{id:int}/proposals/{proposalId:int}/revise", async
            (int id, int proposalId, ClaimsPrincipal current, AppDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var proposal = await db.PlanProposals.Include(p => p.SemesterPlan).ThenInclude(p => p.Semester)
                .Include(p => p.Assignment).FirstOrDefaultAsync(p => p.Id == proposalId && p.SemesterPlanId == id);
            if (proposal is null) return Results.NotFound();
            if (!current.IsInRole("Admin") && proposal.Assignment.TeacherId != UserId(current)) return Results.Forbid();
            if (proposal.SemesterPlan.Published || proposal.Status != PlanProposalStatus.Rejeitada)
                return Results.Conflict(new ApiError("Somente propostas rejeitadas podem voltar ao rascunho"));
            proposal.Status = PlanProposalStatus.Rascunho;
            proposal.RejectionReason = null;
            proposal.DecidedById = null;
            proposal.DecidedAtUtc = null;
            proposal.SemesterPlan.Revision++;
            AuditTrail.Add(db, "PlanProposal", proposal.Id.ToString(), "Reaberta", UserId(current),
                new { Status = PlanProposalStatus.Rejeitada }, new { proposal.Status });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { proposal.Id, proposal.Status });
        });
        api.MapPost("/{id:int}/proposals/{proposalId:int}/decision", async
            (int id, int proposalId, string decision, ProposalDecision input,
                ClaimsPrincipal current, AppDbContext db) =>
        {
            if (decision is not ("approve" or "reject")) return Results.NotFound();
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var proposal = await db.PlanProposals.Include(p => p.SemesterPlan).ThenInclude(p => p.Semester)
                .Include(p => p.Assignment).FirstOrDefaultAsync(p => p.Id == proposalId && p.SemesterPlanId == id);
            if (proposal is null) return Results.NotFound();
            if (proposal.SemesterPlan.Published || proposal.Status != PlanProposalStatus.Enviada)
                return Results.Conflict(new ApiError("Somente propostas enviadas podem ser decididas"));
            if (decision == "approve")
            {
                var validation = await ProposalInputError(db, proposal.SemesterPlan,
                    new ProposalInput(proposal.AssignmentId, proposal.CurricularCapabilityId,
                        proposal.RoomId, proposal.ShiftId, proposal.StartDate, proposal.EndDate), current);
                if (validation is not null) return Results.Conflict(new ApiError(validation));
            }
            if (decision == "reject" && string.IsNullOrWhiteSpace(input.Reason))
                return Error("Informe o motivo da rejeição");
            if (input.Reason?.Length > 500) return Error("Motivo deve ter até 500 caracteres");
            proposal.Status = decision == "approve" ? PlanProposalStatus.Aprovada : PlanProposalStatus.Rejeitada;
            proposal.DecidedById = UserId(current);
            proposal.DecidedAtUtc = DateTime.UtcNow;
            proposal.RejectionReason = decision == "reject" ? input.Reason!.Trim() : null;
            proposal.SemesterPlan.Revision++;
            AuditTrail.Add(db, "PlanProposal", proposal.Id.ToString(),
                decision == "approve" ? "Aprovada" : "Rejeitada", UserId(current),
                new { Status = PlanProposalStatus.Enviada }, new { proposal.Status, proposal.DecidedAtUtc },
                proposal.RejectionReason);
            AuditTrail.Notify(db, proposal.Assignment.TeacherId, UserId(current),
                decision == "approve" ? "Proposta aprovada" : "Proposta rejeitada",
                decision == "approve" ? "Sua proposta semestral foi aprovada para publicação." :
                    $"Sua proposta semestral foi rejeitada: {proposal.RejectionReason}",
                "PlanProposal", proposal.Id);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { proposal.Id, proposal.Status });
        }).RequireAuthorization("Admin");
        api.MapGet("/{id:int}/publish-preview", async (int id, AppDbContext db) =>
        {
            var plan = await PlanQuery(db).AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
            if (plan is null) return Results.NotFound();
            return Results.Ok(await AssessPlan(db, plan));
        }).RequireAuthorization("Admin");
        api.MapPost("/{id:int}/publish", async (int id, PublishPlanInput input,
            ClaimsPrincipal current, AppDbContext db) =>
        {
            if (!input.Confirm) return Error("Confirme a publicação após consultar a prévia");
            try
            {
                await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
                var plan = await PlanQuery(db).FirstOrDefaultAsync(p => p.Id == id);
                if (plan is null) return Results.NotFound();
                if (plan.Revision != input.ExpectedRevision)
                    return Results.Conflict(new ApiError("O planejamento mudou desde a prévia"));
                var preview = await AssessPlan(db, plan);
                if (preview.Signature != input.ExpectedSignature)
                    return Results.Conflict(new ApiError("As ocupações mudaram desde a prévia"));
                if (!preview.Allowed) return Results.Conflict(new { Error = "Publicação bloqueada", preview.Blocks, preview.Checks });
                foreach (var check in preview.Checks.Where(c => c.ExistingOccupationId is null))
                {
                    var proposal = plan.Proposals.Single(p => p.Id == check.ProposalId);
                    db.Occupations.Add(new RoomOccupation { PlanProposalId = proposal.Id,
                        RoomId = proposal.RoomId, StartsAt = check.StartsAt, EndsAt = check.EndsAt,
                        TeacherId = proposal.Assignment.TeacherId,
                        ClassGroupId = proposal.Assignment.ClassGroupId, Kind = OccupationKind.Aula,
                        Description = proposal.Assignment.DisciplineName });
                }
                foreach (var check in preview.Checks.Where(c => c.ExistingOccupationId is not null))
                {
                    var existing = await db.Occupations.SingleAsync(o => o.Id == check.ExistingOccupationId);
                    existing.PlanProposalId = check.ProposalId;
                }
                foreach (var proposal in plan.Proposals) proposal.Status = PlanProposalStatus.Publicada;
                plan.Published = true; plan.PublishedAtUtc = DateTime.UtcNow;
                plan.PublishedById = UserId(current); plan.Revision++;
                AuditTrail.Add(db, "SemesterPlan", id.ToString(), "Publicada", UserId(current),
                    new { Published = false }, new { plan.Published, plan.PublishedAtUtc,
                        OccupationsCreated = preview.ToCreate, ExistingOccupations = preview.Existing,
                        Distribution = plan.Proposals.Select(p => new { p.Id, p.AssignmentId,
                            p.Assignment.TeacherId, p.Assignment.ClassGroupId,
                            p.Assignment.CurricularUnitId, p.CurricularCapabilityId,
                            p.RoomId, p.ShiftId, p.StartDate, p.EndDate }).ToArray() });
                foreach (var teacher in plan.Proposals.Select(p => p.Assignment.TeacherId).Distinct())
                    AuditTrail.Notify(db, teacher, UserId(current), "Planejamento publicado",
                        $"O planejamento do semestre {plan.Semester.Name} foi publicado.", "SemesterPlan", id);
                await db.SaveChangesAsync();
                await tx.CommitAsync();
                return Results.Ok(new { plan.Id, plan.Published, preview.ToCreate, preview.Existing });
            }
            catch (SqlException error) when (error.Number is 1205 or 3960 or 1222 or 2601 or 2627)
            {
                return Results.Conflict(new ApiError("Conflito de concorrência. Consulte a prévia novamente"));
            }
            catch (DbUpdateException error) when (error.InnerException is SqlException sql &&
                sql.Number is 1205 or 3960 or 1222 or 2601 or 2627)
            {
                return Results.Conflict(new ApiError("Conflito de concorrência. Consulte a prévia novamente"));
            }
        }).RequireAuthorization("Admin");
        api.MapGet("/{id:int}/history", async (int id, ClaimsPrincipal current, AppDbContext db) =>
        {
            var plan = await db.SemesterPlans.Include(p => p.Proposals).ThenInclude(p => p.Assignment)
                .FirstOrDefaultAsync(p => p.Id == id);
            if (plan is null) return Results.NotFound();
            var admin = current.IsInRole("Admin");
            var me = UserId(current);
            if (!admin && !plan.Proposals.Any(p => p.Assignment.TeacherId == me)) return Results.Forbid();
            var ids = plan.Proposals.Where(p => admin || p.Assignment.TeacherId == me)
                .Select(p => p.Id.ToString()).ToArray();
            var entries = await db.AuditEntries.AsNoTracking().Where(a =>
                (a.EntityType == "PlanProposal" && ids.Contains(a.EntityId)) ||
                (a.EntityType == "SemesterPlan" && a.EntityId == id.ToString()))
                .OrderBy(a => a.CreatedAtUtc).ThenBy(a => a.Id)
                .Select(a => new { a.Id, a.EntityType, a.EntityId, a.Action,
                    a.ActorId, a.CreatedAtUtc, a.Reason, a.AfterJson }).ToListAsync();
            var actorIds = entries.Select(e => e.ActorId).Distinct().ToArray();
            var names = await db.Users.AsNoTracking().Where(u => actorIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName }).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
            return Results.Ok(entries.Select(e => new { e.Id, e.EntityType, e.EntityId,
                e.Action, e.ActorId, ActorName = names.GetValueOrDefault(e.ActorId, "Usuário"),
                e.CreatedAtUtc, e.Reason,
                AfterJson = e.EntityType == "SemesterPlan" && !admin ? null : e.AfterJson }));
        });
    }

    private static IQueryable<SemesterPlan> PlanQuery(AppDbContext db) => db.SemesterPlans
        .Include(p => p.Semester).Include(p => p.Proposals).ThenInclude(p => p.Assignment)
            .ThenInclude(a => a.ClassGroup)
        .Include(p => p.Proposals).ThenInclude(p => p.Assignment).ThenInclude(a => a.Software)
        .Include(p => p.Proposals).ThenInclude(p => p.Room)
        .Include(p => p.Proposals).ThenInclude(p => p.Shift);

    private static async Task<string?> ProposalInputError(AppDbContext db, SemesterPlan plan,
        ProposalInput input, ClaimsPrincipal current)
    {
        var assignment = await db.Assignments.AsNoTracking().Include(a => a.ClassGroup)
            .FirstOrDefaultAsync(a => a.Id == input.AssignmentId);
        if (assignment is null || assignment.EndedAtUtc is not null ||
            assignment.ClassGroup.SemesterId != plan.SemesterId || assignment.CurricularUnitId is null)
            return "Atribuição pedagógica ativa do semestre não encontrada";
        if (!current.IsInRole("Admin") && assignment.TeacherId != UserId(current))
            return "A atribuição não pertence ao professor autenticado";
        if (input.StartDate < plan.Semester.StartDate || input.EndDate > plan.Semester.EndDate ||
            input.StartDate > input.EndDate || input.EndDate.DayNumber - input.StartDate.DayNumber > 370 ||
            !Enumerable.Range(0, input.EndDate.DayNumber - input.StartDate.DayNumber + 1)
                .Any(d => (int)input.StartDate.AddDays(d).DayOfWeek == assignment.Weekday))
            return "Intervalo fora do semestre ou sem encontros da atribuição";
        if (assignment.Weekday is null || assignment.PreferredShiftId != input.ShiftId)
            return "Dia ou turno não corresponde à atribuição pedagógica";
        if (!await db.Rooms.AnyAsync(r => r.Id == input.RoomId && r.Active))
            return "Ambiente não encontrado ou inativo";
        if (input.CurricularCapabilityId is int capabilityId &&
            !await db.CurricularCapabilities.AnyAsync(c => c.Id == capabilityId &&
                c.CurricularUnitId == assignment.CurricularUnitId))
            return "Capacidade não pertence à UC da atribuição";
        var events = await EventsFor(db, plan.SemesterId, input.StartDate, input.EndDate);
        var exceptions = await ExceptionsFor(db, assignment.ClassGroupId, input.StartDate, input.EndDate);
        var calendar = AcademicCalendarRules.Preview(plan.Semester, input.StartDate, input.EndDate,
            1 << assignment.Weekday.Value, assignment.ClassGroup, events, exceptions);
        if (calendar.Dates.Any(d => !d.CountsAsPresential))
            return "O período contém encontro não presencial no calendário da turma";
        return null;
    }

    private static async Task<PlanPreview> AssessPlan(
        AppDbContext db, SemesterPlan plan)
    {
        var blocks = new List<string>();
        var warnings = new List<string>();
        var checks = new List<PlanCheck>();
        if (plan.Published) blocks.Add("Planejamento já publicado");
        if (plan.Proposals.Count == 0) blocks.Add("Planejamento sem propostas");
        if (plan.Proposals.Any(p => p.Status != PlanProposalStatus.Aprovada))
            blocks.Add("Todas as propostas devem estar aprovadas antes da publicação integral");
        var unitIds = plan.Proposals.Select(p => p.Assignment.CurricularUnitId)
            .Where(x => x is not null).Select(x => x!.Value).Distinct().ToArray();
        var units = await db.CurricularUnits.AsNoTracking().Where(u => unitIds.Contains(u.Id)).ToListAsync();
        var capabilities = await db.CurricularCapabilities.AsNoTracking()
            .Where(c => unitIds.Contains(c.CurricularUnitId)).ToListAsync();
        foreach (var unit in units)
        {
            var shift = plan.Proposals.Where(p => p.Assignment.CurricularUnitId == unit.Id)
                .Select(p => p.Shift).FirstOrDefault();
            if (shift is null || shift.EndsAt <= shift.StartsAt) continue;
            var hoursPerShift = (decimal)(shift.EndsAt.ToTimeSpan() - shift.StartsAt.ToTimeSpan()).TotalHours;
            var summary = PedagogicalCatalogRules.SummarizeWorkload(unit.Id, unit.PlannedHours,
                capabilities.Where(c => c.CurricularUnitId == unit.Id).Select(c => c.RequiredHours), hoursPerShift);
            if (summary.Status is WorkloadStatus.MissingHours or WorkloadStatus.ExcessHours)
                warnings.Add($"UC {unit.Name}: carga horária das capacidades {summary.Status}; política de bloqueio pendente");
        }
        foreach (var proposal in plan.Proposals.Where(p => p.Status == PlanProposalStatus.Aprovada))
        {
            var input = new ProposalInput(proposal.AssignmentId, proposal.CurricularCapabilityId,
                proposal.RoomId, proposal.ShiftId, proposal.StartDate, proposal.EndDate);
            var proposalBlocks = new List<string>();
            var error = await ProposalInputError(db, plan, input,
                new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, "Admin")])));
            if (error is not null)
            {
                blocks.Add($"Proposta {proposal.Id}: {error}");
                continue;
            }
            var assignment = proposal.Assignment;
            var room = await RoomQuery(db).FirstOrDefaultAsync(r => r.Id == proposal.RoomId);
            if (room is null || !room.Active) proposalBlocks.Add("Ambiente indisponível");
            if (room is not null)
            {
                if (proposal.CurricularCapabilityId is int capabilityId)
                {
                    var requirement = await RequirementQuery(db).FirstOrDefaultAsync(r =>
                        r.CurricularCapabilityId == capabilityId);
                    var result = EnvironmentCompatibility.Evaluate(requirement, room,
                        assignment.ClassGroup.Students, proposal.EndDate);
                    if (result.Classification != "Compatible")
                        proposalBlocks.Add("Compatibilidade técnica insuficiente");
                }
                else if (RoomCompatibility.Incompatibility(room, Need(assignment)) is string mismatch)
                    proposalBlocks.Add($"Ambiente inadequado: {mismatch}");
            }
            var events = await EventsFor(db, plan.SemesterId, proposal.StartDate, proposal.EndDate);
            var exceptions = await ExceptionsFor(db, assignment.ClassGroupId,
                proposal.StartDate, proposal.EndDate);
            var calendar = AcademicCalendarRules.Preview(plan.Semester, proposal.StartDate,
                proposal.EndDate, 1 << assignment.Weekday!.Value,
                assignment.ClassGroup, events, exceptions).Dates.ToDictionary(d => d.Date);
            for (var date = proposal.StartDate; date <= proposal.EndDate; date = date.AddDays(1))
            {
                if ((int)date.DayOfWeek != assignment.Weekday) continue;
                var currentBlocks = new List<string>(proposalBlocks);
                if (!calendar[date].CountsAsPresential)
                    currentBlocks.Add($"Calendário: {calendar[date].Reason}");
                var start = date.ToDateTime(proposal.Shift.StartsAt);
                var end = date.ToDateTime(proposal.Shift.EndsAt);
                var occupied = await db.Occupations.AsNoTracking().Where(o => o.CancelledAtUtc == null &&
                    o.StartsAt < end && start < o.EndsAt &&
                    (o.RoomId == proposal.RoomId || o.TeacherId == assignment.TeacherId ||
                        o.ClassGroupId == assignment.ClassGroupId)).ToListAsync();
                int? equivalent = null;
                if (occupied.Count == 1)
                {
                    var o = occupied[0];
                    var trustedBooking = o.BookingRequestId is int bookingId &&
                        await db.Bookings.AsNoTracking().AnyAsync(b => b.Id == bookingId &&
                            b.TeacherId == assignment.TeacherId && b.ClassGroupId == assignment.ClassGroupId &&
                            b.CurricularUnitId == assignment.CurricularUnitId &&
                            b.CurricularCapabilityId == proposal.CurricularCapabilityId);
                    var trustedWeekly = o.WeeklyClassId is int weeklyId &&
                        await db.WeeklyClasses.AsNoTracking().AnyAsync(w => w.Id == weeklyId &&
                            w.AssignmentId == proposal.AssignmentId);
                    var uniqueAssignment = await db.Assignments.CountAsync(a => a.EndedAtUtc == null &&
                        a.TeacherId == assignment.TeacherId && a.ClassGroupId == assignment.ClassGroupId &&
                        a.CurricularUnitId == assignment.CurricularUnitId && a.Weekday == assignment.Weekday &&
                        a.PreferredShiftId == proposal.ShiftId) == 1;
                    if (o.RoomId == proposal.RoomId && o.StartsAt == start && o.EndsAt == end &&
                        o.TeacherId == assignment.TeacherId && o.ClassGroupId == assignment.ClassGroupId &&
                        o.PlanProposalId is null && uniqueAssignment && (trustedBooking || trustedWeekly) &&
                        !await db.Loans.AnyAsync(l => l.RoomOccupationId == o.Id && l.Status != LoanStatus.Rejeitado))
                        equivalent = o.Id;
                }
                if (equivalent is null)
                {
                    var conflict = await ReservationRules.ConflictAsync(db, proposal.RoomId,
                        start, end, assignment.TeacherId, assignment.ClassGroupId);
                    if (conflict is not null) currentBlocks.Add(conflict);
                }
                if (checks.Any(c => c.StartsAt < end && start < c.EndsAt &&
                    plan.Proposals.Any(other => other.Id == c.ProposalId &&
                        (other.RoomId == proposal.RoomId || other.Assignment.TeacherId == assignment.TeacherId ||
                            other.Assignment.ClassGroupId == assignment.ClassGroupId))))
                    currentBlocks.Add("Conflito entre propostas do planejamento");
                checks.Add(new PlanCheck(proposal.Id, start, end, equivalent, currentBlocks, []));
                blocks.AddRange(currentBlocks.Select(x => $"Proposta {proposal.Id}, {date:dd/MM/yyyy}: {x}"));
            }
        }
        var signatureText = string.Join("|", checks.Select(c =>
            $"{c.ProposalId}:{c.StartsAt.Ticks}:{c.EndsAt.Ticks}:{c.ExistingOccupationId}"));
        var signature = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(signatureText)));
        return new PlanPreview(blocks.Count == 0, plan.Revision, plan.Proposals.Count,
            plan.Proposals.Count(p => p.Status == PlanProposalStatus.Aprovada),
            checks.Count(c => c.ExistingOccupationId is null),
            checks.Count(c => c.ExistingOccupationId is not null), blocks, warnings, checks, signature);
    }
}
