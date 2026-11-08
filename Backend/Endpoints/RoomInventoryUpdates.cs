using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void AuditNewInventory(AppDbContext db, Room room, string actor)
    {
        foreach (var group in room.ComputerGroups)
            AuditTrail.Add(db, "ComputerGroup", group.Id.ToString(), "Criado", actor, null, InventoryGroupAudit(group));
        foreach (var resource in room.Resources)
            AuditTrail.Add(db, "Resource", resource.Id.ToString(), "Criado", actor, null, ResourceAudit(resource));
    }

    private static async Task<string?> ValidateInventory(AppDbContext db, RoomInventoryInput input, Room room)
    {
        var groups = input.ComputerGroups ?? new();
        var removed = input.RemovedGroupIds ?? new();
        var resources = input.Resources ?? new();
        if (groups.Any(x => x is null || x.Details is null) || resources.Any(x => x is null || x.Details is null))
            return "Informe os dados técnicos de cada grupo e recurso.";
        if (removed.Distinct().Count() != removed.Count ||
            groups.Where(x => x.Id.HasValue).Select(x => x.Id).Distinct().Count() != groups.Count(x => x.Id.HasValue) ||
            resources.Where(x => x.Id.HasValue).Select(x => x.Id).Distinct().Count() != resources.Count(x => x.Id.HasValue) ||
            removed.Any(id => !room.ComputerGroups.Any(g => g.Id == id)) ||
            groups.Any(x => x.Id.HasValue && (!room.ComputerGroups.Any(g => g.Id == x.Id) || removed.Contains(x.Id.Value))) ||
            resources.Any(x => x.Id.HasValue && !room.Resources.Any(r => r.Id == x.Id)))
            return "O inventário contém IDs repetidos, removidos ou que não pertencem ao ambiente.";

        // Groups are referenced only by their software links; audit snapshots are independent.
        foreach (var update in groups)
        {
            if (GroupError(update.Details) is string error) return error;
            var existing = room.ComputerGroups.FirstOrDefault(g => g.Id == update.Id);
            var software = update.Software ?? new();
            var removedSoftware = update.RemovedSoftwareIds ?? new();
            if (SoftwareInventoryError(software, update.Details.Quantity) is string softwareError) return softwareError;
            if (removedSoftware.Distinct().Count() != removedSoftware.Count ||
                removedSoftware.Any(id => existing is null || !existing.Software.Any(s => s.SoftwareId == id)) ||
                software.Any(s => removedSoftware.Contains(s.SoftwareId)))
                return "A remoção de software deve identificar uma instalação existente neste grupo.";
            if (!await SoftwareExists(db, software.Select(s => s.SoftwareId))) return "Software não cadastrado.";
            if (existing?.Software.Any(s => !removedSoftware.Contains(s.SoftwareId) &&
                !software.Any(next => next.SoftwareId == s.SoftwareId) && s.InstalledQuantity > update.Details.Quantity) == true)
                return "A quantidade do grupo não pode ficar abaixo das instalações preservadas.";
        }
        var descriptions = room.ComputerGroups.Where(g => !removed.Contains(g.Id) && !groups.Any(x => x.Id == g.Id))
            .Select(g => g.Description.Trim()).Concat(groups.Select(x => x.Details.Description.Trim())).ToArray();
        if (descriptions.Distinct(StringComparer.OrdinalIgnoreCase).Count() != descriptions.Length)
            return "Já existe um grupo de computadores com esta identificação.";
        foreach (var update in resources)
            if (varError(update.Details) is string error) return error;
        var keys = room.Resources.Where(r => !resources.Any(x => x.Id == r.Id))
            .Select(r => (r.NormalizedName, r.NormalizedType))
            .Concat(resources.Select(x => (NormalizeInventoryKey(x.Details.Name), NormalizeInventoryKey(x.Details.Type)))).ToArray();
        return keys.Distinct().Count() != keys.Length ? "Este recurso já está cadastrado no ambiente." : null;
    }

    private static string? SoftwareInventoryError(List<GroupSoftwareInventoryInput> software, int quantity)
        => software.Any(s => s is null) || software.Select(s => s.SoftwareId).Distinct().Count() != software.Count ||
            software.Any(s => s.SoftwareId <= 0 || s.InstalledQuantity < 1 || s.InstalledQuantity > quantity ||
                s.LicenseQuantity is < 1 || (s.Version?.Length ?? 0) > 80)
            ? "Softwares, instalações ou licenças inválidos." : null;

    private static object InventoryGroupAudit(ComputerGroup group) => new
    {
        Group = GroupAudit(group),
        Software = group.Software.Select(s => new { s.SoftwareId, s.InstalledQuantity,
            s.Version, s.LicenseQuantity, s.LicenseExpiresOn }).ToArray()
    };

    private static void ApplyInventory(AppDbContext db, Room room, RoomInventoryInput input, string actor)
    {
        foreach (var id in input.RemovedGroupIds ?? new())
        {
            var group = room.ComputerGroups.Single(g => g.Id == id);
            AuditTrail.Add(db, "ComputerGroup", id.ToString(), "Removido", actor, InventoryGroupAudit(group), null);
            db.GroupSoftware.RemoveRange(group.Software);
            db.ComputerGroups.Remove(group);
            room.ComputerGroups.Remove(group);
        }
        foreach (var update in input.ComputerGroups ?? new())
        {
            var group = update.Id is int id ? room.ComputerGroups.Single(g => g.Id == id) : new ComputerGroup { RoomId = room.Id };
            var before = update.Id.HasValue ? InventoryGroupAudit(group) : null;
            UpdateGroup(group, update.Details);
            foreach (var softwareId in update.RemovedSoftwareIds ?? new())
            {
                var link = group.Software.Single(s => s.SoftwareId == softwareId);
                db.GroupSoftware.Remove(link);
                group.Software.Remove(link);
            }
            foreach (var software in update.Software ?? new())
            {
                var link = group.Software.FirstOrDefault(s => s.SoftwareId == software.SoftwareId);
                if (link is null)
                {
                    link = new GroupSoftware { SoftwareId = software.SoftwareId };
                    group.Software.Add(link);
                }
                link.InstalledQuantity = software.InstalledQuantity;
                link.Version = OptionalText(software.Version);
                link.LicenseQuantity = software.LicenseQuantity;
                link.LicenseExpiresOn = software.LicenseExpiresOn;
            }
            if (!update.Id.HasValue) room.ComputerGroups.Add(group);
            // New entities receive their generated ID before the audit is recorded by the caller.
            if (update.Id.HasValue)
                AuditTrail.Add(db, "ComputerGroup", group.Id.ToString(), "Alterado", actor, before, InventoryGroupAudit(group));
        }
        foreach (var update in input.Resources ?? new())
        {
            var resource = update.Id is int id ? room.Resources.Single(r => r.Id == id) : new RoomResource { RoomId = room.Id };
            var before = update.Id.HasValue ? ResourceAudit(resource) : null;
            UpdateResource(resource, update.Details, NormalizeInventoryKey(update.Details.Name), NormalizeInventoryKey(update.Details.Type));
            if (!update.Id.HasValue) room.Resources.Add(resource);
            if (update.Id.HasValue)
                AuditTrail.Add(db, "Resource", resource.Id.ToString(), "Alterado", actor, before, ResourceAudit(resource));
        }
    }
}
