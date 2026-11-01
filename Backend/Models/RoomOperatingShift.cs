namespace SalaGest.Api.Models;

// Configuração explícita de oferta do ambiente; ausência significa capacidade desconhecida.
public sealed class RoomOperatingShift
{
    public int SemesterId { get; set; }
    public Semester Semester { get; set; } = null!;
    public int RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public int ShiftId { get; set; }
    public SchoolShift Shift { get; set; } = null!;
    // Bits 0..6 correspondem a domingo..sábado.
    public int WeekdaysMask { get; set; }
}
