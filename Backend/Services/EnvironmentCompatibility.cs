using SalaGest.Api.Contracts;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public static class EnvironmentCompatibility
{
    public static EnvironmentCompatibilityResponse Evaluate(CapabilityEnvironmentRequirement? requirement,
        Room room, int? students, DateOnly today, bool oneComputerPerStudent = false,
        IReadOnlyList<CurricularUnitResourceRequirement>? unitResources = null)
    {
        var findings = new List<RequirementFinding>();
        if ((unitResources is null || unitResources.Count == 0) && (requirement is null || (requirement.RoomKind is null && !requirement.RequiresProjector &&
            requirement.RequiredComputers is null && requirement.Resources.Count == 0 && requirement.Software.Count == 0)))
            findings.Add(new("requirements", "Unknown", "Requisitos técnicos não cadastrados"));
        if (requirement is not null)
        {
            if (requirement.RoomKind is RoomKind kind)
                findings.Add(new("roomKind", room.Kind == kind ? "Met" : "UnmetCritical",
                    room.Kind == kind ? "Tipo de ambiente atendido" : $"Tipo exigido: {kind}; ambiente: {room.Kind}"));
            if (requirement.RequiresProjector)
            {
                var projector = room.Resources.FirstOrDefault(x => x.NormalizedName == "PROJETOR");
                var status = projector is null ? room.HasProjector ? "Met" : "UnmetCritical" :
                    projector.Quantity == 0 ? "UnmetCritical" :
                    projector.OperationalQuantity is null ? "Unknown" :
                    projector.OperationalQuantity > 0 ? "Met" : "UnmetCritical";
                findings.Add(new("projector", status, status switch
                {
                    "Met" => "Projetor disponível",
                    "Unknown" => "Quantidade operacional do projetor não informada",
                    _ => "Projetor não disponível no ambiente"
                }));
            }
            foreach (var required in requirement.Resources)
            {
                AddResourceFinding(findings, room, required.ResourceCatalogItemId,
                    required.NormalizedName, required.NormalizedType, required.Name, required.Type,
                    required.Quantity, required.Critical);
            }
            EvaluateComputers(requirement, room, today, findings,
                oneComputerPerStudent ? students : null);
        }
        foreach (var required in unitResources ?? [])
            AddResourceFinding(findings, room, required.ResourceCatalogItemId,
                required.ResourceCatalogItem.NormalizedName,
                string.Join(' ', required.ResourceCatalogItem.Category.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant(),
                required.ResourceCatalogItem.Name, required.ResourceCatalogItem.Category,
                required.Quantity, true);
        if (students is int count)
            findings.Add(new("seats", room.Seats >= count ? "Met" : "UnmetCritical",
                $"Lugares: {room.Seats}; alunos: {count}"));
        var classification = findings.Any(x => x.Status == "UnmetCritical") ? "Incompatible" :
            findings.All(x => x.Status == "Met") ? "Compatible" : "Partial";
        return new(room.Id, room.Name, classification, findings);
    }

    private static void AddResourceFinding(List<RequirementFinding> findings, Room room, int? catalogId,
        string normalizedName, string normalizedType, string name, string type, int quantity, bool critical)
    {
        var resource = room.Resources.FirstOrDefault(r => catalogId is int id && r.ResourceCatalogItemId == id)
            ?? room.Resources.FirstOrDefault(r => (catalogId is null || r.ResourceCatalogItemId is null) &&
                r.NormalizedName == normalizedName && r.NormalizedType == normalizedType);
        var available = resource?.OperationalQuantity;
        var total = resource?.Quantity ?? 0;
        var status = resource is null || total < quantity || available < quantity
            ? critical ? "UnmetCritical" : "Partial" : available is null ? "Unknown" : "Met";
        var detail = resource is null ? $"{name}: não cadastrado; necessários {quantity}" :
            available is null ? $"{name}: {total} cadastrados, quantidade disponível desconhecida; necessários {quantity}" :
            $"{name}: {available} disponíveis; necessários {quantity}";
        findings.Add(new($"resource:{type}:{name}", status, detail));
    }

    private static void EvaluateComputers(CapabilityEnvironmentRequirement requirement, Room room,
        DateOnly today, List<RequirementFinding> findings, int? studentsNeedingComputers)
    {
        if (requirement.RequiredComputers is not int needed && requirement.Software.Count == 0) return;
        var requiredComputers = Math.Max(requirement.RequiredComputers ?? 1,
            studentsNeedingComputers ?? 0);
        var confirmed = 0;
        var possible = 0;
        var unknown = false;
        foreach (var group in room.ComputerGroups)
        {
            if (requirement.MinRamGb is int ram && group.RamGb != 0 && group.RamGb < ram) continue;
            var capacity = group.OperationalQuantity ?? group.Quantity;
            var candidate = capacity;
            var installs = new List<int>();
            foreach (var software in requirement.Software)
            {
                var link = group.Software.FirstOrDefault(x => x.SoftwareId == software.SoftwareId);
                var installed = link?.InstalledQuantity ?? 0;
                if (software.RequiredLicenses is not null)
                {
                    if (link?.LicenseExpiresOn is DateOnly expiry && expiry < today) installed = 0;
                    else if (link?.LicenseQuantity is int licenses) installed = Math.Min(installed, licenses);
                    else if (link is not null) unknown = true;
                }
                installs.Add(installed);
                candidate = Math.Min(candidate, installed);
            }
            possible += candidate;
            if (group.OperationalQuantity is null ||
                (requirement.MinRamGb is not null && group.RamGb == 0) ||
                requirement.Software.Any(s => s.RequiredLicenses is not null &&
                    group.Software.Any(x => x.SoftwareId == s.SoftwareId && x.LicenseQuantity is null)))
            {
                if (candidate > 0) unknown = true;
                continue;
            }
            // Instalações parciais de softwares diferentes não provam que coincidem nos mesmos PCs.
            var provenInGroup = installs.Count < 2 ? candidate :
                Math.Max(0, capacity - installs.Sum(x => capacity - Math.Min(capacity, x)));
            if (provenInGroup < candidate) unknown = true;
            confirmed += provenInGroup;
        }
        foreach (var software in requirement.Software)
        {
            var present = room.ComputerGroups.Any(g => g.Software.Any(x => x.SoftwareId == software.SoftwareId));
            findings.Add(new($"software:{software.SoftwareId}", present ? "Met" :
                software.Critical ? "UnmetCritical" : "Partial",
                present ? $"Software {software.Software.Name} cadastrado em grupos específicos" :
                    $"Software {software.Software.Name} não cadastrado nos grupos"));
            if (software.RequiredLicenses is int requiredLicenses)
            {
                var knownLicenses = room.ComputerGroups.SelectMany(g => g.Software)
                    .Where(x => x.SoftwareId == software.SoftwareId &&
                        (x.LicenseExpiresOn is null || x.LicenseExpiresOn >= today))
                    .Sum(x => x.LicenseQuantity ?? 0);
                var missingInfo = room.ComputerGroups.SelectMany(g => g.Software)
                    .Any(x => x.SoftwareId == software.SoftwareId && x.LicenseQuantity is null);
                var status = knownLicenses >= requiredLicenses ? "Met" : missingInfo ? "Unknown" :
                    software.Critical ? "UnmetCritical" : "Partial";
                findings.Add(new($"licenses:{software.SoftwareId}", status,
                    $"Licenças de {software.Software.Name}: {knownLicenses} confirmadas; necessárias {requiredLicenses}"));
            }
        }
        var computerStatus = confirmed >= requiredComputers ? "Met" :
            possible >= requiredComputers && unknown ? "Unknown" :
            requirement.ComputersCritical ? "UnmetCritical" : "Partial";
        findings.Add(new("computers", computerStatus,
            $"Computadores adequados comprovados: {confirmed}; possíveis: {possible}; necessários: {requiredComputers}; " +
            $"faltam {Math.Max(0, requiredComputers - confirmed)} comprovados"));
    }
}
