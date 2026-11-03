using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public class RoomCompatibilityTests
{
    [Fact]
    public void OperationalComputersAndValidLicensesLimitOrdinaryBookings()
    {
        var date = new DateOnly(2027, 3, 1);
        var group = new ComputerGroup { Quantity = 25, OperationalQuantity = 10,
            RamGb = 16, Tier = HardwareTier.Alto };
        group.Software.Add(new GroupSoftware { SoftwareId = 1, InstalledQuantity = 25,
            LicenseQuantity = 25, LicenseExpiresOn = new DateOnly(2027, 3, 31) });
        var room = new Room { Active = true, Seats = 20, ComputerGroups = [group] };
        var need = new RoomNeed(20, false, false, true, HardwareTier.Basico, [1], 0, false);
        group.OperationalQuantity = null;
        Assert.NotNull(RoomCompatibility.Incompatibility(room, need, date));
        group.OperationalQuantity = 10;
        Assert.NotNull(RoomCompatibility.Incompatibility(room, need, date));
        group.OperationalQuantity = 20;
        group.Software[0].LicenseQuantity = null;
        Assert.NotNull(RoomCompatibility.Incompatibility(room, need, date));
        group.Software[0].LicenseQuantity = 25;
        Assert.Null(RoomCompatibility.Incompatibility(room, need, date));
        group.Software[0].LicenseQuantity = 19;
        Assert.NotNull(RoomCompatibility.Incompatibility(room, need, date));
        group.Software[0].LicenseQuantity = 20;
        group.Software[0].LicenseExpiresOn = new DateOnly(2027, 2, 28);
        Assert.NotNull(RoomCompatibility.Incompatibility(room, need, date));
        group.Software[0].LicenseExpiresOn = date;
        Assert.Null(RoomCompatibility.Incompatibility(room, need, date));
        room.Seats = 19;
        Assert.Equal("Capacidade de alunos insuficiente", RoomCompatibility.Incompatibility(room, need, date));
    }

    [Fact]
    public void TwoStudentsPerComputer_AcceptsThirteenComputersForTwentyFiveStudents()
    {
        var room = new Room
        {
            Active = true,
            Seats = 25,
            ComputerGroups = new List<ComputerGroup>
            {
                new ComputerGroup { Quantity = 13, OperationalQuantity = 13, RamGb = 16, Tier = HardwareTier.Alto }
            }
        };
        var need = new RoomNeed(25, false, false, true, HardwareTier.Intermediario,
            Array.Empty<int>(), 8, false, 2);
        Assert.Null(RoomCompatibility.Incompatibility(room, need));
        room.ComputerGroups[0].Quantity = 12;
        room.ComputerGroups[0].OperationalQuantity = 12;
        Assert.NotNull(RoomCompatibility.Incompatibility(room, need));
    }

    [Fact]
    public void PhysicalCapacityAndPcQuantityAreDifferentChecks()
    {
        var room = new Room
        {
            Active = true,
            Seats = 20,
            ComputerGroups = new List<ComputerGroup>
            {
                new ComputerGroup { Quantity = 30, RamGb = 16, Tier = HardwareTier.Alto }
            }
        };
        var need = new RoomNeed(25, false, false, true, HardwareTier.Basico,
            Array.Empty<int>(), 0, false);
        Assert.Equal("Capacidade de alunos insuficiente", RoomCompatibility.Incompatibility(room, need));
    }
}
