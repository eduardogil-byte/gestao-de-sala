import { resultMessage } from "./utils.ts";

export type IndicatorClassification = "Bottleneck" | "Opportunity" | "Intermediate" | "Unknown";

export type ShiftIndicator = {
  shiftId: number; shiftName: string; occupiedHours: number;
  capacityHours: number | null; availableHours: number | null;
  occupancyPercent: number | null; classification: IndicatorClassification;
  warnings: string[];
};

export type RoomIndicator = {
  roomId: number; roomName: string; kind: string; physicalOccupiedHours: number;
  capacityHours: number | null; availableHours: number | null;
  occupancyPercent: number | null; outsideCapacityHours: number | null;
  conflictPairs: number; unclassifiedOccupations: number;
  classification: IndicatorClassification; warnings: string[];
  shifts: ShiftIndicator[];
};

export type SemesterIndicators = {
  semesterId: number; from: string; to: string;
  thresholds: { bottleneckPercent: number; opportunityPercent: number };
  physicalOccupiedHours: number; capacityHours: number | null;
  availableHours: number | null; occupancyPercent: number | null;
  outsideCapacityHours: number | null; roomsWithUnknownCapacity: number;
  conflictPairs: number; classification: IndicatorClassification;
  rooms: RoomIndicator[];
  months: { year: number; month: number; physicalOccupiedHours: number; daysWithOccupations: number }[];
  warnings: string[];
};

export type SemesterComparison = { first: SemesterIndicators; second: SemesterIndicators };

export const indicatorErrorMessage = (reason: unknown) => reason instanceof Error && "status" in reason && reason.status === 403
  ? "Sem permissão para consultar indicadores gerenciais." : resultMessage(reason);

export function settleCurrent<T>(request: Promise<T>, isCurrent: () => boolean,
  onValue: (value: T) => void, onError: (reason: unknown) => void, onFinally: () => void) {
  return request.then((value) => { if (isCurrent()) onValue(value); })
    .catch((reason: unknown) => { if (isCurrent()) onError(reason); })
    .finally(() => { if (isCurrent()) onFinally(); });
}

export function isSemesterIndicators(value: unknown): value is SemesterIndicators {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<SemesterIndicators>;
  return typeof report.semesterId === "number" &&
    typeof report.physicalOccupiedHours === "number" &&
    (report.capacityHours === null || typeof report.capacityHours === "number") &&
    (report.availableHours === null || typeof report.availableHours === "number") &&
    (report.occupancyPercent === null || typeof report.occupancyPercent === "number") &&
    typeof report.roomsWithUnknownCapacity === "number" &&
    typeof report.conflictPairs === "number" &&
    typeof report.thresholds?.bottleneckPercent === "number" &&
    typeof report.thresholds?.opportunityPercent === "number" &&
    Array.isArray(report.rooms) && report.rooms.every((room) =>
      typeof room.roomId === "number" && typeof room.roomName === "string" &&
      typeof room.kind === "string" &&
      typeof room.physicalOccupiedHours === "number" &&
      (room.capacityHours === null || typeof room.capacityHours === "number") &&
      (room.availableHours === null || typeof room.availableHours === "number") &&
      (room.occupancyPercent === null || typeof room.occupancyPercent === "number") &&
      ["Bottleneck", "Opportunity", "Intermediate", "Unknown"].includes(room.classification) &&
      Array.isArray(room.shifts) && room.shifts.every((shift) =>
        typeof shift.shiftId === "number" && typeof shift.shiftName === "string" &&
        typeof shift.occupiedHours === "number" &&
        (shift.capacityHours === null || typeof shift.capacityHours === "number") &&
        (shift.availableHours === null || typeof shift.availableHours === "number")) &&
      Array.isArray(room.warnings)) &&
    Array.isArray(report.months) && report.months.every((month) =>
      typeof month.year === "number" && typeof month.month === "number" &&
      typeof month.physicalOccupiedHours === "number") &&
    Array.isArray(report.warnings);
}

export const indicatorPath = (semesterId: number, roomId?: number) =>
  `/occupancy-indicators/semesters/${semesterId}${roomId ? `?roomId=${roomId}` : ""}`;

export const comparisonPath = (firstSemesterId: number, secondSemesterId: number, roomId?: number) =>
  `/occupancy-indicators/compare?firstSemesterId=${firstSemesterId}&secondSemesterId=${secondSemesterId}${roomId ? `&roomId=${roomId}` : ""}`;

export const orderedRooms = (rooms: RoomIndicator[]) => [...rooms].sort((a, b) => {
  if (a.occupancyPercent === null) return b.occupancyPercent === null ? a.roomName.localeCompare(b.roomName) : 1;
  if (b.occupancyPercent === null) return -1;
  return b.occupancyPercent - a.occupancyPercent || a.roomName.localeCompare(b.roomName);
});

// Agrega somente números já calculados pela SG-23; não deriva percentuais ou capacidade.
export function shiftDistribution(report: SemesterIndicators) {
  const shifts = new Map<number, { id: number; name: string; occupied: number; capacity: number; available: number; known: number; unknown: number }>();
  for (const room of report.rooms) for (const shift of room.shifts) {
    const current = shifts.get(shift.shiftId) ?? { id: shift.shiftId, name: shift.shiftName, occupied: 0, capacity: 0, available: 0, known: 0, unknown: 0 };
    current.occupied += shift.occupiedHours;
    if (shift.capacityHours === null || shift.availableHours === null) current.unknown++;
    else { current.capacity += shift.capacityHours; current.available += shift.availableHours; current.known++; }
    shifts.set(shift.shiftId, current);
  }
  return [...shifts.values()];
}

export const variationPoints = (first: SemesterIndicators, second: SemesterIndicators) =>
  first.occupancyPercent !== null && second.occupancyPercent !== null &&
  first.roomsWithUnknownCapacity === 0 && second.roomsWithUnknownCapacity === 0
    ? Number((second.occupancyPercent - first.occupancyPercent).toFixed(2)) : null;
