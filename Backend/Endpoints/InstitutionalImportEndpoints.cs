using System.Data;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private const int ImportRequestLimit = InstitutionalImportReader.MaxFileBytes + 32768;

    private static void MapInstitutionalImport(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/imports").RequireAuthorization("Admin")
            .WithTags("Importação institucional");

        api.MapGet("/template/{kind}", (string kind) =>
        {
            if (!TryKind(kind, out var parsed)) return Error("Tipo de cadastro inválido.");
            var headers = parsed switch
            {
                ImportKind.Docentes => "CPF,IdDocente,Nome,Email,Formacao,Habilidades,Conhecimentos,Cursos,UCs,Capacidades",
                ImportKind.Ambientes => "Codigo,IdAmbiente,Nome,Tipo,CapacidadeAlunos,Carteiras,Localizacao,Finalidade,Projetor,ComputadorDocente,Internet",
                ImportKind.Recursos => "CodigoAmbiente,Recurso,Categoria,Quantidade,QuantidadeOperacional,Descricao,Conservacao,Especificacao,Voltagem,GarantiaAte,LicencaAte",
                _ => "CodigoCurso,OrdemModulo,CodigoUC,IdCapacidade,Capacidade,Conteudos,CargaHoraria,Ordem"
            };
            return Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(headers + "\r\n")).ToArray(),
                "text/csv", $"modelo-{kind.ToLowerInvariant()}.csv");
        });

        api.MapPost("/preview", async (HttpRequest request, AppDbContext db, IConfiguration config,
            CancellationToken cancellationToken) =>
        {
            var parsed = await ParseRequestAsync(request, cancellationToken);
            if (parsed.Error is not null) return Error(parsed.Error);
            try
            {
                var table = await ReadImportTableAsync(parsed.File!, config, cancellationToken);
                var analysis = await new InstitutionalImportService(db)
                    .AnalyzeAsync(parsed.Kind, parsed.File!.FileName, table);
                return Results.Ok(analysis.Preview);
            }
            catch (ImportFileException ex) { return Error(ex.Message); }
        }).DisableAntiforgery().WithMetadata(new RequestSizeLimitAttribute(ImportRequestLimit));

        api.MapPost("/confirm", async (HttpRequest request, AppDbContext db, IConfiguration config,
            ClaimsPrincipal current, CancellationToken cancellationToken) =>
        {
            var parsed = await ParseRequestAsync(request, cancellationToken);
            if (parsed.Error is not null) return Error(parsed.Error);
            if (!request.Form.TryGetValue("token", out var token) || string.IsNullOrWhiteSpace(token))
                return Error("Analise o arquivo antes de confirmar.");
            var allowInvalid = request.Form.TryGetValue("allowInvalid", out var flag) && flag == "true";
            try
            {
                var table = await ReadImportTableAsync(parsed.File!, config, cancellationToken);
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable,
                    cancellationToken);
                var analysis = await new InstitutionalImportService(db)
                    .AnalyzeAsync(parsed.Kind, parsed.File!.FileName, table);
                if (!string.Equals(analysis.Preview.Token, token, StringComparison.Ordinal))
                    return Results.Conflict(new ApiError("Os dados mudaram desde a prévia. Analise o arquivo novamente."));
                if (analysis.Preview.InvalidCount + analysis.Preview.DuplicateCount > 0 && !allowInvalid)
                    return Results.Conflict(new ApiError("Confirme explicitamente que as linhas inválidas serão ignoradas."));
                var changed = analysis.Plans.Where(x => x.Apply is not null).ToArray();
                if (changed.Length == 0)
                    return Error("Não há registros válidos com alterações para importar.");
                foreach (var plan in changed) plan.Apply!();
                await db.SaveChangesAsync(cancellationToken);
                foreach (var plan in changed)
                    AuditTrail.Add(db, "InstitutionalImportRow", plan.EntityId!(),
                        plan.Preview.Status == ImportRowStatus.Novo ? "Criado" : "Alterado",
                        UserId(current), null,
                        new { Tipo = parsed.Kind.ToString(), Campos = plan.Preview.Changes });
                AuditTrail.Add(db, "InstitutionalImport", Guid.NewGuid().ToString("N"), "Confirmada",
                    UserId(current), null, new
                    {
                        Tipo = parsed.Kind.ToString(),
                        Criados = analysis.Preview.NewCount,
                        Atualizados = analysis.Preview.UpdateCount,
                        Ignorados = analysis.Preview.InvalidCount + analysis.Preview.DuplicateCount
                    });
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return Results.Ok(new ImportReport(parsed.Kind, analysis.Preview.Total,
                    analysis.Preview.NewCount, analysis.Preview.UpdateCount,
                    analysis.Preview.UnchangedCount,
                    analysis.Preview.InvalidCount + analysis.Preview.DuplicateCount,
                    analysis.Preview.Rows.Where(x => x.Status is ImportRowStatus.Invalido or ImportRowStatus.Duplicado)
                        .ToArray()));
            }
            catch (ImportFileException ex) { return Error(ex.Message); }
            catch (DbUpdateException)
            {
                return Results.Conflict(new ApiError("Não foi possível salvar o conjunto. Analise o arquivo novamente."));
            }
        }).DisableAntiforgery().WithMetadata(new RequestSizeLimitAttribute(ImportRequestLimit));
    }

    private static bool TryKind(string value, out ImportKind kind) =>
        Enum.TryParse(value, true, out kind) && Enum.IsDefined(kind);

    private static Task<ImportTable> ReadImportTableAsync(IFormFile file, IConfiguration config,
        CancellationToken cancellationToken) => InstitutionalImportReader.ReadAsync(file, cancellationToken,
            config.GetValue("Import:MaxFileBytes", InstitutionalImportReader.MaxFileBytes),
            config.GetValue("Import:MaxRows", InstitutionalImportReader.MaxRows));

    private static async Task<(ImportKind Kind, IFormFile? File, string? Error)> ParseRequestAsync(
        HttpRequest request, CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType || request.ContentLength > ImportRequestLimit)
            return (default, null, "Envie um arquivo .csv ou .xlsx de até 2 MB.");
        IFormCollection form;
        try { form = await request.ReadFormAsync(cancellationToken); }
        catch (InvalidDataException) { return (default, null, "O formulário ou arquivo é inválido."); }
        if (!TryKind(form["kind"].ToString(), out var kind))
            return (default, null, "Tipo de cadastro inválido.");
        var file = form.Files.GetFile("file");
        return file is null ? (kind, null, "Selecione um arquivo.") : (kind, file, null);
    }
}
