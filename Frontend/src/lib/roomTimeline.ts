import { localDate, nextDate } from "./utils.ts";
import type { AgendaOccupation, Semester } from "../types";

export type TimelineView = "week" | "month" | "semester";

export function weekStart(date: string) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return nextDate(date, -day);
}

export function period(view: TimelineView, anchor: string, semester?: Semester) {
  if (view === "semester") {
    if (!semester) return null;
    return { from: semester.startDate, to: nextDate(semester.endDate, 1) };
  }
  const from = view === "week" ? weekStart(anchor) : `${anchor.slice(0, 7)}-01`;
  const to = view === "week" ? nextDate(from, 7) : localDate(new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 1, 12));
  if (!semester) return { from, to };
  const clipped = { from: from > semester.startDate ? from : semester.startDate,
    to: to < nextDate(semester.endDate, 1) ? to : nextDate(semester.endDate, 1) };
  return clipped.from < clipped.to ? clipped : null;
}

export function movePeriod(view: Exclude<TimelineView, "semester">, anchor: string, direction: number) {
  if (view === "week") return nextDate(anchor, direction * 7);
  const date = new Date(`${anchor.slice(0, 7)}-15T12:00:00`);
  date.setMonth(date.getMonth() + direction);
  return localDate(date);
}

export function agendaPath(range: { from: string; to: string }, filters: Record<string, string>) {
  const params = new URLSearchParams({ from: `${range.from}T00:00:00`, to: `${range.to}T00:00:00` });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return `/agenda?${params}`;
}

export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let day = from; day < to; day = nextDate(day, 1)) dates.push(day);
  return dates;
}

export function indexOccupations(items: AgendaOccupation[]) {
  const slots = new Map<string, AgendaOccupation[]>();
  const days = new Map<string, AgendaOccupation[]>();
  for (const item of items) {
    const slotKey = `${item.roomId}|${item.date}|${item.shiftId ?? "other"}`;
    const slot = slots.get(slotKey) ?? [];
    slot.push(item);
    slots.set(slotKey, slot);
    const day = days.get(item.date) ?? [];
    day.push(item);
    days.set(item.date, day);
  }
  return { slots, days };
}

// Only ordinary, unambiguous records share a visual strip; each date keeps its own action.
export function consecutiveSlots(dates: string[], slots: Map<string, AgendaOccupation[]>, roomId: number, shiftId: number,
  range?: { from: string; to: string } | null) {
  const groups: { dates: string[]; items: AgendaOccupation[] }[] = [];
  const ordinary = (item: AgendaOccupation) => item.actualTeacherId != null && item.actualClassGroupId != null &&
    item.kind !== "Bloqueio" && item.status === "Confirmed" && !item.isBorrowed && !item.conflicts.length &&
    (!item.bookingStatus || item.bookingStatus === "Aprovada") && (!item.dayStatus || item.dayStatus === "Letivo") &&
    (!item.calendarKind || item.calendarKind === "Presential");
  for (const date of dates) {
    const items = !range || (date >= range.from && date < range.to) ? slots.get(`${roomId}|${date}|${shiftId}`) ?? [] : [];
    const last = groups.at(-1);
    const previous = last?.items.at(-1);
    const current = items[0];
    if (last && previous && items.length === 1 && last.items.length === last.dates.length &&
      ordinary(previous) && ordinary(current) && nextDate(last.dates.at(-1)!, 1) === date &&
      previous.actualTeacherId === current.actualTeacherId && previous.actualClassGroupId === current.actualClassGroupId &&
      previous.kind === current.kind && previous.startsAt.slice(11) === current.startsAt.slice(11) && previous.endsAt.slice(11) === current.endsAt.slice(11)) {
      last.dates.push(date); last.items.push(current);
    } else groups.push({ dates: [date], items: [...items] });
  }
  return groups;
}

export function summarize(items: AgendaOccupation[]) {
  return {
    count: items.length,
    conflicts: items.filter((item) => item.conflicts.length > 0).length,
    specialDays: [...new Set(items.flatMap((item) => [item.calendarKind,
      item.dayStatus === "Ead" || item.dayStatus === "NaoLetivo" ? item.dayStatus : null])
      .filter((kind): kind is string => Boolean(kind && kind !== "Presential")))],
  };
}

export function isAgendaOccupation(value: unknown): value is AgendaOccupation {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "number" && typeof item.roomId === "number" &&
    typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
    typeof item.startsAt === "string" && typeof item.endsAt === "string" &&
    (typeof item.shiftId === "number" || item.shiftId === null) &&
    typeof item.kind === "string" && Array.isArray(item.conflicts) &&
    item.conflicts.every((reason) => typeof reason === "string");
}
