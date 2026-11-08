using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Homologacao;

public static class SyntheticFixture
{
    // Fixed synthetic dates, no CPF, occupations, bookings or production imports.
    public static void Add(AppDbContext db, AppUser firstTeacher, AppUser secondTeacher)
    {
        var first = new Semester { Name = "SG6-2027.1", StartDate = new(2027, 3, 1), EndDate = new(2027, 6, 30) };
        var second = new Semester { Name = "SG6-2027.2", StartDate = new(2027, 8, 2), EndDate = new(2027, 11, 30) };
        var morning = new SchoolShift { Name = "SG6-Manhã", StartsAt = new(8, 0), EndsAt = new(12, 0) };
        var afternoon = new SchoolShift { Name = "SG6-Tarde", StartsAt = new(13, 0), EndsAt = new(17, 0) };
        var software = new Software { Name = "SG6-CAD" };
        var course = new Course { Code = "SG6-C", NormalizedCode = "SG6-C", Name = "Curso SG6", NormalizedName = "CURSO SG6" };
        var module = new CourseModule { Course = course, Name = "Módulo SG6", NormalizedName = "MÓDULO SG6", Order = 1 };
        var unit = new CurricularUnit { CourseModule = module, Code = "SG6-UC", NormalizedCode = "SG6-UC",
            Name = "UC SG6", NormalizedName = "UC SG6", PlannedHours = 18 };
        var capabilities = new[] { 8m, 10m }.Select((hours, index) => new CurricularCapability
        {
            CurricularUnit = unit, Description = $"Capacidade SG6 {index + 1}", NormalizedDescription = $"CAPACIDADE SG6 {index + 1}",
            Contents = "Conteúdo exclusivamente fictício", RequiredHours = hours, Order = index + 1,
            EnvironmentRequirement = new CapabilityEnvironmentRequirement { RoomKind = RoomKind.Laboratorio,
                RequiredComputers = 20, MinRamGb = 16, ComputersCritical = true,
                Software = [new CapabilitySoftwareRequirement { Software = software, RequiredLicenses = 20, Critical = true }] }
        }).ToArray();
        var classes = new[] {
            new ClassGroup { Semester = first, Course = course, Name = "Turma SG6 A", Code = "SG6-A", NormalizedCode = "SG6-A", Students = 20 },
            new ClassGroup { Semester = first, Course = course, Name = "Turma SG6 B", Code = "SG6-B", NormalizedCode = "SG6-B", Students = 20 },
            new ClassGroup { Semester = second, Course = course, Name = "Turma SG6 C", Code = "SG6-C", NormalizedCode = "SG6-C", Students = 20 }
        };
        Room Lab(string code, int? operational, int? licenses, DateOnly? expiry) => new()
        {
            Code = code, NormalizedCode = code, Name = code, Location = "Bloco fictício SG6", Kind = RoomKind.Laboratorio,
            Seats = 25, Desks = 25, HasInternet = true, Active = true,
            ComputerGroups = [new ComputerGroup { Description = "Grupo SG6", Quantity = 25, OperationalQuantity = operational,
                RamGb = 16, Tier = HardwareTier.Alto, Processor = "CPU sintética", OperatingSystem = "SO sintético",
                Software = [new GroupSoftware { Software = software, InstalledQuantity = 25, LicenseQuantity = licenses,
                    LicenseExpiresOn = expiry, Version = "SG6" }] }],
            Resources = [new RoomResource { Name = "Bancada SG6", NormalizedName = "BANCADA SG6", Type = "Mobiliário",
                NormalizedType = "MOBILIÁRIO", Quantity = 20, OperationalQuantity = 20, Condition = "Fictício" }]
        };
        var rooms = new[] { Lab("SG6-LAB-VALIDO", 25, 25, new(2099, 12, 31)),
            Lab("SG6-LAB-VENCIDO", 25, 25, new(2020, 1, 1)), Lab("SG6-LAB-DESCONHECIDO", null, null, null) };
        db.AddRange(first, second, morning, afternoon);
        db.AddRange(capabilities);
        db.AddRange(classes);
        db.AddRange(rooms);
        foreach (var teacher in new[] { firstTeacher, secondTeacher })
        {
            db.TeacherUnitQualifications.Add(new TeacherUnitQualification { Teacher = teacher, CurricularUnit = unit });
            db.Assignments.Add(new TeachingAssignment { Teacher = teacher, ClassGroup = teacher == firstTeacher ? classes[0] : classes[1],
                CurricularUnit = unit, DisciplineName = unit.Name, Weekday = 1, MeetingsPerWeek = 1, PreferredShift = morning,
                NeedsStudentComputers = true, MinRamGb = 16 });
        }
        db.Assignments.Add(new TeachingAssignment { Teacher = firstTeacher, ClassGroup = classes[2], CurricularUnit = unit,
            DisciplineName = unit.Name, Weekday = 1, MeetingsPerWeek = 1, PreferredShift = morning });
        db.AcademicCalendarEvents.Add(new AcademicCalendarEvent { Semester = first, StartDate = new(2027, 3, 8),
            EndDate = new(2027, 3, 8), Kind = AcademicDayKind.Holiday, Description = "Feriado sintético SG6" });
        foreach (var semester in new[] { first, second })
            db.RoomOperatingShifts.Add(new RoomOperatingShift { Semester = semester, Room = rooms[0], Shift = morning, WeekdaysMask = 2 });
    }
}
