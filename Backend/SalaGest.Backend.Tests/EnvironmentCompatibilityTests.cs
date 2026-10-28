using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class EnvironmentCompatibilityTests
{
    private static readonly DateOnly Today = new(2026, 10, 28);

    [Fact]
    public void ComputersMustMeetRamSoftwareAndQuantityInTheSameGroup()
    {
        var requirement = ComputerRequirement(20, 16, 1, 20);
        var room = RoomWithGroups(
            Group(15, 16, 15, 1, 15, 20),
            Group(10, 8, 10, 1, 10, 10));
        var result = EnvironmentCompatibility.Evaluate(requirement, room, 25, Today);
        Assert.Equal("Partial", result.Classification);
        Assert.Contains(result.Findings, x => x.Requirement == "computers" && x.Detail.Contains("faltam 5"));

        room.ComputerGroups[0].Quantity = 20;
        room.ComputerGroups[0].OperationalQuantity = 20;
        room.ComputerGroups[0].Software[0].InstalledQuantity = 20;
        Assert.Equal("Compatible", EnvironmentCompatibility.Evaluate(requirement, room, 25, Today).Classification);
    }

    [Fact]
    public void MissingSoftwareAndInsufficientSeatsAreBlocking()
    {
        var requirement = ComputerRequirement(20, 16, 1);
        var room = RoomWithGroups(Group(20, 16, 20));
        Assert.Equal("Incompatible", EnvironmentCompatibility.Evaluate(requirement, room, 25, Today).Classification);
        room.ComputerGroups[0].Software.Add(new GroupSoftware { SoftwareId = 1, InstalledQuantity = 20 });
        room.Seats = 20;
        Assert.Contains(EnvironmentCompatibility.Evaluate(requirement, room, 25, Today).Findings,
            x => x.Requirement == "seats" && x.Status == "UnmetCritical");
    }

    [Fact]
    public void UnknownRamOperationalQuantityAndLicensesDoNotProveCompatibility()
    {
        var requirement = ComputerRequirement(20, 16, 1, 20);
        var group = Group(20, 0, null, 1, 20, null);
        var room = RoomWithGroups(group);
        var result = EnvironmentCompatibility.Evaluate(requirement, room, null, Today);
        Assert.Equal("Partial", result.Classification);
        Assert.Contains(result.Findings, x => x.Status == "Unknown");
        group.RamGb = 16;
        group.OperationalQuantity = 15;
        group.Software[0].LicenseQuantity = 15;
        result = EnvironmentCompatibility.Evaluate(requirement, room, null, Today);
        Assert.Equal("Incompatible", result.Classification);
        Assert.Contains(result.Findings, x => x.Requirement == "licenses:1" && x.Status == "UnmetCritical");
    }

    [Fact]
    public void PartialInstallationsOfDifferentSoftwareAreNotAssumedToOverlap()
    {
        var requirement = ComputerRequirement(10, 16, 1);
        requirement.Software.Add(new CapabilitySoftwareRequirement
        { SoftwareId = 2, Software = new Software { Id = 2, Name = "CAD" } });
        var group = Group(20, 16, 20, 1, 10);
        group.Software.Add(new GroupSoftware { SoftwareId = 2, InstalledQuantity = 10 });
        var result = EnvironmentCompatibility.Evaluate(requirement, RoomWithGroups(group), null, Today);
        Assert.Equal("Partial", result.Classification);
        Assert.Contains(result.Findings, x => x.Requirement == "computers" && x.Detail.Contains("comprovados: 0"));
    }

    [Fact]
    public void WorkshopResourcesUseOperationalQuantitiesAndCriticality()
    {
        var requirement = new CapabilityEnvironmentRequirement { RoomKind = RoomKind.Oficina };
        requirement.Resources.Add(new CapabilityResourceRequirement
        { Name = "Bancada", Type = "Mobiliário", NormalizedName = "BANCADA", NormalizedType = "MOBILIÁRIO", Quantity = 10 });
        requirement.Resources.Add(new CapabilityResourceRequirement
        { Name = "Torno", Type = "Máquina", NormalizedName = "TORNO", NormalizedType = "MÁQUINA", Quantity = 3, Critical = true });
        var room = new Room { Id = 1, Name = "Oficina", Kind = RoomKind.Oficina, Seats = 30,
            Resources = { new RoomResource { Name = "Bancada", NormalizedName = "BANCADA", NormalizedType = "MOBILIÁRIO", Quantity = 12, OperationalQuantity = 12 },
                new RoomResource { Name = "Torno", NormalizedName = "TORNO", NormalizedType = "MÁQUINA", Quantity = 3, OperationalQuantity = 2 } } };
        var result = EnvironmentCompatibility.Evaluate(requirement, room, null, Today);
        Assert.Equal("Incompatible", result.Classification);
        Assert.Contains(result.Findings, x => x.Requirement.Contains("Torno") && x.Status == "UnmetCritical");
        requirement.Resources[1].Critical = false;
        Assert.Equal("Partial", EnvironmentCompatibility.Evaluate(requirement, room, null, Today).Classification);
    }

    [Fact]
    public void UnregisteredRequirementsAreUnknownAndDoNotImplyCompatibility()
    {
        var result = EnvironmentCompatibility.Evaluate(null, new Room { Id = 1, Name = "Sala", Seats = 30 }, null, Today);
        Assert.Equal("Partial", result.Classification);
        Assert.Contains(result.Findings, x => x.Requirement == "requirements" && x.Status == "Unknown");
    }

    [Fact]
    public void ProjectorInventoryOperationalStateTakesPrecedenceOverLegacyFlag()
    {
        var requirement = new CapabilityEnvironmentRequirement { RequiresProjector = true };
        var room = new Room { Id = 1, Name = "Sala", HasProjector = true,
            Resources = { new RoomResource { NormalizedName = "PROJETOR", Quantity = 1, OperationalQuantity = 0 } } };
        Assert.Equal("Incompatible", EnvironmentCompatibility.Evaluate(requirement, room, null, Today).Classification);
        room.Resources[0].OperationalQuantity = null;
        Assert.Equal("Partial", EnvironmentCompatibility.Evaluate(requirement, room, null, Today).Classification);
    }

    private static CapabilityEnvironmentRequirement ComputerRequirement(int count, int ram, int softwareId,
        int? licenses = null) => new()
        {
            RoomKind = RoomKind.Laboratorio, RequiredComputers = count, MinRamGb = ram,
            Software = { new CapabilitySoftwareRequirement { SoftwareId = softwareId,
                Software = new Software { Id = softwareId, Name = "SolidWorks" }, RequiredLicenses = licenses } }
        };

    private static Room RoomWithGroups(params ComputerGroup[] groups) => new()
    { Id = 1, Name = "Laboratório", Kind = RoomKind.Laboratorio, Seats = 30, ComputerGroups = groups.ToList() };

    private static ComputerGroup Group(int quantity, int ram, int? operational,
        int? softwareId = null, int installed = 0, int? licenses = null)
    {
        var group = new ComputerGroup { Quantity = quantity, RamGb = ram, OperationalQuantity = operational };
        if (softwareId is int id)
            group.Software.Add(new GroupSoftware { SoftwareId = id, InstalledQuantity = installed,
                LicenseQuantity = licenses });
        return group;
    }
}
