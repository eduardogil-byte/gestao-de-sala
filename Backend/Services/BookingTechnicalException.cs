using SalaGest.Api.Contracts;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

// Only presentation equipment and hardware specifications can be waived.
// Capacity, operational quantities, unknown requirements and licensing remain mandatory.
public static class BookingTechnicalException
{
    public static string[]? Common(Room room, RoomNeed need, DateOnly date)
    {
        var relaxed = need with { Projector = false, TeacherComputer = false,
            MinTier = HardwareTier.Basico, MinRamGb = 0, DedicatedGpu = false };
        if (RoomCompatibility.Incompatibility(room, relaxed, date) is not null) return null;
        var reason = RoomCompatibility.Incompatibility(room, need, date);
        if (reason is null) return [];
        return [reason, $"RAM exigida: {need.MinRamGb} GB; maior RAM operacional disponível: " +
            $"{room.ComputerGroups.Where(g => g.OperationalQuantity > 0).Select(g => g.RamGb).DefaultIfEmpty(0).Max()} GB"];
    }

    public static string[]? Pedagogical(CapabilityEnvironmentRequirement? requirement, Room room,
        EnvironmentCompatibilityResponse evaluation)
    {
        if (!room.Active || requirement is null) return null;
        var unmet = evaluation.Findings.Where(f => f.Status != "Met").ToArray();
        if (unmet.Any(f => f.Status == "Unknown" ||
            (f.Requirement != "projector" && f.Requirement != "computers"))) return null;
        if (unmet.Any(f => f.Requirement == "computers") &&
            (requirement.Software.Count > 0 || room.ComputerGroups.Sum(g => g.OperationalQuantity ?? 0) <
                (requirement.RequiredComputers ?? 1))) return null;
        var reasons = unmet.Select(f => f.Detail).ToList();
        if (unmet.Any(f => f.Requirement == "computers") && requirement.MinRamGb is int ram)
            reasons.Add($"RAM exigida: {ram} GB; maior RAM operacional disponível: " +
                $"{room.ComputerGroups.Where(g => g.OperationalQuantity > 0).Select(g => g.RamGb).DefaultIfEmpty(0).Max()} GB");
        return reasons.ToArray();
    }
}
