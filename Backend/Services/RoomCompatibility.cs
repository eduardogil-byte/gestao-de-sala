using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public record RoomNeed(int Students, bool Projector, bool TeacherComputer, bool StudentComputers,
    HardwareTier MinTier, IReadOnlyCollection<int> SoftwareIds, int MinRamGb, bool DedicatedGpu, int StudentsPerComputer = 1);

public static class RoomCompatibility
{
    public static string? Incompatibility(Room room, RoomNeed need)
    {
        if (!room.Active) return "Sala inativa";
        if (room.Seats < need.Students) return "Capacidade de alunos insuficiente";
        if (need.Projector && !room.HasProjector) return "Sem projetor";
        if (need.TeacherComputer && !room.HasTeacherComputer) return "Sem computador do professor";

        var software = need.SoftwareIds.Distinct().ToArray();
        var requiresStudentPcs = need.StudentComputers || software.Length > 0 ||
            need.MinTier != HardwareTier.Basico || need.MinRamGb > 0 || need.DedicatedGpu;
        if (!requiresStudentPcs) return null;

        var compatibleComputers = 0;
        foreach (var group in room.ComputerGroups)
        {
            if (group.Tier < need.MinTier || group.RamGb < need.MinRamGb ||
                (need.DedicatedGpu && !group.DedicatedGpu)) continue;
            var count = group.Quantity;
            foreach (var softwareId in software)
            {
                var installed = group.Software.FirstOrDefault(x => x.SoftwareId == softwareId)?.InstalledQuantity ?? 0;
                // Mais de um software: exige instalação em todos os PCs do grupo
                // para não supor sobreposição entre instalações parciais.
                if (software.Length > 1 && installed != group.Quantity) { count = 0; break; }
                count = Math.Min(count, installed);
            }
            compatibleComputers += count;
        }
        return compatibleComputers >= (int)Math.Ceiling((double)need.Students / Math.Max(1, need.StudentsPerComputer)) ? null : "Computadores ou softwares insuficientes";
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
