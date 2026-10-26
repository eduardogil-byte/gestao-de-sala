using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public class CurricularWorkloadTests
{
    [Fact]
    public void SummaryMarksUndefinedWorkloadWithoutBlockingCapabilities()
    {
        var result = PedagogicalCatalogRules.SummarizeWorkload(7, null, new[] { 2.25m, 1.5m }, 4m);
        Assert.Equal(3.75m, result.CapabilityHours);
        Assert.Equal(WorkloadStatus.Undefined, result.Status);
        Assert.Null(result.RequiredMeetings);
        Assert.Equal(0, result.MissingHours);
        Assert.Equal(0, result.ExcessHours);
    }

    [Theory]
    [InlineData("Balanced", 8, 4, 4, 0, 0, 2)]
    [InlineData("MissingHours", 10, 4, 4, 2, 0, 3)]
    [InlineData("ExcessHours", 7, 4, 4, 0, 1, 2)]
    public void SummaryComparesDecimalHoursAndRoundsMeetingsUp(string status,
        int planned, int first, int second, int missing, int excess, int meetings)
    {
        var result = PedagogicalCatalogRules.SummarizeWorkload(2, planned,
            new[] { (decimal)first, second }, 4m);
        Assert.Equal(Enum.Parse<WorkloadStatus>(status), result.Status);
        Assert.Equal(missing, result.MissingHours);
        Assert.Equal(excess, result.ExcessHours);
        Assert.Equal(meetings, result.RequiredMeetings);
    }

    [Fact]
    public void FractionalHoursUseExactDecimalArithmetic()
    {
        var result = PedagogicalCatalogRules.SummarizeWorkload(1, 3.75m,
            new[] { 1.25m, 2.50m }, 1.5m);
        Assert.Equal(WorkloadStatus.Balanced, result.Status);
        Assert.Equal(3.75m, result.CapabilityHours);
        Assert.Equal(3, result.RequiredMeetings);
    }

    [Fact]
    public void WorkloadAndCapabilityValidationRejectInvalidValues()
    {
        Assert.Null(PedagogicalCatalogRules.ValidateHours(null, allowUndefined: true));
        Assert.NotNull(PedagogicalCatalogRules.ValidateHours(null));
        Assert.NotNull(PedagogicalCatalogRules.ValidateHours(0));
        Assert.NotNull(PedagogicalCatalogRules.ValidateHours(1.234m));
        Assert.NotNull(PedagogicalCatalogRules.ValidateHours(PedagogicalCatalogRules.MaximumHours + 0.01m));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCapability(" ", "Conteúdo", 1m, 1));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCapability(new string('C', 301), "Conteúdo", 1m, 1));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCapability("Capacidade", " ", 1m, 1));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCapability("Capacidade", new string('C', 4001), 1m, 1));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCapability("Capacidade", "Conteúdo", 1m, 0));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCapability("Capacidade", "Conteúdo", -1m, 1));
        Assert.Null(PedagogicalCatalogRules.ValidateCapability("Capacidade", "Conteúdo", 1.25m, 1));
        Assert.Equal(PedagogicalCatalogRules.NormalizeKey(" Projetar circuitos "),
            PedagogicalCatalogRules.NormalizeKey("projetar circuitos"));
        Assert.False(PedagogicalCatalogRules.ValidHoursPerShift(0));
        Assert.False(PedagogicalCatalogRules.ValidHoursPerShift(24.01m));
        Assert.False(PedagogicalCatalogRules.ValidHoursPerShift(1.234m));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            PedagogicalCatalogRules.SummarizeWorkload(1, 4m, Array.Empty<decimal>(), 0));
    }

    [Fact]
    public void ModelKeepsOldUnitsValidAndProtectsCapabilityRelationships()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=(local);Database=CatalogMetadataOnly;Trusted_Connection=True;")
            .Options);
        var unit = db.Model.FindEntityType(typeof(CurricularUnit))!;
        var capability = db.Model.FindEntityType(typeof(CurricularCapability))!;
        var planned = unit.FindProperty(nameof(CurricularUnit.PlannedHours))!;
        Assert.True(planned.IsNullable);
        Assert.Equal(9, planned.GetPrecision());
        Assert.Equal(2, planned.GetScale());
        Assert.Contains(capability.GetIndexes(), x => x.IsUnique &&
            x.Properties.Select(p => p.Name).SequenceEqual(new[]
                { nameof(CurricularCapability.CurricularUnitId), nameof(CurricularCapability.Order) }));
        Assert.Contains(capability.GetIndexes(), x => x.IsUnique &&
            x.Properties.Select(p => p.Name).SequenceEqual(new[]
                { nameof(CurricularCapability.CurricularUnitId), nameof(CurricularCapability.NormalizedDescription) }));
        Assert.All(capability.GetForeignKeys(), fk => Assert.Equal(DeleteBehavior.Restrict, fk.DeleteBehavior));
    }
}
