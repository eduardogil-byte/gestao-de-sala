using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public class BookingTechnicalExceptionTests
{
    [Fact]
    public void RamCanBeWaived_WithoutWaivingSeatsOrLicensingOrOperationalQuantity()
    {
        var room = new Room { Active = true, Seats = 25,
            ComputerGroups = { new ComputerGroup { Tier = HardwareTier.Basico, Quantity = 25, OperationalQuantity = 25, RamGb = 8 } } };
        var need = new RoomNeed(25, false, false, true, HardwareTier.Basico, [], 16, false);
        var date = new DateOnly(2027, 3, 3);
        var reasons = BookingTechnicalException.Common(room, need, date);
        Assert.NotEmpty(reasons!);
        Assert.Contains(reasons!, r => r.Contains("16 GB") && r.Contains("8 GB"));
        Assert.NotNull(RoomCompatibility.Incompatibility(room, need, date));
        Assert.Null(BookingTechnicalException.Common(room, need with { SoftwareIds = [42] }, date));
        Assert.Null(BookingTechnicalException.Common(room, need with { Students = 26 }, date));
        room.ComputerGroups.First().OperationalQuantity = null;
        Assert.Null(BookingTechnicalException.Common(room, need, date));
        room.Active = false;
        Assert.Null(BookingTechnicalException.Common(room, need, date));
    }
}
