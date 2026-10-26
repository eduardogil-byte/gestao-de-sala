using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public static class ReservationRules
{
    public static async Task<string?> ConflictAsync(AppDbContext db, int roomId,
        DateTime start, DateTime end, string? teacherId, int? classId,
        int? exceptOccupationId = null)
    {
        var occupied = await db.Occupations.Where(o => o.StartsAt < end && start < o.EndsAt
            && o.CancelledAtUtc == null && (exceptOccupationId == null || o.Id != exceptOccupationId)).ToListAsync();
        var ids = occupied.Select(o => o.Id).ToArray();
        var loans = await db.Loans.Include(l => l.BookingRequest)
            .Where(l => l.Status == LoanStatus.Aprovado && ids.Contains(l.RoomOccupationId)).ToListAsync();

        foreach (var item in occupied)
        {
            if (item.RoomId == roomId) return "A sala já está ocupada nesse horário";
            var loan = loans.FirstOrDefault(l => l.RoomOccupationId == item.Id);
            var actualTeacherId = loan?.BorrowerId ?? item.TeacherId;
            var actualClassId = loan is null ? item.ClassGroupId : loan.BookingRequest.ClassGroupId;
            if (teacherId is not null && actualTeacherId == teacherId)
                return "O professor já possui uma aula ou reserva nesse horário";
            if (classId is not null && actualClassId == classId)
                return "A turma já possui uma aula ou reserva nesse horário";
        }
        return null;
    }

    public static bool LocalTimeRange(DateTime start, DateTime end)
        => start.Kind != DateTimeKind.Utc && end.Kind != DateTimeKind.Utc
           && start < end && end <= start.AddDays(1);
}
