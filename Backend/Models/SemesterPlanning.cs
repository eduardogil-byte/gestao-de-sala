namespace SalaGest.Api.Models;

public enum PlanProposalStatus { Rascunho = 1, Enviada = 2, Aprovada = 3, Rejeitada = 4, Publicada = 5 }

public sealed class SemesterPlan
{
    public int Id { get; set; }
    public int SemesterId { get; set; }
    public Semester Semester { get; set; } = null!;
    public bool Published { get; set; }
    public int Revision { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAtUtc { get; set; }
    public string? PublishedById { get; set; }
    public List<PlanProposal> Proposals { get; set; } = new();
}

public sealed class PlanProposal
{
    public int Id { get; set; }
    public int SemesterPlanId { get; set; }
    public SemesterPlan SemesterPlan { get; set; } = null!;
    public int AssignmentId { get; set; }
    public TeachingAssignment Assignment { get; set; } = null!;
    public int? CurricularCapabilityId { get; set; }
    public CurricularCapability? CurricularCapability { get; set; }
    public int RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public int ShiftId { get; set; }
    public SchoolShift Shift { get; set; } = null!;
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public PlanProposalStatus Status { get; set; } = PlanProposalStatus.Rascunho;
    public string CreatedById { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string? DecidedById { get; set; }
    public DateTime? DecidedAtUtc { get; set; }
    public string? RejectionReason { get; set; }
}
