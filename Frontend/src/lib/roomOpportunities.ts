export type RequirementFinding = { requirement: string; status: string; detail: string };
export type CapabilityOpportunity = {
  capabilityId: number; courseId: number; courseName: string; unitName: string;
  description: string; requiredHours: number; classification: "Compatible" | "Partial" | "Incompatible";
  findings: RequirementFinding[];
};
export type OpportunityDate = { date: string; status: "Potential" | "Occupied" | "NotEligible" | "NotOffered"; detail: string };
export type OpportunityPeriods = {
  semesterId: number; roomId: number; capabilityId: number; shiftId: number;
  pedagogicalHours: number; shiftHours: number; requiredMeetings: number; physicalHours: number;
  potentiallyFreeMeetings: number; suitableMeetings: number;
  compatibility: "Compatible" | "Partial" | "Incompatible";
  availability: "Known" | "UnknownCapacity"; findings: RequirementFinding[];
  dates: OpportunityDate[];
};
export const capabilitiesPath = (semesterId: number, roomId: number, students: number, courseId?: number) =>
  `/opportunities/semesters/${semesterId}/rooms/${roomId}/capabilities?students=${students}${courseId ? `&courseId=${courseId}` : ""}`;
export const periodsPath = (semesterId: number, roomId: number, capabilityId: number,
  shiftId: number, students: number, from: string, to: string, weekdaysMask: number) =>
  `/opportunities/semesters/${semesterId}/rooms/${roomId}/capabilities/${capabilityId}/periods?shiftId=${shiftId}&students=${students}&from=${from}&to=${to}&weekdaysMask=${weekdaysMask}`;
export function validCapabilities(value: unknown): value is CapabilityOpportunity[] {
  return Array.isArray(value) && value.every((item) =>
    item && typeof item.capabilityId === "number" && typeof item.courseName === "string" &&
    typeof item.unitName === "string" && typeof item.description === "string" &&
    typeof item.requiredHours === "number" &&
    ["Compatible", "Partial", "Incompatible"].includes(item.classification) &&
    Array.isArray(item.findings) && item.findings.every((finding: RequirementFinding) =>
      typeof finding.requirement === "string" && typeof finding.detail === "string" &&
      typeof finding.status === "string"));
}
export function validPeriods(value: unknown): value is OpportunityPeriods {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<OpportunityPeriods>;
  return typeof result.semesterId === "number" && typeof result.roomId === "number" &&
    typeof result.capabilityId === "number" && typeof result.shiftId === "number" &&
    typeof result.pedagogicalHours === "number" && typeof result.shiftHours === "number" &&
    typeof result.requiredMeetings === "number" && typeof result.physicalHours === "number" &&
    typeof result.potentiallyFreeMeetings === "number" && typeof result.suitableMeetings === "number" &&
    ["Compatible", "Partial", "Incompatible"].includes(result.compatibility ?? "") &&
    ["Known", "UnknownCapacity"].includes(result.availability ?? "") &&
    Array.isArray(result.findings) && result.findings.every((finding) =>
      typeof finding.requirement === "string" && typeof finding.status === "string" &&
      typeof finding.detail === "string") &&
    Array.isArray(result.dates) && result.dates.every((day) =>
      typeof day.date === "string" && typeof day.detail === "string" &&
      ["Potential", "Occupied", "NotEligible", "NotOffered"].includes(day.status));
}
