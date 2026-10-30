namespace SalaGest.Api.Contracts;

public enum ImportKind { Docentes, Ambientes, Recursos, Capacidades }
public enum ImportRowStatus { Novo, Atualizacao, SemAlteracao, Invalido, Duplicado }

public sealed record ImportRowPreview(int Line, string Identifier, ImportRowStatus Status,
    IReadOnlyList<string> Changes, IReadOnlyList<string> Errors);

public sealed record ImportPreview(ImportKind Kind, string FileName, int Total, int NewCount,
    int UpdateCount, int UnchangedCount, int InvalidCount, int DuplicateCount,
    string Token, IReadOnlyList<ImportRowPreview> Rows);

public sealed record ImportReport(ImportKind Kind, int Total, int Created, int Updated,
    int Unchanged, int Skipped, IReadOnlyList<ImportRowPreview> Errors);
