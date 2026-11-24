export function semesterDates(year: number, term: number) {
  const start = new Date(Date.UTC(year, term === 1 ? 1 : 7, 1));
  start.setUTCDate(1 + (8 - start.getUTCDay()) % 7);
  return { name: `${year}/${term}`, startDate: start.toISOString().slice(0, 10),
    endDate: `${year}-${term === 1 ? "07-17" : "12-23"}` };
}
