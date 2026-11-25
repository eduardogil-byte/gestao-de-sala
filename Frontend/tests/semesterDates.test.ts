import assert from "node:assert/strict";
import test from "node:test";
import { semesterDates } from "../src/lib/semesterDates.ts";

test("RN-01 sugere a primeira segunda em ou após fevereiro/agosto e fins fixos", () => {
  assert.deepEqual(semesterDates(2027, 1), { name: "2027/1", startDate: "2027-02-01", endDate: "2027-07-17" });
  assert.deepEqual(semesterDates(2026, 2), { name: "2026/2", startDate: "2026-08-03", endDate: "2026-12-23" });
  assert.equal(semesterDates(2026, 1).startDate, "2026-02-02");
  assert.equal(semesterDates(2028, 1).startDate, "2028-02-07");
});
