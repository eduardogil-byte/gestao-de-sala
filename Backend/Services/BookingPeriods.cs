using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public static class BookingPeriods
{
    public static List<(DateTime Start, DateTime End)> Expand(BookingRequest booking)
    {
        var occurrences = new List<(DateTime Start, DateTime End)>();
        var initialDate = DateOnly.FromDateTime(booking.StartsAt);
        var finalDate = booking.Recurrence == BookingRecurrence.Nenhuma
            ? initialDate : booking.RepeatUntil ?? initialDate;
        var duration = booking.EndsAt - booking.StartsAt;
        for (var day = initialDate; day <= finalDate; day = day.AddDays(1))
        {
            if (booking.Recurrence == BookingRecurrence.Semanal)
            {
                var mask = booking.WeekdaysMask == 0 ? 1 << (int)initialDate.DayOfWeek : booking.WeekdaysMask;
                if ((mask & (1 << (int)day.DayOfWeek)) == 0) continue;
            }
            if (booking.Recurrence == BookingRecurrence.Diaria &&
                day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;
            var start = day.ToDateTime(TimeOnly.FromDateTime(booking.StartsAt));
            if (start < booking.StartsAt) continue;
            occurrences.Add((start, start + duration));
        }
        return occurrences;
    }

    public static string? ValidationError(DateTime startsAt, DateTime endsAt,
        BookingRecurrence recurrence, DateOnly? repeatUntil, int weekdaysMask = 0)
    {
        if (!ReservationRules.LocalTimeRange(startsAt, endsAt) || startsAt.Date != endsAt.Date)
            return "Reserva deve usar um único dia e turno completo, em horário local sem UTC";
        if (!Enum.IsDefined(recurrence)) return "Recorrência desconhecida";
        if (weekdaysMask < 0 || weekdaysMask > 127) return "Seleção de dias da semana inválida";
        if (recurrence == BookingRecurrence.Nenhuma)
            return repeatUntil is null && weekdaysMask == 0 ? null : "Sem recorrência, não envie repeatUntil nem weekdaysMask";
        if (recurrence != BookingRecurrence.Semanal && weekdaysMask != 0)
            return "A seleção de dias só funciona com recorrência Semanal";
        if (repeatUntil is null) return "Para repetição informe repeatUntil";
        var initialDate = DateOnly.FromDateTime(startsAt);
        if (repeatUntil.Value < initialDate || repeatUntil.Value.DayNumber - initialDate.DayNumber > 365)
            return "Data final de repetição deve estar nos 12 meses após o início";
        if (recurrence == BookingRecurrence.Diaria &&
            initialDate.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
            return "Recorrência diária começa de segunda a sexta";
        if (recurrence == BookingRecurrence.Semanal && weekdaysMask > 0 &&
            (weekdaysMask & (1 << (int)initialDate.DayOfWeek)) == 0)
            return "A seleção de dias deve incluir a data inicial";
        return null;
    }
}
