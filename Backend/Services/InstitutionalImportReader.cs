using System.IO.Compression;
using System.Globalization;
using System.Text;
using System.Xml;
using ExcelDataReader;
using Microsoft.VisualBasic.FileIO;

namespace SalaGest.Api.Services;

public sealed record ImportTable(string[] Headers, IReadOnlyList<ImportTableRow> Rows);
public sealed record ImportTableRow(int Line, string[] Values);

public static class InstitutionalImportReader
{
    static InstitutionalImportReader() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    public const int MaxFileBytes = 2 * 1024 * 1024;
    public const int MaxRows = 1000;
    private const int MaxColumns = 30;
    private const long MaxExpandedBytes = 12 * 1024 * 1024;

    public static async Task<ImportTable> ReadAsync(IFormFile file, CancellationToken cancellationToken = default,
        int maxFileBytes = MaxFileBytes, int maxRows = MaxRows)
    {
        maxFileBytes = Math.Clamp(maxFileBytes, 1, MaxFileBytes);
        maxRows = Math.Clamp(maxRows, 1, MaxRows);
        if (file.Length <= 0 || file.Length > maxFileBytes)
            throw new ImportFileException($"O arquivo deve ter até {maxFileBytes / 1024} KB e não pode estar vazio.");
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension is not (".csv" or ".xlsx"))
            throw new ImportFileException("Envie um arquivo .csv ou .xlsx.");
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, cancellationToken);
        stream.Position = 0;
        try
        {
            return extension == ".csv" ? ReadCsv(stream, maxRows) : ReadXlsx(stream, maxRows);
        }
        catch (ImportFileException) { throw; }
        catch (Exception ex) when (ex is not OperationCanceledException and not OutOfMemoryException)
        {
            throw new ImportFileException("O arquivo está inválido ou não pôde ser lido.");
        }
    }

    private static ImportTable ReadCsv(Stream stream, int maxRows)
    {
        using var reader = new StreamReader(stream, new UTF8Encoding(false, true), detectEncodingFromByteOrderMarks: false,
            leaveOpen: true);
        var first = reader.ReadLine();
        if (first is null) throw new ImportFileException("O arquivo não contém cabeçalho.");
        var delimiter = DetectDelimiter(first);
        stream.Position = 0;
        reader.DiscardBufferedData();
        using var parser = new TextFieldParser(reader)
        {
            HasFieldsEnclosedInQuotes = true,
            TrimWhiteSpace = false
        };
        parser.SetDelimiters(delimiter.ToString());
        var headers = parser.ReadFields() ?? throw new ImportFileException("O arquivo não contém cabeçalho.");
        ValidateColumns(headers);
        var rows = new List<ImportTableRow>();
        var line = 1;
        while (!parser.EndOfData)
        {
            var values = parser.ReadFields() ?? [];
            line++;
            if (values.All(string.IsNullOrWhiteSpace)) continue;
            if (values.Length > MaxColumns) throw new ImportFileException("O arquivo possui colunas demais.");
            rows.Add(new ImportTableRow(line, values));
            if (rows.Count > maxRows) throw new ImportFileException($"O arquivo excede {maxRows} registros.");
        }
        return new ImportTable(headers, rows);
    }

    private static char DetectDelimiter(string header)
    {
        var comma = 0;
        var semicolon = 0;
        var quoted = false;
        foreach (var character in header)
        {
            if (character == '"') quoted = !quoted;
            if (quoted) continue;
            if (character == ',') comma++;
            if (character == ';') semicolon++;
        }
        if (comma == 0 && semicolon == 0) throw new ImportFileException("Use vírgula ou ponto e vírgula como separador.");
        return semicolon > comma ? ';' : ',';
    }

    private static ImportTable ReadXlsx(Stream stream, int maxRows)
    {
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true))
        {
            if (archive.Entries.Count > 100 || archive.Entries.Sum(e => e.Length) > MaxExpandedBytes)
                throw new ImportFileException("A planilha excede o limite de conteúdo permitido.");
            if (archive.Entries.Any(e => e.FullName.EndsWith("vbaProject.bin", StringComparison.OrdinalIgnoreCase)))
                throw new ImportFileException("Planilhas com macros não são aceitas.");
            foreach (var entry in archive.Entries.Where(e =>
                e.FullName.StartsWith("xl/worksheets/", StringComparison.OrdinalIgnoreCase) &&
                e.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)))
            {
                using var entryStream = entry.Open();
                using var xml = XmlReader.Create(entryStream, new XmlReaderSettings
                {
                    DtdProcessing = DtdProcessing.Prohibit,
                    XmlResolver = null,
                    MaxCharactersInDocument = MaxExpandedBytes
                });
                while (xml.Read())
                    if (xml.NodeType == XmlNodeType.Element && xml.LocalName == "f")
                        throw new ImportFileException("Fórmulas não são aceitas na planilha de importação.");
            }
        }
        stream.Position = 0;
        using var reader = ExcelReaderFactory.CreateOpenXmlReader(stream, new ExcelReaderConfiguration
        {
            LeaveOpen = true
        });
        string[]? headers = null;
        var rows = new List<ImportTableRow>();
        var line = 0;
        while (reader.Read())
        {
            line++;
            if (reader.FieldCount > MaxColumns) throw new ImportFileException("O arquivo possui colunas demais.");
            var values = Enumerable.Range(0, reader.FieldCount)
                .Select(index => CellText(reader.GetValue(index))).ToArray();
            if (values.All(string.IsNullOrWhiteSpace)) continue;
            if (headers is null)
            {
                headers = values;
                ValidateColumns(headers);
                continue;
            }
            rows.Add(new ImportTableRow(line, values));
            if (rows.Count > maxRows) throw new ImportFileException($"O arquivo excede {maxRows} registros.");
        }
        return headers is null ? throw new ImportFileException("O arquivo não contém cabeçalho.")
            : new ImportTable(headers, rows);
    }

    private static string CellText(object? value) => value switch
    {
        null => "",
        DateTime date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? ""
    };

    private static void ValidateColumns(string[] headers)
    {
        if (headers.Length is < 1 or > MaxColumns || headers.All(string.IsNullOrWhiteSpace))
            throw new ImportFileException("O arquivo não contém cabeçalho válido.");
    }
}

public sealed class ImportFileException(string message) : Exception(message);
