using SalaGest.Api.Models;

namespace SalaGest.Api.Contracts;

public record ResourceCatalogInput(string Name, string Category, string? Description, bool Active = true);

public record RoomResourceInput(string Name, string Type, int Quantity,
    int? OperationalQuantity = null, string? Description = null, string? Condition = null,
    string? TechnicalDetails = null, int? Voltage = null,
    DateOnly? WarrantyExpiresOn = null, DateOnly? LicenseExpiresOn = null,
    int? ResourceCatalogItemId = null);

public record ComputerGroupInventoryInput(string Description, int Quantity, int RamGb,
    HardwareTier Tier, bool DedicatedGpu, int? OperationalQuantity = null,
    string? Processor = null, string? Storage = null, string? GraphicsCard = null,
    string? OperatingSystem = null, bool? Virtualization = null, bool? DockerWsl = null,
    bool? CadCompatible = null, bool? SimulatorCompatible = null,
    string? NetworkDetails = null, bool? InternetAvailable = null);

public record GroupSoftwareInventoryInput(int SoftwareId, int InstalledQuantity,
    string? Version = null, int? LicenseQuantity = null, DateOnly? LicenseExpiresOn = null);

// Omitted collections preserve persisted records; only explicit IDs request removal.
public record RoomInventoryInput(List<InventoryGroupUpdate>? ComputerGroups = null,
    List<InventoryResourceUpdate>? Resources = null, List<int>? RemovedGroupIds = null);
public record InventoryGroupUpdate(int? Id, ComputerGroupInventoryInput Details,
    List<GroupSoftwareInventoryInput>? Software = null, List<int>? RemovedSoftwareIds = null);
public record InventoryResourceUpdate(int? Id, RoomResourceInput Details);
