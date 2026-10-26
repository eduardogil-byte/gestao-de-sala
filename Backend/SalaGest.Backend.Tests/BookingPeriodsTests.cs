using SalaGest.Api.Models;
using SalaGest.Api.Services;
using Xunit;

namespace SalaGest.Backend.Tests;

public class BookingPeriodsTests
{
    [Fact]
    public void Weekly_MultipleDays_Respects_ChosenWeekdays_And_FinalDate()
    {
        var booking = new BookingRequest
        {
            StartsAt = new DateTime(2026, 10, 12, 8, 0, 0),
            EndsAt = new DateTime(2026, 10, 12, 12, 0, 0),
            Recurrence = BookingRecurrence.Semanal,
            RepeatUntil = new DateOnly(2026, 10, 21),
            WeekdaysMask = (1 << (int)DayOfWeek.Monday) | (1 << (int)DayOfWeek.Wednesday)
        };
        var dates = BookingPeriods.Expand(booking)
            .Select(p => DateOnly.FromDateTime(p.Start)).ToArray();
        Assert.Equal(new[]
        {
            new DateOnly(2026, 10, 12), new DateOnly(2026, 10, 14),
            new DateOnly(2026, 10, 19), new DateOnly(2026, 10, 21)
        }, dates);
        Assert.All(BookingPeriods.Expand(booking), period => Assert.Equal(TimeSpan.FromHours(4), period.End - period.Start));
    }

    [Fact]
    public void Weekly_Rejects_WeekdayMask_Without_InitialWeekday()
    {
        var err = BookingPeriods.ValidationError(new DateTime(2026, 10, 12, 8, 0, 0),
            new DateTime(2026, 10, 12, 12, 0, 0), BookingRecurrence.Semanal,
            new DateOnly(2026, 10, 30), 1 << (int)DayOfWeek.Friday);
        Assert.NotNull(err);
    }

    [Fact]
    public void Reservation_Rejects_SpanningMultipleDates()
    {
        var err = BookingPeriods.ValidationError(new DateTime(2026, 10, 12, 22, 0, 0),
            new DateTime(2026, 10, 13, 2, 0, 0), BookingRecurrence.Nenhuma, null);
        Assert.NotNull(err);
    }
}
