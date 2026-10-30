using SalaGest.Api.Data;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapRoomOpportunities(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/opportunities/semesters/{semesterId:int}/rooms/{roomId:int}")
            .RequireAuthorization("Admin").WithTags("Oportunidades de ambientes");
        api.MapGet("/capabilities", async (int semesterId, int roomId, int students,
            int? courseId, AppDbContext db) =>
        {
            if (students is < 1 or > 1000 || courseId is <= 0)
                return Error("Informe entre 1 e 1000 alunos e um curso válido");
            try
            {
                var results = await RoomOpportunities.Capabilities(db, semesterId, roomId,
                    students, courseId);
                return results is null ? Results.NotFound() : Results.Ok(results);
            }
            catch (InvalidOperationException error) when (error.Message.Contains("200 capacidades"))
            { return Error(error.Message); }
        });
        api.MapGet("/capabilities/{capabilityId:int}/periods", async (int semesterId,
            int roomId, int capabilityId, int shiftId, int students, DateOnly from,
            DateOnly to, int weekdaysMask, IConfiguration configuration, AppDbContext db) =>
        {
            if (students is < 1 or > 1000 || weekdaysMask is < 1 or > 127 || from > to ||
                to.DayNumber - from.DayNumber > 370)
                return Error("Informe alunos, dias e período válidos de até 371 dias");
            var thresholds = Thresholds(configuration);
            if (thresholds is null) return Error("Limites de classificação inválidos na configuração");
            try
            {
                var result = await RoomOpportunities.Periods(db, semesterId, roomId,
                    capabilityId, shiftId, students, from, to, weekdaysMask, thresholds);
                return result is null ? Results.NotFound() : Results.Ok(result);
            }
            catch (ArgumentOutOfRangeException error) { return Error(error.Message); }
            catch (InvalidOperationException error) when (error.Message.Contains("10000 ocupações") ||
                error.Message.Contains("100000 ocupações") || error.Message.Contains("limite de encontros"))
            { return Error(error.Message); }
        });
    }
}
