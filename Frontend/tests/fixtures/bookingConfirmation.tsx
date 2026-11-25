import React from "react";
import { createRoot } from "react-dom/client";
import { DataProvider } from "../../src/lib/data";
import { ConfirmationProvider } from "../../src/components/UI";
import { Bookings } from "../../src/pages/Bookings";
import "../../src/index.css";

const root = createRoot(document.getElementById("root")!);
const state = { requests: [] as { acceptedTechnicalReasons?: string[] }[], compatible: false, saved: false };
const reasons = ["RAM exigida: 16 GB; RAM disponível: 8 GB"];
window.fetch = async (input, init) => {
  const path = String(input);
  let body: unknown = [];
  if (path === "/api/bookings") body = [{ id: 1, reason: "Prática", status: "Pendente", teacherId: "teacher",
    startsAt: "2027-03-03T08:00:00", endsAt: "2027-03-03T12:00:00", students: 20, recurrence: "Nenhuma" }];
  if (path.endsWith("/suggestions")) body = [{ id: 1, name: "LAB-01", location: "A", seats: 25, computers: 20,
    compatible: state.compatible, incompatibility: state.compatible ? null : reasons[0], available: true,
    availableOccurrences: 1, totalOccurrences: 1, conflicts: [], computerGroups: [] }];
  if (path.includes("/availability?")) body = { roomId: 1, total: 1, available: 1, unavailable: 0,
    days: [{ start: "2027-03-03T08:00:00", end: "2027-03-03T12:00:00", available: true, conflicts: [] }] };
  if (path.endsWith("/confirm")) {
    const request = JSON.parse(String(init?.body)); state.requests.push(request);
    if (!state.compatible && !request.acceptedTechnicalReasons)
      return new Response(JSON.stringify({ error: "Confirmação técnica necessária", technicalReasons: reasons }), { status: 409 });
    state.saved = true;
    body = { reservedCount: 1, unavailableDates: [], replacedOccupationIds: [] };
  }
  return new Response(JSON.stringify(body));
};
const fixture = { state, reset(compatible: boolean) {
  state.compatible = compatible; state.requests = []; state.saved = false;
  root.render(<DataProvider key={String(compatible)}><ConfirmationProvider><Bookings user={{ id: "teacher", displayName: "Professor", email: "", roles: ["Professor"] }} reloadAgenda={async () => {}} /></ConfirmationProvider></DataProvider>);
} };
(window as unknown as { confirmationTest: typeof fixture }).confirmationTest = fixture;
(window as unknown as { adminTest: typeof fixture }).adminTest = fixture;
fixture.reset(false);
