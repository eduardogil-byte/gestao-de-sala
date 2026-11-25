namespace SalaGest.Api.Contracts;

public record ClassShiftLink(string Label, int Count);
public record ClassShiftChangePreview(int ClassId, int? CurrentShiftId, string? CurrentShiftName,
    int ShiftId, string ShiftName, IReadOnlyList<ClassShiftLink> Links, string PreviewToken);
public record ClassShiftChangeInput(int ShiftId, bool Confirmed, string? PreviewToken);
