using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapOccupancyIndicators(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/occupancy-indicators").RequireAuthorization("Admin")
            .WithTags("Indicadores de ocupação");
        api.MapGet("/semesters/{semesterId:int}", async (int semesterId, int? roomId,
            IConfiguration configuration, AppDbContext db) =>
        {
            var thresholds = Thresholds(configuration);
            if (thresholds is null) return Error("Limites de classificação inválidos na configuração");
            try
            {
                var result = await OccupancyIndicators.ForSemester(db, semesterId, roomId, thresholds);
                return result is null ? Results.NotFound() : Results.Ok(result);
            }
            catch (InvalidOperationException error) when (error.Message.Contains("100000 ocupações"))
            {
                return Error(error.Message);
            }
        });
        api.MapGet("/compare", async (int firstSemesterId, int secondSemesterId, int? roomId,
            IConfiguration configuration, AppDbContext db) =>
        {
            if (firstSemesterId == secondSemesterId) return Error("Selecione semestres distintos");
            var thresholds = Thresholds(configuration);
            if (thresholds is null) return Error("Limites de classificação inválidos na configuração");
            try
            {
                var first = await OccupancyIndicators.ForSemester(db, firstSemesterId, roomId, thresholds);
                var second = await OccupancyIndicators.ForSemester(db, secondSemesterId, roomId, thresholds);
                return first is null || second is null ? Results.NotFound() : Results.Ok(new { First = first, Second = second });
            }
            catch (InvalidOperationException error) when (error.Message.Contains("100000 ocupações"))
            {
                return Error(error.Message);
            }
        });

        var rooms = app.MapGroup("/api/semesters/{semesterId:int}/rooms/{roomId:int}/operating-shifts")
            .RequireAuthorization("Admin").WithTags("Indicadores de ocupação");
        rooms.MapGet("", async (int semesterId, int roomId, AppDbContext db) =>
        {
            if (!await db.Rooms.AnyAsync(r => r.Id == roomId) ||
                !await db.Semesters.AnyAsync(s => s.Id == semesterId)) return Results.NotFound();
            return Results.Ok(await db.RoomOperatingShifts.AsNoTracking()
                .Where(x => x.SemesterId == semesterId && x.RoomId == roomId).OrderBy(x => x.ShiftId)
                .Select(x => new { x.ShiftId, x.WeekdaysMask }).ToListAsync());
        });
        rooms.MapPut("", async (int semesterId, int roomId, List<OperatingShiftInput> input,
            ClaimsPrincipal currentUser, AppDbContext db) =>
        {
            if (!await db.Rooms.AnyAsync(r => r.Id == roomId) ||
                !await db.Semesters.AnyAsync(s => s.Id == semesterId)) return Results.NotFound();
            if (input.Count > 127 || input.Any(x => x.WeekdaysMask is < 1 or > 127) ||
                input.Select(x => x.ShiftId).Distinct().Count() != input.Count)
                return Error("Informe turnos distintos e dias da semana válidos");
            var ids = input.Select(x => x.ShiftId).ToArray();
            var shifts = await db.Shifts.AsNoTracking().Where(s => ids.Contains(s.Id)).ToListAsync();
            if (shifts.Count != input.Count || shifts.Any(s => s.EndsAt <= s.StartsAt))
                return Error("Turno não encontrado ou duração inválida");
            for (var i = 0; i < input.Count; i++)
                for (var j = i + 1; j < input.Count; j++)
                {
                    var a = shifts.Single(s => s.Id == input[i].ShiftId);
                    var b = shifts.Single(s => s.Id == input[j].ShiftId);
                    if ((input[i].WeekdaysMask & input[j].WeekdaysMask) != 0 &&
                        a.StartsAt < b.EndsAt && b.StartsAt < a.EndsAt)
                        return Error("Turnos oferecidos não podem se sobrepor nos mesmos dias");
                }
            await using var tx = await db.Database.BeginTransactionAsync();
            var current = await db.RoomOperatingShifts.Where(x => x.SemesterId == semesterId &&
                x.RoomId == roomId).ToListAsync();
            var before = current.OrderBy(x => x.ShiftId)
                .Select(x => new OperatingShiftInput(x.ShiftId, x.WeekdaysMask)).ToArray();
            foreach (var old in current)
            {
                var next = input.FirstOrDefault(x => x.ShiftId == old.ShiftId);
                if (next is null) db.RoomOperatingShifts.Remove(old);
                else old.WeekdaysMask = next.WeekdaysMask;
            }
            foreach (var next in input.Where(x => current.All(old => old.ShiftId != x.ShiftId)))
                db.RoomOperatingShifts.Add(new RoomOperatingShift
                { SemesterId = semesterId, RoomId = roomId, ShiftId = next.ShiftId,
                    WeekdaysMask = next.WeekdaysMask });
            AuditTrail.Add(db, "Room", roomId.ToString(), "Turnos oferecidos alterados", UserId(currentUser),
                new { SemesterId = semesterId, OperatingShifts = before },
                new { SemesterId = semesterId, OperatingShifts = input.OrderBy(x => x.ShiftId).ToArray() });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.NoContent();
        });
    }

    private static IndicatorThresholds? Thresholds(IConfiguration configuration)
    {
        var bottleneck = configuration.GetValue<decimal?>("OccupancyIndicators:BottleneckPercent") ?? 85m;
        var opportunity = configuration.GetValue<decimal?>("OccupancyIndicators:OpportunityPercent") ?? 40m;
        return opportunity >= 0 && bottleneck <= 100 && opportunity < bottleneck
            ? new IndicatorThresholds(bottleneck, opportunity) : null;
    }
}
