using System.Text.Json;
using System.Text.Json.Serialization;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public static class AuditTrail
{
    private static readonly JsonSerializerOptions SnapshotOptions = new()
    {
        Converters = { new JsonStringEnumConverter() }
    };

    public static bool Add(AppDbContext db, string type, string id, string action, string actor,
        object? before, object? after, string? reason = null)
    {
        var beforeJson = before is null ? null : JsonSerializer.Serialize(before, SnapshotOptions);
        var afterJson = after is null ? null : JsonSerializer.Serialize(after, SnapshotOptions);
        if (beforeJson is not null && beforeJson == afterJson) return false;
        db.AuditEntries.Add(new AuditEntry
        {
            EntityType = type, EntityId = id, Action = action, ActorId = actor,
            BeforeJson = beforeJson, AfterJson = afterJson,
            Reason = reason is null ? null : reason[..Math.Min(reason.Length, 500)],
            CreatedAtUtc = DateTime.UtcNow
        });
        return true;
    }

    public static void Notify(AppDbContext db, string userId, string actor, string subject,
        string message, string relatedType, int relatedId)
    {
        if (userId == actor) return;
        db.Notifications.Add(new UserNotification
        {
            UserId = userId, ActorId = actor, Subject = subject, Message = message,
            RelatedType = relatedType, RelatedId = relatedId, CreatedAtUtc = DateTime.UtcNow
        });
    }
}
