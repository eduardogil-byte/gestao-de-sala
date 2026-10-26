using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public class RoomCompatibilityTests
{
    [Fact]
    public void TwoStudentsPerComputer_AcceptsThirteenComputersForTwentyFiveStudents()
    {
        var room = new Room
        {
            Active = true,
            Seats = 25,
            ComputerGroups = new List<ComputerGroup>
            {
                new ComputerGroup { Quantity = 13, RamGb = 16, Tier = HardwareTier.Alto }
            }
        };
        var need = new RoomNeed(25, false, false, true, HardwareTier.Intermediario,
            Array.Empty<int>(), 8, false, 2);
        Assert.Null(RoomCompatibility.Incompatibility(room, need));
        room.ComputerGroups[0].Quantity = 12;
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
