using SalaGest.Api.Models;

namespace SalaGest.Api.Contracts;

public record RoomResourceInput(string Name, string Type, int Quantity,
    int? OperationalQuantity = null, string? Description = null, string? Condition = null,
    string? TechnicalDetails = null, int? Voltage = null,
    DateOnly? WarrantyExpiresOn = null, DateOnly? LicenseExpiresOn = null);

public record ComputerGroupInventoryInput(string Description, int Quantity, int RamGb,
    HardwareTier Tier, bool DedicatedGpu, int? OperationalQuantity = null,
    string? Processor = null, string? Storage = null, string? GraphicsCard = null,
    string? OperatingSystem = null, bool? Virtualization = null, bool? DockerWsl = null,
    bool? CadCompatible = null, bool? SimulatorCompatible = null,
    string? NetworkDetails = null, bool? InternetAvailable = null);

public record GroupSoftwareInventoryInput(int SoftwareId, int InstalledQuantity,
    string? Version = null, int? LicenseQuantity = null, DateOnly? LicenseExpiresOn = null);
