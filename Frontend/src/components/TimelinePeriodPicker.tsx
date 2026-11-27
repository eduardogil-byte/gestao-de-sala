import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { datesBetween, weekStart, type TimelineView } from "../lib/roomTimeline";
import { dateBR, localDate, nextDate } from "../lib/utils";
import type { Semester } from "../types";
import { Field, Modal } from "./UI";

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const months = Array.from({ length: 12 }, (_, month) => new Date(2027, month, 1).toLocaleDateString("pt-BR", { month: "long" }));

export function TimelinePeriodPicker({ view, anchor, semesterId, semesters, label, onDate, onSemester }: {
  view: TimelineView; anchor: string; semesterId: string; semesters: Semester[]; label: string;
  onDate: (date: string) => void; onSemester: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(anchor.slice(0, 7) + "-01");
  const year = Number(month.slice(0, 4));
  const years = [...new Set([year, ...Array.from({ length: 21 }, (_, index) => Number(anchor.slice(0, 4)) - 10 + index),
    ...semesters.flatMap(s => [Number(s.startDate.slice(0, 4)), Number(s.endDate.slice(0, 4))])])].filter(value => value >= 1 && value <= 9998).sort((a, b) => a - b);
  const first = weekStart(month);
  const days = datesBetween(first, nextDate(first, 42));
  const selectDate = (date: string) => { onDate(date); setOpen(false); };
  const moveMonth = (direction: number) => {
    const date = new Date(`${month}T12:00:00`);
    date.setMonth(date.getMonth() + direction);
    setMonth(localDate(date));
  };
  return <>
    <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-control px-2 py-2 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500"
      aria-label={`Selecionar período: ${label}`} aria-haspopup="dialog" onClick={() => { setMonth(anchor.slice(0, 7) + "-01"); setOpen(true); }}>
      <CalendarDays size={18} className="shrink-0" aria-hidden="true" /><span className="min-w-0">{label}</span><ChevronDown size={15} className="shrink-0" aria-hidden="true" />
    </button>
    {open && <Modal title={view === "week" ? "Selecionar semana" : view === "month" ? "Selecionar mês" : "Selecionar semestre"} width="max-w-md" onClose={() => setOpen(false)}>
      {view === "semester" ? <div className="space-y-2">{semesters.length ? semesters.map(s => <button type="button" key={s.id} aria-pressed={String(s.id) === semesterId}
        className={`block min-h-11 w-full rounded-control border p-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500 ${String(s.id) === semesterId ? "border-skybrand-500 bg-canvas text-ink ring-2 ring-skybrand-500" : "border-line text-ink hover:bg-canvas"}`}
        onClick={() => { onSemester(String(s.id)); setOpen(false); }}><span className="block font-semibold">{s.name}</span><span className="block text-muted-ink">{dateBR(s.startDate)} a {dateBR(s.endDate)}</span></button>) : <p className="muted">Nenhum semestre cadastrado.</p>}</div> : <>
        <div className="mb-3 flex items-end gap-3">
          <Field label="Ano" className="min-w-0 flex-1"><select className="field" value={year} onChange={e => setMonth(`${e.target.value.padStart(4, "0")}${month.slice(4)}`)}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
          {view === "week" && <><button type="button" className="btn-secondary !px-3" aria-label="Mês anterior" onClick={() => moveMonth(-1)}><ChevronLeft size={18} aria-hidden="true" /></button><button type="button" className="btn-secondary !px-3" aria-label="Próximo mês" onClick={() => moveMonth(1)}><ChevronRight size={18} aria-hidden="true" /></button></>}
        </div>
        {view === "month" ? <div className="grid grid-cols-3 gap-2">{months.map((name, index) => {
          const value = `${year}-${String(index + 1).padStart(2, "0")}-01`;
          const selected = anchor.slice(0, 7) === value.slice(0, 7);
          return <button type="button" key={name} aria-pressed={selected} onClick={() => selectDate(value)} className={`min-h-11 min-w-0 rounded-control border p-2 text-sm capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500 ${selected ? "border-skybrand-500 bg-canvas text-ink ring-2 ring-skybrand-500" : "border-line text-ink hover:bg-canvas"}`}>{name}</button>;
        })}</div> : <>
          <p className="mb-2 text-center text-sm font-semibold capitalize text-ink" aria-live="polite">{new Date(`${month}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
          <div className="grid grid-cols-7 gap-1 text-center">{weekdays.map(name => <span key={name} className="py-1 text-xs font-semibold text-muted-ink">{name}</span>)}
            {days.map(date => {
              const selected = weekStart(date) === weekStart(anchor);
              return <button type="button" key={date} aria-pressed={selected} aria-current={date === localDate(new Date()) ? "date" : undefined} aria-label={`${dateBR(date)}, semana de ${dateBR(weekStart(date))}`}
                onClick={() => selectDate(date)} className={`min-h-11 min-w-0 rounded-control border text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500 ${selected ? "border-skybrand-500 bg-canvas text-ink ring-1 ring-skybrand-500" : "border-transparent text-ink hover:border-line hover:bg-canvas"} ${date.slice(0, 7) !== month.slice(0, 7) ? "text-muted-ink" : ""} ${date === localDate(new Date()) ? "font-bold underline underline-offset-4" : ""}`}>{Number(date.slice(-2))}</button>;
            })}
          </div><p className="mt-3 text-xs text-muted-ink">Selecione um dia para consultar sua semana.</p>
        </>}
      </>}
    </Modal>}
  </>;
}
