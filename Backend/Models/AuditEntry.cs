namespace SalaGest.Api.Models;

// Histórico de entidades que não possuem uma RoomOccupation. Movimentações continuam em OccupationChange.
public sealed class AuditEntry
{
    public int Id { get; set; }
    public string EntityType { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string Action { get; set; } = "";
    public string ActorId { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public string? Reason { get; set; }
}
