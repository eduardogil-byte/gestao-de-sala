export type User = {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
};
export type Teacher = { id: string; displayName: string; email: string };
export type Shift = {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
};
export type Software = { id: number; name: string };
export type InstalledSoftware = {
  softwareId: number;
  name: string;
  installedQuantity: number;
};
export type ComputerGroup = {
  id?: number;
  description: string;
  quantity: number;
  ramGb: number;
  tier: string;
  dedicatedGpu: boolean;
  software: InstalledSoftware[];
};
export type Room = {
  id: number;
  name: string;
  location: string;
  purpose?: string | null;
  kind: string;
  seats: number;
  desks: number;
  hasProjector: boolean;
  hasTeacherComputer: boolean;
  hasInternet: boolean;
  active: boolean;
  computerGroups: ComputerGroup[];
};
export type Semester = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
};
export type ClassGroup = {
  id: number;
  semesterId: number;
  name: string;
  students: number;
};
export type Availability = { weekday: number; shiftId: number };
export type Assignment = {
  id: number;
  classGroupId: number;
  teacherId: string;
  disciplineName: string;
  meetingsPerWeek: number;
  preferredShiftId: number | null;
  needsProjector: boolean;
  needsTeacherComputer: boolean;
  needsStudentComputers: boolean;
  minTier: string;
  minRamGb: number;
  needsDedicatedGpu: boolean;
  softwareIds: number[];
  lessonPlanLink: string | null;
};
export type Schedule = {
  id: number;
  semesterId: number;
  status: string;
  unallocatedMeetings: number;
  allocatedMeetings: number;
  createdAtUtc: string;
};
export type Lesson = {
  id: number;
  weekday: number;
  shiftId: number;
  shiftName: string;
  start: string;
  end: string;
  roomId: number;
  room: string;
  assignmentId: number;
  teacherId: string;
  classGroupId: number;
  disciplineName: string;
};
export type ScheduleDetails = {
  id: number;
  semesterId: number;
  status: string;
  unallocatedMeetings: number;
  createdAtUtc: string;
  lessons: Lesson[];
};
export type Occupation = {
  id: number;
  roomId: number;
  startsAt: string;
  endsAt: string;
  kind: string;
  dayStatus?: string;
  description: string | null;
  originalTeacherId: string | null;
  actualTeacherId: string | null;
  isBorrowed: boolean;
  originalClassGroupId: number | null;
  actualClassGroupId: number | null;
  weeklyClassId: number | null;
  bookingRequestId: number | null;
  loanId?: number | null;
};
export type Booking = {
  id: number;
  teacherId: string;
  classGroupId: number | null;
  startsAt: string;
  endsAt: string;
  students: number;
  studentsPerComputer: number;
  recurrence: string;
  weekdaysMask: number;
  recurringEadWeekday: number | null;
  repeatUntil: string | null;
  needsProjector: boolean;
  needsTeacherComputer: boolean;
  needsStudentComputers: boolean;
  minTier: string;
  minRamGb: number;
  needsDedicatedGpu: boolean;
  status: string;
  reason: string;
  lessonPlanLink: string | null;
  approvedRoomId: number | null;
  softwareIds: number[];
};
export type ConflictInfo = {
  id: number;
  roomId?: number;
  teacherId: string | null;
  classGroupId: number | null;
  startsAt: string;
  endsAt: string;
};
export type Suggestion = {
  id: number;
  name: string;
  location: string;
  purpose: string | null;
  seats: number;
  computers: number;
  score: number;
  compatible: boolean;
  incompatibility: string | null;
  available: boolean;
  availableOccurrences: number;
  totalOccurrences: number;
  conflicts: ConflictInfo[];
  computerGroups: {
    quantity: number;
    ramGb: number;
    tier: string;
    software: { name: string; installedQuantity: number }[];
  }[];
};
export type AvailabilityDay = {
  start: string;
  end: string;
  available: boolean;
  conflicts: ConflictInfo[];
};
export type BookingAvailability = {
  roomId: number;
  total: number;
  available: number;
  unavailable: number;
  days: AvailabilityDay[];
};
export type Loan = {
  id: number;
  roomOccupationId: number;
  roomId: number;
  startsAt: string;
  endsAt: string;
  ownerTeacherId: string;
  borrowerId: string;
  classGroupId: number | null;
  reason: string;
  status: string;
  ownerDisposition?: string | null;
  replacementOccupationId?: number | null;
  requestedAtUtc: string;
  approvedAtUtc: string | null;
};
export type Need = {
  needsProjector: boolean;
  needsTeacherComputer: boolean;
  needsStudentComputers: boolean;
  minTier: string;
  minRamGb: number;
  needsDedicatedGpu: boolean;
  softwareIds: number[];
};
export type Notification = {
  id: number;
  actorName: string;
  message: string;
  createdAtUtc: string;
  readAtUtc: string | null;
};
export type Usage = {
  from: string;
  to: string;
  shiftId: number | null;
  classGroupId: number | null;
  days: { date: string; occupiedRooms: number }[];
  rooms: { roomId: number; occurrences: number; hours: number }[];
};
export type RoomOption = {
  id: number;
  name: string;
  location: string;
  purpose: string | null;
  seats: number;
  computers: number;
  compatible: boolean;
  incompatibility: string | null;
  available: boolean;
  score: number;
  occupiedBy: { id: number; teacherId: string; classGroupId: number | null }[];
};
