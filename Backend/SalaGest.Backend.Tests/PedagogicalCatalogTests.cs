using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public class PedagogicalCatalogTests
{
    [Fact]
    public void RequiredFieldsAndPositiveModuleOrderAreValidated()
    {
        Assert.NotNull(PedagogicalCatalogRules.ValidateCourse(" ", "Técnico em Automação", true));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCourse("AUT", " ", true));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCourse("AUT", "Técnico em Automação", null));
        Assert.NotNull(PedagogicalCatalogRules.ValidateModule("Módulo 1", 0));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCurricularUnit(" ", "Eletricidade"));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCurricularUnit("UC1", " "));
        Assert.Null(PedagogicalCatalogRules.ValidateCourse("AUT", "Técnico em Automação", false));
        Assert.Null(PedagogicalCatalogRules.ValidateModule("Módulo 1", 1));
        Assert.Null(PedagogicalCatalogRules.ValidateCurricularUnit("UC1", "Eletricidade"));
    }

    [Fact]
    public void TrimmedLengthLimitsAndKeysAreConsistent()
    {
        Assert.Null(PedagogicalCatalogRules.ValidateCourse($" {new string('A', 30)} ", new string('B', 160), true));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCourse(new string('A', 31), "Curso", true));
        Assert.NotNull(PedagogicalCatalogRules.ValidateModule(new string('M', 121), 1));
        Assert.NotNull(PedagogicalCatalogRules.ValidateCurricularUnit("UC", new string('N', 161)));
        Assert.Equal(PedagogicalCatalogRules.NormalizeKey(" UC 01 "),
            PedagogicalCatalogRules.NormalizeKey("uc 01"));
    }

    [Fact]
    public void ModelHasScopedUniqueIndexesAndRestrictiveRelationships()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=(local);Database=CatalogMetadataOnly;Trusted_Connection=True;")
            .Options);
        var course = db.Model.FindEntityType(typeof(Course))!;
        var module = db.Model.FindEntityType(typeof(CourseModule))!;
        var unit = db.Model.FindEntityType(typeof(CurricularUnit))!;

        Assert.Contains(course.GetIndexes(), x => x.IsUnique &&
            x.Properties.Select(p => p.Name).SequenceEqual(new[] { nameof(Course.NormalizedCode) }));
        Assert.Contains(course.GetIndexes(), x => x.IsUnique &&
            x.Properties.Select(p => p.Name).SequenceEqual(new[] { nameof(Course.NormalizedName) }));
        Assert.Contains(module.GetIndexes(), x => x.IsUnique &&
            x.Properties.Select(p => p.Name).SequenceEqual(new[] { nameof(CourseModule.CourseId), nameof(CourseModule.Order) }));
        Assert.Contains(module.GetIndexes(), x => x.IsUnique &&
            x.Properties.Select(p => p.Name).SequenceEqual(new[] { nameof(CourseModule.CourseId), nameof(CourseModule.NormalizedName) }));
        Assert.Contains(unit.GetIndexes(), x => x.IsUnique &&
            x.Properties.Select(p => p.Name).SequenceEqual(new[] { nameof(CurricularUnit.CourseModuleId), nameof(CurricularUnit.NormalizedCode) }));
        Assert.Contains(unit.GetIndexes(), x => x.IsUnique &&
            x.Properties.Select(p => p.Name).SequenceEqual(new[] { nameof(CurricularUnit.CourseModuleId), nameof(CurricularUnit.NormalizedName) }));
        Assert.All(module.GetForeignKeys(), fk => Assert.Equal(DeleteBehavior.Restrict, fk.DeleteBehavior));
        Assert.All(unit.GetForeignKeys(), fk => Assert.Equal(DeleteBehavior.Restrict, fk.DeleteBehavior));
    }
}
