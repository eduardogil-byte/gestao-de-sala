using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public record RoomNeed(int Students, bool Projector, bool TeacherComputer, bool StudentComputers,
    HardwareTier MinTier, IReadOnlyCollection<int> SoftwareIds, int MinRamGb, bool DedicatedGpu, int StudentsPerComputer = 1);

public static class RoomCompatibility
{
    public static string? Incompatibility(Room room, RoomNeed need, DateOnly? date = null)
    {
        if (!room.Active) return "Sala inativa";
        if (room.Seats < need.Students) return "Capacidade de alunos insuficiente";
        if (need.Projector && !HasOperationalOrLegacy(room, "PROJETOR", room.HasProjector)) return "Sem projetor";
        if (need.TeacherComputer && !HasOperationalOrLegacy(room, "PC DO INSTRUTOR", room.HasTeacherComputer))
            return "Sem computador do instrutor";

        var software = need.SoftwareIds.Distinct().ToArray();
        var requiresStudentPcs = need.StudentComputers || software.Length > 0 ||
            need.MinTier != HardwareTier.Basico || need.MinRamGb > 0 || need.DedicatedGpu;
        if (!requiresStudentPcs) return null;

        var compatibleComputers = 0;
        foreach (var group in room.ComputerGroups)
        {
            if (group.Tier < need.MinTier || group.RamGb < need.MinRamGb ||
                (need.DedicatedGpu && !group.DedicatedGpu) || group.OperationalQuantity is null) continue;
            var capacity = group.OperationalQuantity.Value;
            var count = capacity;
            var installs = new List<int>();
            foreach (var softwareId in software)
            {
                var link = group.Software.FirstOrDefault(x => x.SoftwareId == softwareId);
                var installed = link?.InstalledQuantity ?? 0;
                if (link?.LicenseQuantity is not int) installed = 0;
                if (link?.LicenseExpiresOn is DateOnly expiry && expiry < (date ?? DateOnly.FromDateTime(DateTime.Today)))
                    installed = 0;
                if (link?.LicenseQuantity is int licenses) installed = Math.Min(installed, licenses);
                installs.Add(Math.Min(capacity, installed));
                count = Math.Min(count, installed);
            }
            if (installs.Count > 1)
                count = Math.Min(count, Math.Max(0, capacity - installs.Sum(x => capacity - x)));
            compatibleComputers += count;
        }
        return compatibleComputers >= (int)Math.Ceiling((double)need.Students / Math.Max(1, need.StudentsPerComputer)) ? null : "Computadores ou softwares insuficientes";
    }

    private static bool HasOperationalOrLegacy(Room room, string normalizedName, bool legacy)
    {
        var resources = room.Resources.Where(x => x.NormalizedName == normalizedName).ToArray();
        return resources.Length == 0 ? legacy : resources.Any(x => x.OperationalQuantity > 0);
    }

    public static int Score(Room room, RoomNeed need)
    {
        var excessSeats = Math.Max(0, room.Seats - need.Students);
        var requiredPCs = need.StudentComputers || need.SoftwareIds.Count != 0 ||
            need.MinTier != HardwareTier.Basico || need.MinRamGb > 0 || need.DedicatedGpu;
        var totalPCs = room.ComputerGroups.Sum(x => x.Quantity);
        var highestTier = room.ComputerGroups.Count == 0 ? 0 : room.ComputerGroups.Max(x => (int)x.Tier);
        var waste = requiredPCs
            ? Math.Max(0, highestTier - (int)need.MinTier) * 25 + Math.Max(0, totalPCs - need.Students)
            : totalPCs * 2 + highestTier * 10;
        return 1000 - excessSeats * 2 - waste;
    }
}
