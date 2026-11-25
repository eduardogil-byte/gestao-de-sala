import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dateBR, localDate, nextDate } from "../lib/utils";
import { weekStart } from "./BookingCalendars";

export type CalendarEvent = { id: number; startDate: string; endDate: string; kind: string; description: string };
export const calendarKinds = { Holiday: "Feriado", Recess: "Recesso", Planning: "Planejamento", NonTeaching: "Não letivo" };

export function SemesterCalendar({ start, end, selected, events, disabled, onToggle }: {
  start: string; end: string; selected: string[]; events: CalendarEvent[]; disabled: boolean; onToggle: (date: string) => void;
}) {
  const today = localDate(new Date());
  const [month, setMonth] = useState((today >= start && today <= end ? today : start).slice(0, 7));
  const months: string[] = [];
  for (let value = `${start.slice(0, 7)}-01`; value.slice(0, 7) <= end.slice(0, 7);) {
    months.push(value.slice(0, 7));
    const date = new Date(`${value}T12:00:00`); date.setMonth(date.getMonth() + 1); value = localDate(date);
  }
  const index = months.indexOf(month);
  const days = Array.from({ length: 42 }, (_, offset) => nextDate(weekStart(`${month}-01`), offset));
  const monthName = (value: string) => new Date(`${value}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return <section aria-label="Calendário do semestre" className="rounded-panel border border-line bg-surface p-3 sm:p-4 space-y-3">
    <div className="flex items-center gap-2">
      <button type="button" className="btn-secondary min-w-11 !px-2" aria-label="Mês anterior" disabled={disabled || index === 0} onClick={() => setMonth(months[index - 1])}><ChevronLeft size={18} aria-hidden="true" /></button>
      <label className="min-w-0 flex-1"><span className="sr-only">Mês do calendário</span><select className="field capitalize" value={month} disabled={disabled} onChange={(event) => setMonth(event.target.value)}>{months.map((value) => <option key={value} value={value}>{monthName(value)}</option>)}</select></label>
      <button type="button" className="btn-secondary min-w-11 !px-2" aria-label="Próximo mês" disabled={disabled || index === months.length - 1} onClick={() => setMonth(months[index + 1])}><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-ink" aria-hidden="true">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((name) => <span key={name} className="py-1">{name}</span>)}</div>
    <div role="group" aria-label={`Dias de ${monthName(month)}`} className="grid grid-cols-7 gap-1">
      {days.map((date) => {
        const occurrence = events.find((item) => item.startDate <= date && item.endDate >= date);
        const active = selected.includes(date);
        const outside = date < start || date > end || date.slice(0, 7) !== month;
        return <button type="button" key={date} data-date={date} aria-label={`${dateBR(date)}${occurrence ? `, ${calendarKinds[occurrence.kind as keyof typeof calendarKinds] ?? occurrence.kind}: ${occurrence.description}` : ''}`} aria-pressed={active} aria-current={date === today ? 'date' : undefined}
          disabled={disabled || outside} onClick={() => onToggle(date)}
          className={`relative min-h-11 min-w-0 rounded-lg border text-sm tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-skybrand-500 disabled:opacity-30 ${active ? 'border-skybrand-600 bg-skybrand-600 text-white' : 'border-transparent text-ink hover:border-line hover:bg-canvas'} ${occurrence && !active ? 'border-line bg-canvas font-semibold' : ''} ${date === today ? 'ring-1 ring-inset ring-skybrand-500' : ''}`}>
          {Number(date.slice(-2))}{occurrence && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current" />}
        </button>;
      })}
    </div>
    <p className="text-xs text-muted-ink">Clique para selecionar ou desselecionar datas. Dias com ponto possuem ocorrência.</p>
  </section>;
}
