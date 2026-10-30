using System.Globalization;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public sealed class InstitutionalImportService
{
    private readonly AppDbContext _db;
    public InstitutionalImportService(AppDbContext db) => _db = db;

    public sealed record RowPlan(ImportRowPreview Preview, string State, Action? Apply, Func<string>? EntityId);
    public sealed record Analysis(ImportPreview Preview, IReadOnlyList<RowPlan> Plans);

    public async Task<Analysis> AnalyzeAsync(ImportKind kind, string fileName, ImportTable table)
    {
        if (!Enum.IsDefined(kind)) throw new ImportFileException("Tipo de cadastro inválido.");
        var columns = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < table.Headers.Length; index++)
        {
            var name = table.Headers[index].Trim().TrimStart('\uFEFF');
            if (name.Length == 0 || !columns.TryAdd(name, index))
                throw new ImportFileException("O cabeçalho contém colunas vazias ou repetidas.");
        }
        var required = kind switch
        {
            ImportKind.Capacidades => new[] { "CodigoCurso", "OrdemModulo", "CodigoUC", "Capacidade", "Conteudos", "CargaHoraria", "Ordem" },
            ImportKind.Recursos => new[] { "CodigoAmbiente", "Recurso", "Categoria", "Quantidade" },
            ImportKind.Ambientes => new[] { "Codigo", "Nome", "Tipo", "CapacidadeAlunos", "Carteiras" },
            _ => new[] { "CPF", "Nome" }
        };
        var missing = required.Where(name => !columns.ContainsKey(name)).ToArray();
        if (missing.Length > 0)
            throw new ImportFileException($"Cabeçalho incompleto: {string.Join(", ", missing)}.");
        var allowed = kind switch
        {
            ImportKind.Docentes => new[] { "CPF", "IdDocente", "Nome", "Email", "Formacao", "Habilidades", "Conhecimentos", "Cursos", "UCs", "Capacidades" },
            ImportKind.Ambientes => new[] { "Codigo", "IdAmbiente", "Nome", "Tipo", "CapacidadeAlunos", "Carteiras", "Localizacao", "Finalidade", "Projetor", "ComputadorDocente", "Internet" },
            ImportKind.Recursos => new[] { "CodigoAmbiente", "Recurso", "Categoria", "Quantidade", "QuantidadeOperacional", "Descricao", "Conservacao", "Especificacao", "Voltagem", "GarantiaAte", "LicencaAte" },
            _ => new[] { "CodigoCurso", "OrdemModulo", "CodigoUC", "IdCapacidade", "Capacidade", "Conteudos", "CargaHoraria", "Ordem" }
        };
        var unknown = columns.Keys.Where(name => !allowed.Contains(name, StringComparer.OrdinalIgnoreCase)).ToArray();
        if (unknown.Length > 0)
            throw new ImportFileException($"Cabeçalho desconhecido: {string.Join(", ", unknown)}.");
        var plans = kind switch
        {
            ImportKind.Capacidades => await AnalyzeCapabilitiesAsync(table.Rows, columns),
            ImportKind.Recursos => await AnalyzeResourcesAsync(table.Rows, columns),
            ImportKind.Ambientes => await AnalyzeRoomsAsync(table.Rows, columns),
            _ => await AnalyzeTeachersAsync(table.Rows, columns)
        };
        for (var index = 0; index < table.Rows.Count; index++)
            if (table.Rows[index].Values.Skip(table.Headers.Length).Any(x => !string.IsNullOrWhiteSpace(x)))
                plans[index] = Invalid(table.Rows[index].Line, "Linha com colunas extras",
                    ["Há dados além do cabeçalho nesta linha."]);
        var fingerprint = JsonSerializer.Serialize(new
        {
            kind,
            Headers = table.Headers,
            Rows = table.Rows.Select(x => new { x.Line, x.Values }),
            Plans = plans.Select(x => new { x.Preview, x.State })
        });
        var token = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(fingerprint)));
        var views = plans.Select(x => x.Preview).ToArray();
        var preview = new ImportPreview(kind, Path.GetFileName(fileName), views.Length,
            views.Count(x => x.Status == ImportRowStatus.Novo),
            views.Count(x => x.Status == ImportRowStatus.Atualizacao),
            views.Count(x => x.Status == ImportRowStatus.SemAlteracao),
            views.Count(x => x.Status == ImportRowStatus.Invalido),
            views.Count(x => x.Status == ImportRowStatus.Duplicado), token, views);
        return new Analysis(preview, plans);
    }

    private async Task<List<RowPlan>> AnalyzeCapabilitiesAsync(IReadOnlyList<ImportTableRow> rows,
        Dictionary<string, int> columns)
    {
        var courseKeys = rows.Select(row => Key(Cell(row, columns, "CodigoCurso"))).Distinct().ToArray();
        var courses = await _db.Courses.Where(x => courseKeys.Contains(x.NormalizedCode)).ToListAsync();
        var courseIds = courses.Select(x => x.Id).ToArray();
        var modules = await _db.CourseModules.Where(x => courseIds.Contains(x.CourseId)).ToListAsync();
        var moduleIds = modules.Select(x => x.Id).ToArray();
        var units = await _db.CurricularUnits.Where(x => moduleIds.Contains(x.CourseModuleId)).ToListAsync();
        var unitIds = units.Select(x => x.Id).ToArray();
        var capabilities = await _db.CurricularCapabilities.Where(x => unitIds.Contains(x.CurricularUnitId)).ToListAsync();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var seenOrders = new HashSet<string>(StringComparer.Ordinal);
        var plans = new List<RowPlan>();
        foreach (var row in rows)
        {
            var errors = new List<string>();
            var description = Cell(row, columns, "Capacidade");
            var contents = Cell(row, columns, "Conteudos");
            var course = courses.FirstOrDefault(x => x.NormalizedCode == Key(Cell(row, columns, "CodigoCurso")));
            if (course is null) errors.Add("Curso não cadastrado.");
            var moduleOrder = PositiveInt(Cell(row, columns, "OrdemModulo"), "OrdemModulo", errors);
            var module = modules.FirstOrDefault(x => x.CourseId == course?.Id && x.Order == moduleOrder);
            if (course is not null && module is null) errors.Add("Módulo não cadastrado neste curso.");
            var unit = units.FirstOrDefault(x => x.CourseModuleId == module?.Id &&
                x.NormalizedCode == Key(Cell(row, columns, "CodigoUC")));
            if (module is not null && unit is null) errors.Add("UC não cadastrada neste módulo.");
            var order = PositiveInt(Cell(row, columns, "Ordem"), "Ordem", errors);
            var hours = Hours(Cell(row, columns, "CargaHoraria"), errors);
            var rule = PedagogicalCatalogRules.ValidateCapability(description, contents, hours, order);
            if (rule is not null) errors.Add(rule + ".");
            int? id = null;
            var idText = Cell(row, columns, "IdCapacidade");
            if (!string.IsNullOrEmpty(idText))
            {
                if (int.TryParse(idText, out var parsedId) && parsedId > 0) id = parsedId;
                else errors.Add("IdCapacidade inválido.");
            }
            var identity = id.HasValue ? $"id:{id}" : $"{unit?.Id}:{Key(description)}";
            if (!seen.Add(identity)) errors.Add("Capacidade repetida no arquivo.");
            if (unit is not null && !seenOrders.Add($"{unit.Id}:{order}"))
                errors.Add("Ordem da capacidade repetida no arquivo.");
            var existing = id.HasValue ? capabilities.FirstOrDefault(x => x.Id == id && x.CurricularUnitId == unit?.Id)
                : capabilities.FirstOrDefault(x => x.CurricularUnitId == unit?.Id && x.NormalizedDescription == Key(description));
            if (id.HasValue && existing is null) errors.Add("IdCapacidade não pertence à UC informada.");
            if (unit is not null && capabilities.Any(x => x.CurricularUnitId == unit.Id && x.Id != existing?.Id &&
                (x.Order == order || x.NormalizedDescription == Key(description))))
                errors.Add("A ordem ou descrição já pertence a outra capacidade desta UC.");
            if (errors.Count > 0)
            {
                plans.Add(Invalid(row.Line, description, errors));
                continue;
            }
            var changes = new List<string>();
            if (existing is null) changes.AddRange(["Capacidade", "Conteudos", "CargaHoraria", "Ordem"]);
            else
            {
                if (existing.Description != description) changes.Add("Capacidade");
                if (existing.Contents != contents) changes.Add("Conteudos");
                if (existing.RequiredHours != hours) changes.Add("CargaHoraria");
                if (existing.Order != order) changes.Add("Ordem");
            }
            var target = existing ?? new CurricularCapability { CurricularUnitId = unit!.Id };
            var state = existing is null ? "novo" : JsonSerializer.Serialize(new
            { existing.Id, existing.Description, existing.Contents, existing.RequiredHours, existing.Order });
            Action apply = () =>
            {
                if (existing is null) _db.CurricularCapabilities.Add(target);
                target.Description = description;
                target.NormalizedDescription = Key(description);
                target.Contents = contents;
                target.RequiredHours = hours;
                target.Order = order;
            };
            plans.Add(Valid(row.Line, description, existing is null, changes, state, apply,
                () => target.Id.ToString(CultureInfo.InvariantCulture)));
        }
        return plans;
    }

    private static RowPlan Invalid(int line, string identifier, IReadOnlyList<string> errors) =>
        new(new ImportRowPreview(line, identifier, errors.Any(x => x.Contains("repetid", StringComparison.OrdinalIgnoreCase))
            ? ImportRowStatus.Duplicado : ImportRowStatus.Invalido, [], errors), "", null, null);

    private static RowPlan Valid(int line, string identifier, bool isNew, IReadOnlyList<string> changes,
        string state, Action apply, Func<string> entityId) =>
        new(new ImportRowPreview(line, identifier, changes.Count == 0 ? ImportRowStatus.SemAlteracao :
            isNew ? ImportRowStatus.Novo : ImportRowStatus.Atualizacao, changes, []),
            state, changes.Count == 0 ? null : apply, entityId);

    private static string Cell(ImportTableRow row, Dictionary<string, int> columns, string name) =>
        columns.TryGetValue(name, out var index) && index < row.Values.Length
            ? row.Values[index].Trim() : "";

    private static string Key(string value) => PedagogicalCatalogRules.NormalizeKey(value);

    private static int PositiveInt(string value, string name, List<string> errors)
    {
        if (int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number > 0)
            return number;
        errors.Add($"{name} deve ser um número inteiro positivo.");
        return 0;
    }

    private static decimal Hours(string value, List<string> errors)
    {
        if ((decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var hours) ||
            decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.GetCultureInfo("pt-BR"), out hours)) &&
            PedagogicalCatalogRules.ValidateHours(hours) is null) return hours;
        errors.Add("CargaHoraria inválida.");
        return 0;
    }

    private async Task<List<RowPlan>> AnalyzeRoomsAsync(IReadOnlyList<ImportTableRow> rows,
        Dictionary<string, int> columns)
    {
        var codes = rows.Select(row => Key(Cell(row, columns, "Codigo"))).Distinct().ToArray();
        var names = rows.Select(row => Key(Cell(row, columns, "Nome"))).Distinct().ToArray();
        var ids = rows.Select(row => int.TryParse(Cell(row, columns, "IdAmbiente"), out var id) ? id : 0)
            .Where(id => id > 0).Distinct().ToArray();
        var rooms = await _db.Rooms.Where(x => codes.Contains(x.NormalizedCode!) || ids.Contains(x.Id) ||
            (x.NormalizedCode == null && names.Contains(x.Name.Trim().ToUpper()))).ToListAsync();
        var seenCodes = new HashSet<string>(StringComparer.Ordinal);
        var seenIds = new HashSet<int>();
        var plans = new List<RowPlan>();
        foreach (var row in rows)
        {
            var errors = new List<string>();
            var code = Cell(row, columns, "Codigo");
            var key = Key(code);
            var name = Cell(row, columns, "Nome");
            var location = Cell(row, columns, "Localizacao");
            var purpose = Cell(row, columns, "Finalidade");
            if (code.Length is < 1 or > 30) errors.Add("Codigo é obrigatório e deve ter até 30 caracteres.");
            if (name.Length is < 1 or > 120) errors.Add("Nome é obrigatório e deve ter até 120 caracteres.");
            if (location.Length > 160) errors.Add("Localizacao deve ter até 160 caracteres.");
            if (purpose.Length > 350) errors.Add("Finalidade deve ter até 350 caracteres.");
            if (!TryRoomKind(Cell(row, columns, "Tipo"), out var kind) ||
                !Enum.IsDefined(kind)) errors.Add("Tipo de ambiente inválido.");
            var seats = PositiveInt(Cell(row, columns, "CapacidadeAlunos"), "CapacidadeAlunos", errors);
            var desks = PositiveInt(Cell(row, columns, "Carteiras"), "Carteiras", errors);
            if (seats > 1000 || desks > 1000) errors.Add("CapacidadeAlunos e Carteiras devem ser até 1.000.");
            var idText = Cell(row, columns, "IdAmbiente");
            int? id = null;
            if (idText.Length > 0)
            {
                if (int.TryParse(idText, out var value) && value > 0) id = value;
                else errors.Add("IdAmbiente inválido.");
            }
            if (!seenCodes.Add(key) || (id.HasValue && !seenIds.Add(id.Value)))
                errors.Add("Ambiente repetido no arquivo.");
            var byCode = rooms.FirstOrDefault(x => x.NormalizedCode == key);
            var byId = id.HasValue ? rooms.FirstOrDefault(x => x.Id == id) : null;
            if (id.HasValue && byId is null) errors.Add("IdAmbiente não cadastrado.");
            if (byCode is not null && byId is not null && byCode.Id != byId.Id)
                errors.Add("Codigo e IdAmbiente identificam ambientes diferentes.");
            var existing = byCode ?? byId;
            if (existing is null && rooms.Any(x => x.NormalizedCode == null &&
                Key(x.Name) == Key(name)))
                errors.Add("Já existe ambiente com este nome e sem código. Informe IdAmbiente para vinculá-lo.");
            if (existing?.NormalizedCode is not null && existing.NormalizedCode != key)
                errors.Add("O ambiente já possui outro código; revise a identificação.");
            if (existing is null && id.HasValue) errors.Add("IdAmbiente não cadastrado.");
            var projector = OptionalBoolean(Cell(row, columns, "Projetor"), "Projetor", errors);
            var computer = OptionalBoolean(Cell(row, columns, "ComputadorDocente"), "ComputadorDocente", errors);
            var internet = OptionalBoolean(Cell(row, columns, "Internet"), "Internet", errors);
            if (existing is null && (projector is null || computer is null || internet is null))
                errors.Add("Informe Projetor, ComputadorDocente e Internet para ambiente novo.");
            if (errors.Count > 0) { plans.Add(Invalid(row.Line, code, errors)); continue; }
            var target = existing ?? new Room { Active = true };
            var changes = new List<string>();
            if (existing is null) changes.AddRange(["Codigo", "Nome", "Tipo", "CapacidadeAlunos", "Carteiras"]);
            else
            {
                if (existing.Code != code) changes.Add("Codigo");
                if (existing.Name != name) changes.Add("Nome");
                if (existing.Kind != kind) changes.Add("Tipo");
                if (existing.Seats != seats) changes.Add("CapacidadeAlunos");
                if (existing.Desks != desks) changes.Add("Carteiras");
            }
            if ((existing is null && location.Length > 0) ||
                (existing is not null && location.Length > 0 && existing.Location != location)) changes.Add("Localizacao");
            if ((existing is null && purpose.Length > 0) ||
                (existing is not null && purpose.Length > 0 && existing.Purpose != purpose)) changes.Add("Finalidade");
            if (projector.HasValue && (existing is null || existing.HasProjector != projector)) changes.Add("Projetor");
            if (computer.HasValue && (existing is null || existing.HasTeacherComputer != computer)) changes.Add("ComputadorDocente");
            if (internet.HasValue && (existing is null || existing.HasInternet != internet)) changes.Add("Internet");
            var state = existing is null ? "novo" : JsonSerializer.Serialize(new
            { existing.Id, existing.Code, existing.Name, existing.Kind, existing.Seats, existing.Desks,
                existing.Location, existing.Purpose, existing.HasProjector, existing.HasTeacherComputer, existing.HasInternet });
            Action apply = () =>
            {
                if (existing is null) _db.Rooms.Add(target);
                target.Code = code; target.NormalizedCode = key;
                target.Name = name; target.Kind = kind; target.Seats = seats; target.Desks = desks;
                if (location.Length > 0) target.Location = location;
                if (purpose.Length > 0) target.Purpose = purpose;
                if (projector.HasValue) target.HasProjector = projector.Value;
                if (computer.HasValue) target.HasTeacherComputer = computer.Value;
                if (internet.HasValue) target.HasInternet = internet.Value;
            };
            plans.Add(Valid(row.Line, code, existing is null, changes, state, apply,
                () => target.Id.ToString(CultureInfo.InvariantCulture)));
        }
        return plans;
    }

    private async Task<List<RowPlan>> AnalyzeResourcesAsync(IReadOnlyList<ImportTableRow> rows,
        Dictionary<string, int> columns)
    {
        var codes = rows.Select(row => Key(Cell(row, columns, "CodigoAmbiente"))).Distinct().ToArray();
        var rooms = await _db.Rooms.Where(x => codes.Contains(x.NormalizedCode!)).ToListAsync();
        var roomIds = rooms.Select(x => x.Id).ToArray();
        var resources = await _db.RoomResources.Where(x => roomIds.Contains(x.RoomId)).ToListAsync();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var plans = new List<RowPlan>();
        foreach (var row in rows)
        {
            var errors = new List<string>();
            var code = Cell(row, columns, "CodigoAmbiente");
            var room = rooms.FirstOrDefault(x => x.NormalizedCode == Key(code));
            if (room is null) errors.Add("Ambiente não cadastrado pelo código informado.");
            var name = Cell(row, columns, "Recurso");
            var type = Cell(row, columns, "Categoria");
            if (name.Length is < 1 or > 120) errors.Add("Recurso é obrigatório e deve ter até 120 caracteres.");
            if (type.Length is < 1 or > 80) errors.Add("Categoria é obrigatória e deve ter até 80 caracteres.");
            var quantity = NonNegativeInt(Cell(row, columns, "Quantidade"), "Quantidade", errors);
            if (quantity > 100000) errors.Add("Quantidade deve ser até 100.000.");
            var operational = NullableInt(Cell(row, columns, "QuantidadeOperacional"), "QuantidadeOperacional", errors);
            var voltage = NullableInt(Cell(row, columns, "Voltagem"), "Voltagem", errors);
            if (voltage is not null && voltage is < 1 or > 1000) errors.Add("Voltagem deve estar entre 1 e 1.000.");
            var description = Cell(row, columns, "Descricao");
            var condition = Cell(row, columns, "Conservacao");
            var details = Cell(row, columns, "Especificacao");
            if (description.Length > 500 || condition.Length > 80 || details.Length > 2000)
                errors.Add("Descrição, conservação ou especificação excede o limite do cadastro.");
            var warranty = OptionalDate(Cell(row, columns, "GarantiaAte"), "GarantiaAte", errors);
            var license = OptionalDate(Cell(row, columns, "LicencaAte"), "LicencaAte", errors);
            var nameKey = InventoryKey(name);
            var typeKey = InventoryKey(type);
            var identity = $"{room?.Id}:{nameKey}:{typeKey}";
            if (!seen.Add(identity)) errors.Add("Recurso repetido no arquivo.");
            var existing = resources.FirstOrDefault(x => x.RoomId == room?.Id &&
                x.NormalizedName == nameKey && x.NormalizedType == typeKey);
            var finalOperational = operational ?? existing?.OperationalQuantity;
            if (finalOperational > quantity) errors.Add("QuantidadeOperacional excede Quantidade.");
            if (errors.Count > 0) { plans.Add(Invalid(row.Line, $"{code} · {name}", errors)); continue; }
            var target = existing ?? new RoomResource { RoomId = room!.Id };
            var changes = new List<string>();
            if (existing is null) changes.AddRange(["Recurso", "Categoria", "Quantidade"]);
            else
            {
                if (existing.Name != name) changes.Add("Recurso");
                if (existing.Type != type) changes.Add("Categoria");
                if (existing.Quantity != quantity) changes.Add("Quantidade");
            }
            if (operational.HasValue && (existing is null || existing.OperationalQuantity != operational)) changes.Add("QuantidadeOperacional");
            if (description.Length > 0 && (existing is null || existing.Description != description)) changes.Add("Descricao");
            if (condition.Length > 0 && (existing is null || existing.Condition != condition)) changes.Add("Conservacao");
            if (details.Length > 0 && (existing is null || existing.TechnicalDetails != details)) changes.Add("Especificacao");
            if (voltage.HasValue && (existing is null || existing.Voltage != voltage)) changes.Add("Voltagem");
            if (warranty.HasValue && (existing is null || existing.WarrantyExpiresOn != warranty)) changes.Add("GarantiaAte");
            if (license.HasValue && (existing is null || existing.LicenseExpiresOn != license)) changes.Add("LicencaAte");
            var state = existing is null ? "novo" : JsonSerializer.Serialize(new
            { existing.Id, existing.Name, existing.Type, existing.Quantity, existing.OperationalQuantity,
                existing.Description, existing.Condition, existing.TechnicalDetails, existing.Voltage,
                existing.WarrantyExpiresOn, existing.LicenseExpiresOn });
            Action apply = () =>
            {
                if (existing is null) _db.RoomResources.Add(target);
                target.Name = name; target.NormalizedName = nameKey;
                target.Type = type; target.NormalizedType = typeKey;
                target.Quantity = quantity;
                if (operational.HasValue) target.OperationalQuantity = operational;
                if (description.Length > 0) target.Description = description;
                if (condition.Length > 0) target.Condition = condition;
                if (details.Length > 0) target.TechnicalDetails = details;
                if (voltage.HasValue) target.Voltage = voltage;
                if (warranty.HasValue) target.WarrantyExpiresOn = warranty;
                if (license.HasValue) target.LicenseExpiresOn = license;
            };
            plans.Add(Valid(row.Line, $"{code} · {name}", existing is null, changes, state, apply,
                () => target.Id.ToString(CultureInfo.InvariantCulture)));
        }
        return plans;
    }

    private static string InventoryKey(string value) =>
        string.Join(' ', value.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();

    private static bool TryRoomKind(string value, out RoomKind kind)
    {
        var plain = new string(value.Normalize(NormalizationForm.FormD)
            .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            .ToArray());
        return Enum.TryParse(plain, true, out kind);
    }

    private static int NonNegativeInt(string value, string name, List<string> errors)
    {
        if (int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number >= 0)
            return number;
        errors.Add($"{name} deve ser um número inteiro não negativo.");
        return 0;
    }

    private static int? NullableInt(string value, string name, List<string> errors)
    {
        if (value.Length == 0) return null;
        if (int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number >= 0)
            return number;
        errors.Add($"{name} deve ser um número inteiro não negativo.");
        return null;
    }

    private static bool? OptionalBoolean(string value, string name, List<string> errors)
    {
        if (value.Length == 0) return null;
        if (value.Equals("sim", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("true", StringComparison.OrdinalIgnoreCase) || value == "1") return true;
        if (value.Equals("não", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("nao", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("false", StringComparison.OrdinalIgnoreCase) || value == "0") return false;
        errors.Add($"{name} deve ser Sim ou Não.");
        return null;
    }

    private static DateOnly? OptionalDate(string value, string name, List<string> errors)
    {
        if (value.Length == 0) return null;
        if (DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var date)) return date;
        if (double.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var serial) &&
            serial is >= 1 and <= 2958465)
            return DateOnly.FromDateTime(DateTime.FromOADate(serial));
        errors.Add($"{name} deve estar no formato AAAA-MM-DD.");
        return null;
    }

    private async Task<List<RowPlan>> AnalyzeTeachersAsync(IReadOnlyList<ImportTableRow> rows,
        Dictionary<string, int> columns)
    {
        var cpfs = rows.Select(row => CpfDigits(Cell(row, columns, "CPF"))).Distinct().ToArray();
        var ids = rows.Select(row => Cell(row, columns, "IdDocente")).Where(x => x.Length > 0).Distinct().ToArray();
        var teacherRoleId = await _db.Roles.Where(x => x.NormalizedName == "PROFESSOR")
            .Select(x => x.Id).FirstOrDefaultAsync();
        var teacherIds = teacherRoleId is null ? [] : await _db.UserRoles
            .Where(x => x.RoleId == teacherRoleId).Select(x => x.UserId).ToArrayAsync();
        var teachers = await _db.Users.Where(x => teacherIds.Contains(x.Id) &&
            (cpfs.Contains(x.Cpf!) || ids.Contains(x.Id))).ToListAsync();
        var cpfOwners = await _db.Users.Where(x => cpfs.Contains(x.Cpf!))
            .Select(x => new { x.Id, x.Cpf }).ToListAsync();
        var emails = rows.Select(row => Key(Cell(row, columns, "Email")))
            .Where(x => x.Length > 0).Distinct().ToArray();
        var emailOwners = await _db.Users.Where(x => emails.Contains(x.NormalizedEmail!) ||
            emails.Contains(x.NormalizedUserName!))
            .Select(x => new { x.Id, x.NormalizedEmail, x.NormalizedUserName }).ToListAsync();
        var courseCodes = rows.SelectMany(row => Parts(Cell(row, columns, "Cursos")))
            .Select(Key).Distinct().ToArray();
        var courses = await _db.Courses.Where(x => courseCodes.Contains(x.NormalizedCode)).ToListAsync();
        var unitCodes = rows.SelectMany(row => Parts(Cell(row, columns, "UCs")))
            .Select(x => x.Split(':').Last()).Select(Key).Distinct().ToArray();
        var units = await _db.CurricularUnits.Include(x => x.CourseModule).ThenInclude(x => x.Course)
            .Where(x => unitCodes.Contains(x.NormalizedCode)).ToListAsync();
        var capabilityIds = rows.SelectMany(row => Parts(Cell(row, columns, "Capacidades")))
            .Select(x => int.TryParse(x, out var id) ? id : 0).Where(x => x > 0).Distinct().ToArray();
        var capabilities = await _db.CurricularCapabilities
            .Where(x => capabilityIds.Contains(x.Id)).ToListAsync();
        var foundTeacherIds = teachers.Select(x => x.Id).ToArray();
        var courseLinks = await _db.TeacherCourseQualifications
            .Where(x => foundTeacherIds.Contains(x.TeacherId)).ToListAsync();
        var unitLinks = await _db.TeacherUnitQualifications
            .Where(x => foundTeacherIds.Contains(x.TeacherId)).ToListAsync();
        var capabilityLinks = await _db.TeacherCapabilityQualifications
            .Where(x => foundTeacherIds.Contains(x.TeacherId)).ToListAsync();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var seenTeacherIds = new HashSet<string>(StringComparer.Ordinal);
        var seenEmails = new HashSet<string>(StringComparer.Ordinal);
        var plans = new List<RowPlan>();
        foreach (var row in rows)
        {
            var errors = new List<string>();
            var cpf = CpfDigits(Cell(row, columns, "CPF"));
            var mask = cpf.Length == 11 ? $"***.***.***-{cpf[^2..]}" : "CPF inválido";
            if (!ValidCpf(Cell(row, columns, "CPF"))) errors.Add("CPF inválido.");
            if (!seen.Add(cpf)) errors.Add("CPF repetido no arquivo.");
            var name = Cell(row, columns, "Nome");
            if (name.Length is < 1 or > 120) errors.Add("Nome é obrigatório e deve ter até 120 caracteres.");
            var email = Cell(row, columns, "Email");
            if (email.Length > 0 && (email.Length > 256 || !MailAddress.TryCreate(email, out var parsedEmail) ||
                parsedEmail.Address != email)) errors.Add("Email inválido.");
            var education = Cell(row, columns, "Formacao");
            var skills = Cell(row, columns, "Habilidades");
            var knowledge = Cell(row, columns, "Conhecimentos");
            if (education.Length > 2000 || skills.Length > 2000 || knowledge.Length > 2000)
                errors.Add("Formacao, Habilidades ou Conhecimentos excedem 2.000 caracteres.");
            var byCpf = teachers.FirstOrDefault(x => x.Cpf == cpf);
            var byId = teachers.FirstOrDefault(x => x.Id == Cell(row, columns, "IdDocente"));
            if (byCpf is not null && byId is not null && byCpf.Id != byId.Id)
                errors.Add("CPF e IdDocente identificam docentes diferentes.");
            var teacher = byCpf ?? byId;
            if (teacher is not null && !seenTeacherIds.Add(teacher.Id))
                errors.Add("Docente repetido no arquivo.");
            if (teacher is null)
                errors.Add("Docente sem conta institucional vinculada. Cadastre a conta pelo fluxo atual e informe IdDocente para vincular o CPF.");
            if (teacher?.Cpf is not null && teacher.Cpf != cpf)
                errors.Add("O docente já possui outro CPF vinculado.");
            if (cpfOwners.Any(x => x.Cpf == cpf && x.Id != teacher?.Id))
                errors.Add("CPF já vinculado a outra conta.");
            if (email.Length > 0 && !seenEmails.Add(Key(email)))
                errors.Add("Email repetido no arquivo.");
            if (email.Length > 0 && emailOwners.Any(x =>
                (x.NormalizedEmail == Key(email) || x.NormalizedUserName == Key(email)) && x.Id != teacher?.Id))
                errors.Add("Email já utilizado por outra conta.");
            var requestedCourses = new List<Course>();
            foreach (var code in Parts(Cell(row, columns, "Cursos")))
            {
                var course = courses.FirstOrDefault(x => x.NormalizedCode == Key(code));
                if (course is null) errors.Add($"Curso {code} não cadastrado.");
                else if (!requestedCourses.Any(x => x.Id == course.Id)) requestedCourses.Add(course);
            }
            var requestedUnits = new List<CurricularUnit>();
            foreach (var item in Parts(Cell(row, columns, "UCs")))
            {
                var parts = item.Split(':');
                if (parts.Length != 3 || !int.TryParse(parts[1], out var moduleOrder))
                { errors.Add($"UC {item}: use CodigoCurso:OrdemModulo:CodigoUC."); continue; }
                var unit = units.FirstOrDefault(x => x.NormalizedCode == Key(parts[2]) &&
                    x.CourseModule.Order == moduleOrder && x.CourseModule.Course.NormalizedCode == Key(parts[0]));
                if (unit is null) errors.Add($"UC {item} não cadastrada no curso e módulo informados.");
                else if (!requestedUnits.Any(x => x.Id == unit.Id)) requestedUnits.Add(unit);
            }
            var requestedCapabilities = new List<CurricularCapability>();
            foreach (var item in Parts(Cell(row, columns, "Capacidades")))
            {
                if (!int.TryParse(item, out var capabilityId) ||
                    capabilities.FirstOrDefault(x => x.Id == capabilityId) is not { } capability)
                    errors.Add($"Capacidade {item} não cadastrada.");
                else if (!requestedCapabilities.Any(x => x.Id == capability.Id)) requestedCapabilities.Add(capability);
            }
            if (teacher is not null)
                foreach (var unit in requestedUnits)
                    if (!requestedCourses.Any(x => x.Id == unit.CourseModule.CourseId) &&
                        !courseLinks.Any(x => x.TeacherId == teacher.Id && x.CourseId == unit.CourseModule.CourseId))
                        errors.Add($"Habilite o docente no curso {unit.CourseModule.Course.Code} antes da UC {unit.Code}.");
            if (errors.Count > 0) { plans.Add(Invalid(row.Line, mask, errors)); continue; }
            var changes = new List<string>();
            if (teacher!.Cpf is null) changes.Add("CPF vinculado");
            if (teacher.DisplayName != name) changes.Add("Nome");
            if (email.Length > 0 && teacher.Email != email) changes.Add("Email");
            if (education.Length > 0 && teacher.Education != education) changes.Add("Formacao");
            if (skills.Length > 0 && teacher.TechnicalSkills != skills) changes.Add("Habilidades");
            if (knowledge.Length > 0 && teacher.ProfessionalKnowledge != knowledge) changes.Add("Conhecimentos");
            var newCourses = requestedCourses.Where(x => !courseLinks.Any(link =>
                link.TeacherId == teacher.Id && link.CourseId == x.Id)).ToArray();
            var newUnits = requestedUnits.Where(x => !unitLinks.Any(link =>
                link.TeacherId == teacher.Id && link.CurricularUnitId == x.Id)).ToArray();
            var newCapabilities = requestedCapabilities.Where(x => !capabilityLinks.Any(link =>
                link.TeacherId == teacher.Id && link.CurricularCapabilityId == x.Id)).ToArray();
            if (newCourses.Length > 0) changes.Add("Cursos");
            if (newUnits.Length > 0) changes.Add("UCs");
            if (newCapabilities.Length > 0) changes.Add("Capacidades");
            var state = JsonSerializer.Serialize(new
            { teacher.Id, teacher.Cpf, teacher.DisplayName, teacher.Email, teacher.Education,
                teacher.TechnicalSkills, teacher.ProfessionalKnowledge,
                Courses = courseLinks.Where(x => x.TeacherId == teacher.Id).Select(x => x.CourseId).Order().ToArray(),
                Units = unitLinks.Where(x => x.TeacherId == teacher.Id).Select(x => x.CurricularUnitId).Order().ToArray(),
                Capabilities = capabilityLinks.Where(x => x.TeacherId == teacher.Id).Select(x => x.CurricularCapabilityId).Order().ToArray() });
            Action apply = () =>
            {
                teacher.Cpf = cpf;
                teacher.DisplayName = name;
                if (email.Length > 0 && teacher.Email != email)
                {
                    teacher.Email = email; teacher.NormalizedEmail = Key(email);
                    teacher.UserName = email; teacher.NormalizedUserName = Key(email);
                    teacher.SecurityStamp = Guid.NewGuid().ToString();
                }
                if (education.Length > 0) teacher.Education = education;
                if (skills.Length > 0) teacher.TechnicalSkills = skills;
                if (knowledge.Length > 0) teacher.ProfessionalKnowledge = knowledge;
                _db.TeacherCourseQualifications.AddRange(newCourses.Select(x =>
                    new TeacherCourseQualification { TeacherId = teacher.Id, CourseId = x.Id }));
                _db.TeacherUnitQualifications.AddRange(newUnits.Select(x =>
                    new TeacherUnitQualification { TeacherId = teacher.Id, CurricularUnitId = x.Id }));
                _db.TeacherCapabilityQualifications.AddRange(newCapabilities.Select(x =>
                    new TeacherCapabilityQualification { TeacherId = teacher.Id, CurricularCapabilityId = x.Id }));
            };
            plans.Add(Valid(row.Line, mask, false, changes, state, apply, () => teacher.Id));
        }
        return plans;
    }

    private static string[] Parts(string value) => value.Length == 0 ? [] :
        value.Split('|', StringSplitOptions.TrimEntries);

    private static string CpfDigits(string value) => new(value.Where(x => x is >= '0' and <= '9').ToArray());

    private static bool ValidCpf(string value)
    {
        if (value.Any(x => x is not (>= '0' and <= '9') and not ('.' or '-' or ' '))) return false;
        var digits = CpfDigits(value);
        if (digits.Length != 11 || digits.All(x => x == digits[0])) return false;
        for (var length = 9; length <= 10; length++)
        {
            var sum = 0;
            for (var index = 0; index < length; index++) sum += (digits[index] - '0') * (length + 1 - index);
            var check = (sum * 10) % 11;
            if (check == 10) check = 0;
            if (digits[length] - '0' != check) return false;
        }
        return true;
    }
}
