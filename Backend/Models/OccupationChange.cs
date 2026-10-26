namespace SalaGest.Api.Models;

public sealed class OccupationChange
{
    public int Id { get; set; }
    public int RoomOccupationId { get; set; }
    public string ChangedById { get; set; } = "";
    public string Action { get; set; } = "";
    public string Details { get; set; } = "";
    public DateTime ChangedAtUtc { get; set; } = DateTime.UtcNow;
}
