namespace SalaGest.Api.Models;

public enum AcademicDayKind
{
    Presential = 1,
    Ead = 2,
    Holiday = 3,
    Recess = 4,
    Planning = 5,
    NonTeaching = 6
}

public sealed class AcademicCalendarEvent
{
    public int Id { get; set; }
    public int SemesterId { get; set; }
    public Semester Semester { get; set; } = null!;
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public AcademicDayKind Kind { get; set; }
    public string Description { get; set; } = "";
}

public sealed class ClassCalendarException
{
    public int ClassGroupId { get; set; }
    public ClassGroup ClassGroup { get; set; } = null!;
    public DateOnly Date { get; set; }
    public AcademicDayKind Kind { get; set; }
    public string Description { get; set; } = "";
}
