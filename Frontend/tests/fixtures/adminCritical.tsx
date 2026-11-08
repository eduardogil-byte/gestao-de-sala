import React from "react";
import { createRoot } from "react-dom/client";
import { DataProvider } from "../../src/lib/data";
import { ConfirmationProvider } from "../../src/components/UI";
import { SemesterPlanning } from "../../src/pages/SemesterPlanning";
import { Rooms } from "../../src/pages/Rooms";

const user = { id: "admin", displayName: "Admin sintético", email: "", roles: ["Admin"] };
const root = createRoot(document.getElementById("root")!);
const api = {
  pending: [] as { path: string; body: unknown; resolve: (response: Response) => void }[],
  calls: [] as { path: string; body: unknown }[],
  generation: 0,
  catalog: {} as Record<string, unknown>,
  reset(mode = "planning") {
    api.pending = []; api.calls = [];
    api.catalog = { "/api/semesters": [{ id: 1, name: "Semestre A", startDate: "2027-01-01", endDate: "2027-06-30" },
      { id: 2, name: "Semestre B", startDate: "2027-07-01", endDate: "2027-12-31" }],
      "/api/software": [{ id: 1, name: "CAD" }],
      "/api/rooms": [{ id: 10, name: "Laboratório sintético", location: "Bloco A", kind: "Laboratorio", seats: 30, desks: 30,
        hasProjector: false, hasTeacherComputer: false, hasInternet: true, active: true, computerGroups: [] }] };
    root.render(<DataProvider key={++api.generation}><ConfirmationProvider>{mode === "planning"
      ? <SemesterPlanning user={user} reloadAgenda={async () => {}} /> : <Rooms user={user} />}</ConfirmationProvider></DataProvider>);
  },
  reply(path: string, data: unknown, status = 200) {
    const index = api.pending.findIndex((request) => request.path === path);
    if (index < 0) throw new Error(`Missing request: ${path}`);
    api.pending.splice(index, 1)[0].resolve(new Response(status === 204 ? null : JSON.stringify(data), { status }));
  },
  select(label: string, value: string) {
    const element = [...document.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent === label)?.querySelector("select");
    if (!element) throw new Error(`Missing select: ${label}`);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  },
  input(label: string, value: string) {
    const element = [...document.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent === label)?.querySelector("input");
    if (!element) throw new Error(`Missing input: ${label}`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  },
  click(text: string) {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
    if (!button || button.disabled) throw new Error(`Missing or disabled button: ${text}`);
    button.click();
  },
};
window.fetch = async (input, init) => {
  const path = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  api.calls.push({ path, body });
  if ((!init?.method || init.method === "GET") && !path.startsWith("/api/semester-plans") && !path.endsWith("/inventory"))
    return new Response(JSON.stringify(api.catalog[path] ?? []));
  return new Promise<Response>((resolve) => api.pending.push({ path, body, resolve }));
};
(window as unknown as { adminTest: typeof api }).adminTest = api;
api.reset();
