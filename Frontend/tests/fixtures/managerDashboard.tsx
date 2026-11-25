import React from "react";
import { createRoot } from "react-dom/client";
import { DataProvider } from "../../src/lib/data";
import { ConfirmationProvider } from "../../src/components/UI";
import { Dashboard } from "../../src/pages/Dashboard";
import { Rooms } from "../../src/pages/Rooms";
import { semesterReport, unknownReport } from "../helpers/occupancyReport";
import "../../src/index.css";

const root = createRoot(document.getElementById("root")!);
const rooms = semesterReport.rooms.map((room) => ({ id: room.roomId, code: room.roomId === 1 ? "LAB-01" : "OF-02",
  name: room.roomName, kind: room.kind, location: "Bloco A", seats: 30, desks: 30, active: true,
  hasProjector: false, hasTeacherComputer: false, hasInternet: true, computerGroups: [] }));
let generation = 0;
const fixture = {
  calls: [] as string[],
  reset(mode = "dashboard", role = "Admin") {
    fixture.calls = [];
    const user = { id: role.toLowerCase(), displayName: role, email: "", roles: [role] };
    root.render(<DataProvider key={++generation}><ConfirmationProvider><main className="app-workspace mx-auto max-w-7xl p-4 sm:p-6">
      {mode === "rooms" ? <Rooms user={user} /> : <Dashboard user={user} occupations={[]} navigate={() => {}}
        openTimeline={() => {}} openOpportunity={() => {}} onExport={() => {}} unread={0} />}
    </main></ConfirmationProvider></DataProvider>);
  },
};
window.fetch = async (input, init) => {
  const path = String(input);
  fixture.calls.push(path);
  if (init?.method && init.method !== "GET") return new Response(null, { status: 405 });
  if (path === "/api/rooms") return Response.json(rooms);
  if (path === "/api/semesters") return Response.json([{ id: 1, name: "2027/1", startDate: semesterReport.from, endDate: semesterReport.to },
    { id: 2, name: "2027/2", startDate: unknownReport.from, endDate: unknownReport.to }]);
  if (path === "/api/shifts") return Response.json([{ id: 1, name: "Manhã", startsAt: "08:00:00", endsAt: "12:00:00" },
    { id: 2, name: "Tarde", startsAt: "13:00:00", endsAt: "17:00:00" }, { id: 3, name: "Noite", startsAt: "18:00:00", endsAt: "22:00:00" }]);
  if (path.startsWith("/api/occupancy-indicators/compare")) return Response.json({ first: semesterReport, second: unknownReport });
  if (path.startsWith("/api/occupancy-indicators/semesters/")) {
    const report = path.includes("/semesters/2") ? unknownReport : semesterReport;
    const selected = new URL(path, location.origin).searchParams.get("roomId");
    const room = report.rooms.find((item) => item.roomId === Number(selected));
    return Response.json(room ? { ...report, rooms: [room], physicalOccupiedHours: room.physicalOccupiedHours,
      capacityHours: room.capacityHours, availableHours: room.availableHours, occupancyPercent: room.occupancyPercent,
      occupiedRoomDays: room.daysWithOccupations, eligibleRoomDays: room.eligibleDays, unoccupiedRoomDays: room.unoccupiedDays } : report);
  }
  if (path.endsWith("/operating-shifts")) return Response.json([{ shiftId: 1, weekdaysMask: 62 }]);
  return Response.json([]);
};
(window as unknown as { adminTest: typeof fixture }).adminTest = fixture;
fixture.reset();
