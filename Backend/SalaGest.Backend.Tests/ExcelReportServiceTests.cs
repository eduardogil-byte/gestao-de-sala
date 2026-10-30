using ClosedXML.Excel;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class ExcelReportServiceTests
{
    [Fact]
    public async Task EmptyInventoryIsReportedInsteadOfProducingAnEmptyWorkbook()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db = new AppDbContext(options);
        await db.Database.EnsureCreatedAsync();
        var service = new ExcelReportService(db, new ConfigurationBuilder().AddInMemoryCollection().Build());

        await Assert.ThrowsAsync<ReportEmptyException>(() => service.GenerateAsync(
            InstitutionalReport.Ambientes, new ReportFilters(null, null, null, null, null, null), default));
    }

    [Fact]
    public async Task OccupationExportRejectsRangeAboveConfiguredLimit()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db = new AppDbContext(options);
        var service = new ExcelReportService(db, new ConfigurationBuilder().AddInMemoryCollection().Build());

        await Assert.ThrowsAsync<ReportRequestException>(() => service.GenerateAsync(
            InstitutionalReport.Ocupacoes,
            new ReportFilters(null, null, null, new DateOnly(2026, 1, 1), new DateOnly(2027, 1, 10), null), default));
    }

    [Fact]
    public async Task RoomReportWritesUserTextAsTextAndIncludesInventorySheets()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using (var db = new AppDbContext(options))
        {
            await db.Database.EnsureCreatedAsync();
            db.Rooms.Add(new Room { Code = "LAB1", NormalizedCode = "LAB1", Name = "=1+1",
                Kind = RoomKind.Laboratorio, Seats = 20, Desks = 20 });
            await db.SaveChangesAsync();
        }
        await using var reportDb = new AppDbContext(options);
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var generated = await new ExcelReportService(reportDb, config)
            .GenerateAsync(InstitutionalReport.Ambientes, new ReportFilters(null, null, null, null, null, null), default);
        using var workbook = new XLWorkbook(new MemoryStream(generated.Content));
        Assert.Contains("Ambientes", workbook.Worksheets.Select(x => x.Name));
        Assert.Contains("Recursos", workbook.Worksheets.Select(x => x.Name));
        var name = workbook.Worksheet("Ambientes").Cell(5, 2);
        Assert.Equal("=1+1", name.GetString());
        Assert.Equal(XLDataType.Text, name.DataType);
        Assert.Null(name.FormulaA1?.Length > 0 ? name.FormulaA1 : null);
    }
}
