import type { SemesterIndicators } from "../../src/lib/occupancyIndicators.ts";

export const semesterReport: SemesterIndicators = {
  semesterId: 1, from: "2027-03-01", to: "2027-06-30", referenceDate: "2027-03-15",
  thresholds: { bottleneckPercent: 80, opportunityPercent: 40 },
  physicalOccupiedHours: 110, occupiedWithinCapacityHours: 110, capacityHours: 300, availableHours: 190,
  occupancyPercent: 36.67, outsideCapacityHours: 0, roomsWithUnknownCapacity: 0, conflictPairs: 0,
  classification: "Opportunity", warnings: [], daysWithOccupations: 30, occupiedRoomDays: 32,
  eligibleRoomDays: 75, occupiedEligibleRoomDays: 32, unoccupiedRoomDays: 43,
  pastOccupiedRoomDays: 12, todayOccupiedRoomDays: 1, futureOccupiedRoomDays: 19,
  months: [{ year: 2027, month: 3, physicalOccupiedHours: 110, daysWithOccupations: 30 }],
  rooms: [
    { roomId: 1, roomName: "Laboratório de Informática", kind: "Laboratorio", physicalOccupiedHours: 90,
      occupiedWithinCapacityHours: 90, capacityHours: 100, availableHours: 10, occupancyPercent: 90,
      outsideCapacityHours: 0, conflictPairs: 0, unclassifiedOccupations: 0, classification: "Bottleneck", warnings: [],
      daysWithOccupations: 30, eligibleDays: 50, occupiedEligibleDays: 30, unoccupiedDays: 20,
      shifts: [
        { shiftId: 1, shiftName: "Manhã", occupiedHours: 30, capacityHours: 40, availableHours: 10, occupancyPercent: 75, classification: "Intermediate", warnings: [] },
        { shiftId: 2, shiftName: "Tarde", occupiedHours: 30, capacityHours: 30, availableHours: 0, occupancyPercent: 100, classification: "Bottleneck", warnings: [] },
        { shiftId: 3, shiftName: "Noite", occupiedHours: 30, capacityHours: 30, availableHours: 0, occupancyPercent: 100, classification: "Bottleneck", warnings: [] },
      ] },
    { roomId: 2, roomName: "Oficina de Mecatrônica", kind: "Laboratorio", physicalOccupiedHours: 20,
      occupiedWithinCapacityHours: 20, capacityHours: 200, availableHours: 180, occupancyPercent: 10,
      outsideCapacityHours: 0, conflictPairs: 0, unclassifiedOccupations: 0, classification: "Opportunity", warnings: [],
      daysWithOccupations: 2, eligibleDays: 25, occupiedEligibleDays: 2, unoccupiedDays: 23,
      shifts: [{ shiftId: 1, shiftName: "Manhã", occupiedHours: 20, capacityHours: 200, availableHours: 180, occupancyPercent: 10, classification: "Opportunity", warnings: [] }] },
  ],
};

export const unknownReport: SemesterIndicators = {
  ...semesterReport, semesterId: 2, from: "2027-07-01", to: "2027-12-31", physicalOccupiedHours: 4,
  capacityHours: null, occupiedWithinCapacityHours: null, availableHours: null, occupancyPercent: null,
  roomsWithUnknownCapacity: 1, occupiedRoomDays: 1, eligibleRoomDays: null, occupiedEligibleRoomDays: null,
  unoccupiedRoomDays: null, pastOccupiedRoomDays: 0, todayOccupiedRoomDays: 0, futureOccupiedRoomDays: 1,
  classification: "Unknown", daysWithOccupations: 1, outsideCapacityHours: null, months: [], rooms: [{ ...semesterReport.rooms[0], capacityHours: null,
    availableHours: null, occupancyPercent: null, physicalOccupiedHours: 4, classification: "Unknown",
    daysWithOccupations: 1, occupiedWithinCapacityHours: null, outsideCapacityHours: null,
    eligibleDays: null, occupiedEligibleDays: null, unoccupiedDays: null, shifts: [] }],
};
