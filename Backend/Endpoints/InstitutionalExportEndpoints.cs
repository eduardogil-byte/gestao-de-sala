using SalaGest.Api.Services;
using SalaGest.Api.Contracts;
using SalaGest.Api.Models;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private static void MapInstitutionalExports(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/exports/{report}", async (string report, int? semesterId,
            int? secondSemesterId, int? roomId, int? shiftId, DateOnly? from, DateOnly? to, string? status,
            ExcelReportService service, CancellationToken cancellationToken) =>
        {
            if (!Enum.TryParse<InstitutionalReport>(report, true, out var kind) || !Enum.IsDefined(kind))
                return Error("Tipo de relatório inválido.");
            if (status is not null && (!Enum.TryParse<PlanProposalStatus>(status, true, out _) ||
                kind != InstitutionalReport.Planejamento)) return Error("Filtro de situação inválido para este relatório.");
            if (shiftId is not null && kind != InstitutionalReport.Ocupacoes)
                return Error("Filtro de turno inválido para este relatório.");
            try
            {
                var result = await service.GenerateAsync(kind,
                    new ReportFilters(semesterId, secondSemesterId, roomId, from, to, status, shiftId), cancellationToken);
                return Results.File(result.Content,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", result.FileName);
            }
            catch (ReportRequestException ex) { return Error(ex.Message); }
            catch (ReportEmptyException ex) { return Results.NotFound(new ApiError(ex.Message)); }
            catch (InvalidOperationException ex) { return Error(ex.Message); }
        }).RequireAuthorization("Admin").WithTags("Exportações institucionais");
    }
}
