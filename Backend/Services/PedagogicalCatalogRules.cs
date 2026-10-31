using SalaGest.Api.Contracts;

namespace SalaGest.Api.Services;

public static class PedagogicalCatalogRules
{
    public const decimal MaximumHours = 9999999.99m;

    public static string NormalizeKey(string value) => value.Trim().ToUpperInvariant();

    public static string? ValidateCourse(string? code, string? name, bool? active)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Trim().Length > 30)
            return "Código do curso é obrigatório e deve ter até 30 caracteres";
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 160)
            return "Nome do curso é obrigatório e deve ter até 160 caracteres";
        if (active is null) return "Situação do curso é obrigatória";
        return null;
    }

    public static string? ValidateModule(string? name, int order)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 120)
            return "Nome do módulo é obrigatório e deve ter até 120 caracteres";
        if (order < 1) return "Ordem do módulo deve ser positiva";
        return null;
    }

    public static string? ValidateCurricularUnit(string? code, string? name)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Trim().Length > 30)
            return "Código da unidade curricular é obrigatório e deve ter até 30 caracteres";
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 160)
            return "Nome da unidade curricular é obrigatório e deve ter até 160 caracteres";
        return null;
    }

    public static string? ValidateHours(decimal? hours, bool allowUndefined = false)
    {
        if (hours is null) return allowUndefined ? null : "Carga horária é obrigatória";
        return hours > 0 && hours <= MaximumHours && decimal.Round(hours.Value, 2) == hours
            ? null : "Carga horária deve ser positiva, ter até duas casas decimais e caber no limite permitido";
    }

    public static string? ValidateCapability(string? description, string? contents,
        decimal requiredHours, int order)
    {
        if (string.IsNullOrWhiteSpace(description) || description.Trim().Length > 300)
            return "Descrição da capacidade é obrigatória e deve ter até 300 caracteres";
        if (string.IsNullOrWhiteSpace(contents) || contents.Trim().Length > 4000)
            return "Conteúdos são obrigatórios e devem ter até 4000 caracteres";
        if (order < 1) return "Ordem da capacidade deve ser positiva";
        return ValidateHours(requiredHours);
    }

    public static bool ValidHoursPerShift(decimal hoursPerShift) =>
        hoursPerShift > 0 && hoursPerShift <= 24 && decimal.Round(hoursPerShift, 2) == hoursPerShift;

    public static int EstimateMeetings(decimal pedagogicalHours, decimal hoursPerShift)
    {
        if (ValidateHours(pedagogicalHours) is not null)
            throw new ArgumentOutOfRangeException(nameof(pedagogicalHours));
        if (!ValidHoursPerShift(hoursPerShift))
            throw new ArgumentOutOfRangeException(nameof(hoursPerShift));
        return checked((int)decimal.Ceiling(pedagogicalHours / hoursPerShift));
    }

    public static CurricularUnitWorkloadSummary SummarizeWorkload(int unitId, decimal? plannedHours,
        IEnumerable<decimal> capabilityHours, decimal hoursPerShift)
    {
        if (!ValidHoursPerShift(hoursPerShift))
            throw new ArgumentOutOfRangeException(nameof(hoursPerShift));
        var total = capabilityHours.Sum();
        if (plannedHours is null)
            return new(unitId, null, total, WorkloadStatus.Undefined, 0, 0, hoursPerShift, null);
        var missing = Math.Max(0, plannedHours.Value - total);
        var excess = Math.Max(0, total - plannedHours.Value);
        var status = missing > 0 ? WorkloadStatus.MissingHours :
            excess > 0 ? WorkloadStatus.ExcessHours : WorkloadStatus.Balanced;
        var meetings = EstimateMeetings(plannedHours.Value, hoursPerShift);
        return new(unitId, plannedHours, total, status, missing, excess, hoursPerShift, meetings);
    }
}
