import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { ConfirmationProvider } from "../../src/components/UI";
import { tokenStore } from "../../src/lib/api";
import { localDate, nextDate } from "../../src/lib/utils";
import "../../src/index.css";

const root = createRoot(document.getElementById("root")!);
let role = "Admin";
let generation = 0;
let weekly = false;
const today = localDate(new Date());
const rooms = [{ id: 1, code: "LAB-01", name: "Laboratório de Informática", location: "Bloco A", active: true, kind: "Laboratorio", seats: 30, computerGroups: [] }];
const shifts = [{ id: 1, name: "Manhã", startsAt: "08:00:00", endsAt: "12:00:00" },
  { id: 2, name: "Tarde", startsAt: "13:00:00", endsAt: "17:00:00" },
  { id: 3, name: "Noite", startsAt: "18:00:00", endsAt: "22:00:00" }];
const occupation = { id: 1, roomId: 1, roomName: rooms[0].name, date: today, startsAt: `${today}T08:00:00`, endsAt: `${today}T12:00:00`,
  shiftId: 1, shiftName: "Manhã", kind: "Aula", description: "Desenvolvimento", status: "Confirmed", dayStatus: "Letivo",
  calendarKind: "Presential", conflicts: ["Room"], actualTeacherId: "teacher", actualTeacherName: "Docente sintético",
  actualClassGroupId: 1, actualClassGroupName: "Dev 1", originalTeacherId: "owner", originalClassGroupId: 2,
  isBorrowed: true, bookingStatus: "Aprovada", bookingRequestId: 1, weeklyClassId: null, loanId: 1 };
window.fetch = async (input) => {
  const path = String(input);
  if (path === "/api/me") return new Response(JSON.stringify({ id: role === "Admin" ? "admin" : "teacher", displayName: `${role} sintético`, email: "", roles: [role] }));
  if (path === "/api/auth/institutional/config") return new Response(JSON.stringify({ enabled: false }));
  if (path === "/api/notifications/unread-count") return new Response(JSON.stringify({ count: 0 }));
  if (weekly) {
    if (path === "/api/rooms") return new Response(JSON.stringify(rooms));
    if (path === "/api/shifts") return new Response(JSON.stringify(shifts));
    if (path === "/api/classes") return new Response(JSON.stringify([{ id: 1, code: "Turma 001", name: "Dev 1" }, { id: 2, code: "Turma 002", name: "Titular" }]));
    if (path === "/api/teachers") return new Response(JSON.stringify([{ id: "teacher", displayName: "Docente sintético" }, { id: "owner", displayName: "Titular sintético" }]));
    if (path.startsWith("/api/agenda?")) return new Response(JSON.stringify([
      occupation, { ...occupation, id: 2, description: "Segunda ocupação", isBorrowed: false },
      { ...occupation, id: 3, description: "Outro dia", date: nextDate(today, 1), startsAt: `${nextDate(today, 1)}T08:00:00`, endsAt: `${nextDate(today, 1)}T12:00:00` },
      { ...occupation, id: 4, description: "Sem turno", shiftId: null, shiftName: null },
    ]));
  }
  return new Response(JSON.stringify([]));
};
const shellTest = {
  reset(nextRole = "Admin", showWeekly = false) {
    role = nextRole;
    weekly = showWeekly;
    tokenStore.set("synthetic-session");
    root.render(<ConfirmationProvider><App key={++generation} /></ConfirmationProvider>);
  },
};
(window as unknown as { shellTest: typeof shellTest }).shellTest = shellTest;
(window as unknown as { adminTest: typeof shellTest }).adminTest = shellTest;
shellTest.reset();
