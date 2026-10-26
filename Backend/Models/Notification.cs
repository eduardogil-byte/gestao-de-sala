namespace SalaGest.Api.Models;

public sealed class UserNotification
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string ActorId { get; set; } = "";
    public string Message { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAtUtc { get; set; }
}
