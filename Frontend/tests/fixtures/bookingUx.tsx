import React from "react";
import { createRoot } from "react-dom/client";
import { DataProvider } from "../../src/lib/data";
import { BookingForm } from "../../src/components/BookingForm";
import { ConfirmationProvider, Modal } from "../../src/components/UI";
import "../../src/index.css";

const teacher = { id: "teacher", displayName: "Docente de teste", email: "", roles: ["Professor"] };
const today = new Date().getDay();
const catalog: Record<string, unknown> = {
  "/api/rooms": [], "/api/software": [{ id: 1, name: "CAD" }, { id: 2, name: "Simulador" }],
  "/api/teachers": [], "/api/semesters": [],
  "/api/shifts": [{ id: 1, name: "Manhã", startsAt: "08:00:00", endsAt: "12:00:00" }, { id: 2, name: "Tarde", startsAt: "13:00:00", endsAt: "17:00:00" }],
  "/api/classes": [{ id: 20, name: "Turma A", students: 20, semesterId: 1, shiftId: 1 }],
  "/api/assignments": [{ id: 1, classGroupId: 20, teacherId: "teacher", semesterId: 1, curricularUnitId: 40, weekday: today, preferredShiftId: 1, endedAtUtc: null }],
  "/api/schedules": [], "/api/bookings": [], "/api/loans": [],
  "/api/bookings/pedagogical-options": [{ classGroupId: 20, className: "Turma A", students: 20, curricularUnitId: 40, unitName: "UC A", weekday: today, preferredShiftId: 1, qualificationWarning: false, capabilities: [{ id: 50, description: "Capacidade A" }] }],
};
const test = { requests: [] as unknown[], select(label: string, value: string) {
  const element = [...document.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent === label)?.querySelector("select");
  if (!element) throw new Error(`Seletor ausente: ${label}`);
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
}, click(text: string) {
  const element = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
  if (!element) throw new Error(`Botão ausente: ${text}`);
  element.click();
} };
window.fetch = async (input, init) => {
  const path = String(input);
  if (init?.method === "POST") { test.requests.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ id: 1, qualificationWarning: false }), { status: 201 }); }
  return new Response(JSON.stringify(catalog[path] ?? []));
};
(window as unknown as { adminTest: typeof test }).adminTest = test;
createRoot(document.getElementById("root")!).render(<div className="app-workspace"><DataProvider><ConfirmationProvider><Modal title="Criar reserva" onClose={() => {}}><BookingForm user={teacher} onCreated={() => {}} /></Modal></ConfirmationProvider></DataProvider></div>);
