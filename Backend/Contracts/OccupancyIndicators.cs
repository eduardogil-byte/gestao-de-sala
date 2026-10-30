using SalaGest.Api.Models;

namespace SalaGest.Api.Contracts;

public record OperatingShiftInput(int ShiftId, int WeekdaysMask);
public record IndicatorThresholds(decimal BottleneckPercent, decimal OpportunityPercent);
public record ShiftOccupancyIndicator(int ShiftId, string ShiftName, decimal OccupiedHours,
    decimal? CapacityHours, decimal? AvailableHours, decimal? OccupancyPercent,
    int OccupiedSlots, int? UnoccupiedSlots, string Classification,
    IReadOnlyList<string> Warnings);
public record RoomOccupancyIndicator(int RoomId, string RoomName, RoomKind Kind,
    decimal PhysicalOccupiedHours, decimal? CapacityHours, decimal? OccupiedWithinCapacityHours,
    decimal? AvailableHours, decimal? OccupancyPercent, decimal? OutsideCapacityHours,
    int DaysWithOccupations, int OccupiedSlots, int? UnoccupiedSlots,
    int ConflictPairs, int UnclassifiedOccupations, string Classification,
    IReadOnlyList<string> Warnings, IReadOnlyList<ShiftOccupancyIndicator> Shifts);
public record MonthOccupancyIndicator(int Year, int Month, decimal PhysicalOccupiedHours,
    int DaysWithOccupations);
public record SemesterOccupancyIndicators(int SemesterId, DateOnly From, DateOnly To,
    IndicatorThresholds Thresholds, decimal PhysicalOccupiedHours,
    decimal? CapacityHours, decimal? OccupiedWithinCapacityHours,
    decimal? AvailableHours, decimal? OccupancyPercent, decimal? OutsideCapacityHours,
    int DaysWithOccupations, int OccupiedSlots, int? UnoccupiedSlots,
    int RoomsWithUnknownCapacity, int ConflictPairs, string Classification,
    IReadOnlyList<RoomOccupancyIndicator> Rooms,
    IReadOnlyList<MonthOccupancyIndicator> Months,
    IReadOnlyList<string> Warnings);
