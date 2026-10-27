using SalaGest.Api.Contracts;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public static class AcademicCalendarRules
{
    public static CalendarPreviewResponse Preview(Semester semester, DateOnly from, DateOnly to,
        int weekdaysMask, ClassGroup? classGroup, IReadOnlyList<AcademicCalendarEvent> events,
        IReadOnlyList<ClassCalendarException> exceptions, int? requiredMeetings = null)
    {
        if (from > to || to.DayNumber - from.DayNumber > 370 || weekdaysMask is < 0 or > 127)
            throw new ArgumentOutOfRangeException(nameof(from), "Intervalo ou dias da semana inválidos");
        var dates = new List<CalendarDateResult>();
        for (var date = from; ; date = date.AddDays(1))
        {
            if ((weekdaysMask & (1 << (int)date.DayOfWeek)) != 0)
                dates.Add(Resolve(semester, date, classGroup, events, exceptions));
            if (date == to) break;
        }
        var presential = dates.Count(x => x.CountsAsPresential);
        var ead = dates.Count(x => x.Kind == AcademicDayKind.Ead);
        return new CalendarPreviewResponse(semester.Id, classGroup?.Id, from, to,
            weekdaysMask, dates, presential, ead, dates.Count - presential - ead,
            requiredMeetings, requiredMeetings is int required ? Math.Max(0, required - presential) : null);
    }

    private static CalendarDateResult Resolve(Semester semester, DateOnly date,
        ClassGroup? classGroup, IReadOnlyList<AcademicCalendarEvent> events,
        IReadOnlyList<ClassCalendarException> exceptions)
    {
        if (date < semester.StartDate || date > semester.EndDate)
            return new(date, AcademicDayKind.NonTeaching, false, "Fora do semestre");
        var institutional = events.FirstOrDefault(x => x.StartDate <= date && x.EndDate >= date);
        if (institutional?.Kind is AcademicDayKind.Holiday or AcademicDayKind.Recess or
            AcademicDayKind.Planning or AcademicDayKind.NonTeaching)
            return new(date, institutional.Kind, false, institutional.Description);
        var specific = exceptions.FirstOrDefault(x => x.Date == date);
        if (specific?.Kind == AcademicDayKind.NonTeaching)
            return new(date, AcademicDayKind.NonTeaching, false, specific.Description);
        if (institutional?.Kind == AcademicDayKind.Ead)
            return new(date, AcademicDayKind.Ead, false, institutional.Description);
        if (specific is not null)
            return new(date, specific.Kind, specific.Kind == AcademicDayKind.Presential,
                specific.Description);
        if (institutional?.Kind == AcademicDayKind.Presential)
            return new(date, AcademicDayKind.Presential, true, institutional.Description);
        if (classGroup?.EadWeekday == (int)date.DayOfWeek &&
            classGroup.EadStartDate <= date && date <= classGroup.EadEndDate)
            return new(date, AcademicDayKind.Ead, false, "Padrão semanal EAD da turma");
        return new(date, AcademicDayKind.Presential, true, "Dia letivo presencial");
    }
}
