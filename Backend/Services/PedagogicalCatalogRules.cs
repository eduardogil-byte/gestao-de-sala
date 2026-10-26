namespace SalaGest.Api.Services;

public static class PedagogicalCatalogRules
{
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
}
