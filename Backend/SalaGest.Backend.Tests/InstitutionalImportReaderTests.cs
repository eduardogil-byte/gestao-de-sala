using System.IO.Compression;
using System.Text;
using Microsoft.AspNetCore.Http;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class InstitutionalImportReaderTests
{
    [Fact]
    public async Task CsvHandlesQuotedSeparatorsNewlinesAndUtf8()
    {
        var table = await InstitutionalImportReader.ReadAsync(File("dados.csv",
            Encoding.UTF8.GetBytes("Codigo;Nome\r\nLAB1;\"Oficina; elétrica\"\r\nLAB2;\"Sala\nmultimídia\"\r\n")));
        Assert.Equal(2, table.Rows.Count);
        Assert.Equal("Oficina; elétrica", table.Rows[0].Values[1]);
        Assert.Equal("Sala\nmultimídia", table.Rows[1].Values[1]);
    }

    [Fact]
    public async Task XlsxReadsSharedStringsAndRejectsFormulas()
    {
        var valid = Xlsx("<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"s\"><v>1</v></c></row>" +
            "<row r=\"2\"><c r=\"A2\" t=\"inlineStr\"><is><t>LAB1</t></is></c><c r=\"B2\"><v>30</v></c></row>");
        var table = await InstitutionalImportReader.ReadAsync(File("dados.xlsx", valid));
        Assert.Equal(new[] { "Codigo", "CapacidadeAlunos" }, table.Headers);
        Assert.Equal("LAB1", table.Rows[0].Values[0]);
        Assert.Equal("30", table.Rows[0].Values[1]);

        var formula = Xlsx("<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c></row>" +
            "<row r=\"2\"><c r=\"A2\"><f>1+1</f><v>2</v></c></row>");
        await Assert.ThrowsAsync<ImportFileException>(() =>
            InstitutionalImportReader.ReadAsync(File("formula.xlsx", formula)));
    }

    [Fact]
    public async Task EmptyAndUnsupportedFilesAreRejected()
    {
        await Assert.ThrowsAsync<ImportFileException>(() =>
            InstitutionalImportReader.ReadAsync(File("vazio.csv", [])));
        await Assert.ThrowsAsync<ImportFileException>(() =>
            InstitutionalImportReader.ReadAsync(File("arquivo.xls", [1, 2, 3])));
    }

    private static FormFile File(string name, byte[] bytes) =>
        new(new MemoryStream(bytes), 0, bytes.Length, "file", name);

    private static byte[] Xlsx(string rows)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            static void Write(ZipArchive zip, string path, string xml)
            {
                using var writer = new StreamWriter(zip.CreateEntry(path).Open(), Encoding.UTF8);
                writer.Write(xml);
            }
            Write(archive, "[Content_Types].xml",
                "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
                "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
                "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" +
                "<Override PartName=\"/xl/sharedStrings.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml\"/>" +
                "</Types>");
            Write(archive, "_rels/.rels",
                "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>" +
                "</Relationships>");
            Write(archive, "xl/workbook.xml",
                "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" " +
                "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
                "<sheets><sheet name=\"Dados\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
            Write(archive, "xl/_rels/workbook.xml.rels",
                "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>" +
                "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings\" Target=\"sharedStrings.xml\"/>" +
                "</Relationships>");
            Write(archive, "xl/sharedStrings.xml",
                "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" count=\"2\" uniqueCount=\"2\">" +
                "<si><t>Codigo</t></si><si><t>CapacidadeAlunos</t></si></sst>");
            Write(archive, "xl/worksheets/sheet1.xml",
                "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
                "<sheetData>" + rows + "</sheetData></worksheet>");
        }
        return stream.ToArray();
    }
}
