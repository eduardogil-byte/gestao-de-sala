import assert from "node:assert/strict";
import test from "node:test";
import { getNavigationSections } from "../src/lib/navigation.ts";

const itemsFor = (isAdmin: boolean): string[] => getNavigationSections(isAdmin)
  .flatMap((section) => section.items.map((item) => item.page));

test("admin encontra as áreas de gestão, inclusive grades semanais", () => {
  const items = itemsFor(true);
  assert.ok(!items.includes("agenda"));
  assert.equal(items.filter((page) => page === "instructor-agenda").length, 1);
  for (const page of ["schedules", "opportunities", "imports", "exports", "academic"]) {
    assert.ok(items.includes(page), `menu administrativo deve incluir ${page}`);
  }
});

test("menu de professor mantém tarefas cotidianas e oculta áreas administrativas", () => {
  const items = itemsFor(false);
  for (const page of ["bookings", "room-timeline", "instructor-agenda", "loans", "teachers"]) {
    assert.ok(items.includes(page), `menu de professor deve incluir ${page}`);
  }
  assert.ok(!items.includes("agenda"));
  assert.equal(items.filter((page) => page === "instructor-agenda").length, 1);
  for (const page of ["schedules", "opportunities", "imports", "exports", "academic"]) {
    assert.ok(!items.includes(page), `menu de professor não deve incluir ${page}`);
  }
});

test("rótulo da agenda docente depende do perfil", () => {
  const admin = getNavigationSections(true).flatMap((section) => section.items).find((item) => item.page === "instructor-agenda");
  assert.equal(admin?.label, "Agenda dos Instrutores");
  assert.equal(admin?.teacherLabel, "Minha Agenda");
});
