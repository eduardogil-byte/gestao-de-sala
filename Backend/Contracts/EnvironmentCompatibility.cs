using SalaGest.Api.Models;

namespace SalaGest.Api.Contracts;

public record CapabilityResourceInput(string Name, string Type, int Quantity, bool Critical = false);
public record CapabilitySoftwareInput(int SoftwareId, int? RequiredLicenses = null, bool Critical = true);
public record CapabilityEnvironmentInput(RoomKind? RoomKind, bool RequiresProjector,
    int? RequiredComputers, int? MinRamGb, bool ComputersCritical,
    List<CapabilityResourceInput> Resources, List<CapabilitySoftwareInput> Software);
public record RequirementFinding(string Requirement, string Status, string Detail);
public record EnvironmentCompatibilityResponse(int RoomId, string RoomName, string Classification,
    IReadOnlyList<RequirementFinding> Findings);
