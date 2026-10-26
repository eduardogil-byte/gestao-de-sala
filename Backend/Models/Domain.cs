using Microsoft.AspNetCore.Identity;

namespace SalaGest.Api.Models;

public sealed class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = "";
}

public enum RoomKind { Comum = 1, Laboratorio = 2, Hibrida = 3 }
public enum HardwareTier { Basico = 1, Intermediario = 2, Alto = 3 }
public enum ScheduleStatus { Rascunho = 1, Publicada = 2, Arquivada = 3 }
public enum BookingStatus { Pendente = 1, Aprovada = 2, Rejeitada = 3 }
public enum BookingRecurrence { Nenhuma = 0, Diaria = 1, Semanal = 2 }
public enum LoanStatus { PendenteDono = 1, PendenteAdmin = 2, Aprovado = 3, Rejeitado = 4, AguardandoDestinatario = 5, AguardandoSituacaoTitular = 6 }
public enum ClassDayStatus { Letivo = 1, Ead = 2, NaoLetivo = 3 }
public enum OwnerClassDisposition { Ead = 1, NaoLetivo = 2, OutraSala = 3 }
public enum OccupationKind { Aula = 1, Avulsa = 2, Bloqueio = 3 }

public sealed class Room
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Location { get; set; } = "";
    public string Purpose { get; set; } = "";
    public RoomKind Kind { get; set; }
    public int Seats { get; set; }
    public int Desks { get; set; }
    public bool HasProjector { get; set; }
    public bool HasTeacherComputer { get; set; }
    public bool HasInternet { get; set; }
    public bool Active { get; set; } = true;
    public List<ComputerGroup> ComputerGroups { get; set; } = new();
}

public sealed class ComputerGroup
{
    public int Id { get; set; }
    public int RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public string Description { get; set; } = "";
    public int Quantity { get; set; }
    public int RamGb { get; set; }
    public HardwareTier Tier { get; set; }
    public bool DedicatedGpu { get; set; }
    public List<GroupSoftware> Software { get; set; } = new();
}

public sealed class Software
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

public sealed class GroupSoftware
{
    public int ComputerGroupId { get; set; }
    public ComputerGroup ComputerGroup { get; set; } = null!;
    public int SoftwareId { get; set; }
    public Software Software { get; set; } = null!;
    public int InstalledQuantity { get; set; }
}

public sealed class Semester
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
}

public sealed class SchoolShift
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public TimeOnly StartsAt { get; set; }
    public TimeOnly EndsAt { get; set; }
}

public sealed class ClassGroup
{
    public int Id { get; set; }
    public int SemesterId { get; set; }
    public Semester Semester { get; set; } = null!;
    public string Name { get; set; } = "";
    public int Students { get; set; }
}

public sealed class TeacherAvailability
{
    public int Id { get; set; }
    public string TeacherId { get; set; } = "";
    public AppUser Teacher { get; set; } = null!;
    public int Weekday { get; set; } // 1=segunda; 5=sexta
    public int ShiftId { get; set; }
    public SchoolShift Shift { get; set; } = null!;
}

public sealed class TeachingAssignment
{
    public int Id { get; set; }
    public int ClassGroupId { get; set; }
    public ClassGroup ClassGroup { get; set; } = null!;
    public string TeacherId { get; set; } = "";
    public AppUser Teacher { get; set; } = null!;
    public string DisciplineName { get; set; } = "";
    public int MeetingsPerWeek { get; set; } = 1;
    public int? PreferredShiftId { get; set; }
    public SchoolShift? PreferredShift { get; set; }
    public bool NeedsProjector { get; set; }
    public bool NeedsTeacherComputer { get; set; }
    public bool NeedsStudentComputers { get; set; }
    public HardwareTier MinTier { get; set; } = HardwareTier.Basico;
    public int MinRamGb { get; set; }
    public bool NeedsDedicatedGpu { get; set; }
    public string? LessonPlanLink { get; set; }
    public List<AssignmentSoftware> Software { get; set; } = new();
}

public sealed class AssignmentSoftware
{
    public int TeachingAssignmentId { get; set; }
    public TeachingAssignment Assignment { get; set; } = null!;
    public int SoftwareId { get; set; }
    public Software Software { get; set; } = null!;
}

public sealed class Schedule
{
    public int Id { get; set; }
    public int SemesterId { get; set; }
    public Semester Semester { get; set; } = null!;
    public ScheduleStatus Status { get; set; } = ScheduleStatus.Rascunho;
    public int UnallocatedMeetings { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<WeeklyClass> WeeklyClasses { get; set; } = new();
}

public sealed class WeeklyClass
{
    public int Id { get; set; }
    public int ScheduleId { get; set; }
    public Schedule Schedule { get; set; } = null!;
    public int AssignmentId { get; set; }
    public TeachingAssignment Assignment { get; set; } = null!;
    public int Weekday { get; set; }
    public int ShiftId { get; set; }
    public SchoolShift Shift { get; set; } = null!;
    public int RoomId { get; set; }
    public Room Room { get; set; } = null!;
}

public sealed class BookingRequest
{
    public int Id { get; set; }
    public string TeacherId { get; set; } = "";
    public AppUser Teacher { get; set; } = null!;
    public int? ClassGroupId { get; set; }
    public ClassGroup? ClassGroup { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public BookingRecurrence Recurrence { get; set; } = BookingRecurrence.Nenhuma;
    // 7 bits: 0=domingo, 1=segunda, ..., 6=sábado. Zero usa o dia inicial.
    public int WeekdaysMask { get; set; }
    public int StudentsPerComputer { get; set; } = 1;
    public int? RecurringEadWeekday { get; set; }
    public DateOnly? RepeatUntil { get; set; }
    public int Students { get; set; }
    public bool NeedsProjector { get; set; }
    public bool NeedsTeacherComputer { get; set; }
    public bool NeedsStudentComputers { get; set; }
    public HardwareTier MinTier { get; set; } = HardwareTier.Basico;
    public int MinRamGb { get; set; }
    public bool NeedsDedicatedGpu { get; set; }
    public string Reason { get; set; } = "";
    public string? LessonPlanLink { get; set; }
    public BookingStatus Status { get; set; } = BookingStatus.Pendente;
    public int? ApprovedRoomId { get; set; }
    public List<BookingSoftware> Software { get; set; } = new();
}

public sealed class BookingSoftware
{
    public int BookingRequestId { get; set; }
    public BookingRequest Booking { get; set; } = null!;
    public int SoftwareId { get; set; }
    public Software Software { get; set; } = null!;
}

public sealed class RoomOccupation
{
    public int Id { get; set; }
    public int RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public OccupationKind Kind { get; set; }
    public ClassDayStatus DayStatus { get; set; } = ClassDayStatus.Letivo;
    public DateTime? CancelledAtUtc { get; set; }
    public string? ChangedById { get; set; }
    public string? TeacherId { get; set; } // professor originalmente alocado
    public int? ClassGroupId { get; set; }
    public int? WeeklyClassId { get; set; }
    public int? BookingRequestId { get; set; }
    public string? Description { get; set; }
}

public sealed class RoomLoan
{
    public int Id { get; set; }
    public int RoomOccupationId { get; set; }
    public RoomOccupation RoomOccupation { get; set; } = null!;
    public int BookingRequestId { get; set; }
    public BookingRequest BookingRequest { get; set; } = null!;
    public string BorrowerId { get; set; } = "";
    public AppUser Borrower { get; set; } = null!;
    public string Reason { get; set; } = "";
    public LoanStatus Status { get; set; } = LoanStatus.PendenteDono;
    public bool OwnerConfirmsNotUsing { get; set; }
    public OwnerClassDisposition? OwnerDisposition { get; set; }
    public int? ReplacementOccupationId { get; set; }
    public DateTime RequestedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ApprovedAtUtc { get; set; }
}
