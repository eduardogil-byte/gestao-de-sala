import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { localDate, nextDate, dateBR } from "../lib/utils";
import { Modal } from "./UI";

const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const day = (date: string) => new Date(`${date}T12:00:00`).getDay();
const monthLabel = (date: string) => {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  return label[0].toLocaleUpperCase("pt-BR") + label.slice(1);
};
export const weekStart = (date: string) => nextDate(date, -day(date));
export const weekDates = (date: string) => Array.from({ length: 7 }, (_, index) => nextDate(weekStart(date), index));
export const recurrenceLimit = (start: string) => nextDate(start, 365);

export function WeeklyCalendar({ date, weekdays, recurring, onSelect, today }: {
  date: string; weekdays: number[]; recurring: boolean; onSelect: (date: string) => void; today: string;
}) {
  const [view, setView] = useState(weekStart(date));
  useEffect(() => setView(weekStart(date)), [date]);
  const days = weekDates(view);
  return <section className="col-span-full rounded-panel border border-line bg-surface p-3 sm:p-4" aria-label="Calendário semanal">
    <div className="flex items-center justify-between gap-2 mb-3">
      <button type="button" className="btn-secondary !px-2" aria-label="Semana anterior" onClick={() => setView(nextDate(view, -7))}><ChevronLeft size={18} aria-hidden="true" /></button>
      <h3 className="text-sm font-semibold text-ink text-center">{monthLabel(days[0])}{days[0].slice(0, 7) !== days[6].slice(0, 7) ? ` – ${monthLabel(days[6])}` : ""}</h3>
      <button type="button" className="btn-secondary !px-2" aria-label="Próxima semana" onClick={() => setView(nextDate(view, 7))}><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
    <div className="grid grid-cols-7 gap-1 sm:gap-2">{days.map((item) => {
      const selected = recurring ? weekdays.includes(day(item)) && item >= date : item === date;
      return <button key={item} type="button" aria-label={`${names[day(item)]}, ${dateBR(item)}`} aria-pressed={selected} onClick={() => onSelect(item)}
        className={`min-w-0 min-h-14 sm:min-h-16 rounded-control border text-center text-xs sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500 ${selected ? "border-skybrand-500 bg-sky-950 text-sky-100" : "border-line text-ink hover:border-skybrand-500"}`}>
        <span className="block font-medium">{names[day(item)]}</span><span className="block text-base font-bold tabular-nums">{Number(item.slice(-2))}</span>
        {item === today && <span className="block text-[10px] font-semibold">Hoje</span>}
      </button>;
    })}</div>
    {recurring && <p className="mt-2 text-xs text-muted-ink">Selecione os dias da semana que deseja repetir. A data inicial deve fazer parte da seleção.</p>}
  </section>;
}

export function RepeatUntilCalendar({ start, value, weekdays, today, onClose, onConfirm }: {
  start: string; value: string; weekdays: number[]; today: string; onClose: () => void; onConfirm: (date: string) => void;
}) {
  const max = recurrenceLimit(start);
  const [draft, setDraft] = useState(value >= start && value <= max ? value : start);
  const [view, setView] = useState((value >= start && value <= max ? value : start).slice(0, 7) + "-01");
  const first = weekStart(view);
  const days = Array.from({ length: 42 }, (_, index) => nextDate(first, index));
  return <Modal title="Manter esta alocação até" onClose={onClose} width="max-w-md">
    <div className="flex items-center justify-between gap-2 mb-3">
      <button type="button" className="btn-secondary !px-2" aria-label="Mês anterior" disabled={view.slice(0, 7) <= start.slice(0, 7)} onClick={() => setView(nextDate(view, -1).slice(0, 7) + "-01")}><ChevronLeft size={18} aria-hidden="true" /></button>
      <h3 className="text-sm font-semibold text-ink">{monthLabel(view)}</h3>
      <button type="button" className="btn-secondary !px-2" aria-label="Próximo mês" disabled={view.slice(0, 7) >= max.slice(0, 7)} onClick={() => { const d = new Date(`${view}T12:00:00`); d.setMonth(d.getMonth() + 1); setView(localDate(d)); }}><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center">{names.map((name) => <span key={name} className="text-xs font-semibold text-muted-ink py-1">{name}</span>)}
      {days.map((item) => <button key={item} type="button" disabled={item < start || item > max} aria-label={dateBR(item)} aria-pressed={item === draft} onClick={() => setDraft(item)}
        className={`min-h-10 rounded-control border text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500 disabled:opacity-30 ${item === draft ? "border-skybrand-500 bg-sky-950 text-sky-100" : weekdays.includes(day(item)) ? "border-skybrand-500 text-ink" : "border-transparent text-ink hover:border-line"} ${item === today ? "ring-2 ring-skybrand-500 ring-inset" : ""} ${item.slice(0, 7) !== view.slice(0, 7) ? "opacity-60" : ""}`}>
        {Number(item.slice(-2))}{item === today && <span className="sr-only">, hoje</span>}
      </button>)}
    </div>
    <p className="mt-3 text-xs text-muted-ink">Dias contornados seguem a seleção semanal. Limite: {dateBR(max)}.</p>
    <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" onClick={() => onConfirm(draft)}>OK</button></div>
  </Modal>;
}
