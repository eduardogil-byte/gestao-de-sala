import { useState } from "react";
import { useData, type Catalog } from "../lib/data";
import { consecutiveSlots, indexOccupations } from "../lib/roomTimeline";
import { dateBR, hour, localDate, statusText } from "../lib/utils";
import { weekDates } from "./BookingCalendars";
import { Busy, Card, Empty, Notice, SectionHeading } from "./UI";
import type { AgendaOccupation, Room, Shift } from "../types";

function Activity({ item, data, onOpen }: {
  item: AgendaOccupation; data: Catalog; onOpen: (item: AgendaOccupation) => void;
}) {
  const group = data.classes.find((entry) => entry.id === item.actualClassGroupId);
  const teacher = item.actualTeacherName ?? data.teachers.find((entry) => entry.id === item.actualTeacherId)?.displayName;
  const originalTeacher = data.teachers.find((entry) => entry.id === item.originalTeacherId)?.displayName;
  const originalGroup = data.classes.find((entry) => entry.id === item.originalClassGroupId);
  const conflicts = item.conflicts ?? [];
  const status = item.status === "Confirmed" ? "Confirmada" : item.status === "Blocked" ? "Bloqueada" : statusText(item.status);
  return <button type="button" onClick={() => onOpen(item)}
    className={`block w-full min-h-11 rounded-lg border border-l-4 p-3 text-left text-sm leading-5 [overflow-wrap:anywhere] transition-colors hover:brightness-110 ${conflicts.length ? "border-line bg-canvas text-ink" : "border-line bg-canvas text-ink"}`}>
    <span className="block font-semibold break-words">{[group?.code, item.actualClassGroupName ?? group?.name].filter(Boolean).join(" · ") || item.description || item.kind}</span>
    <span className="block break-words">{teacher ? `Instrutor: ${teacher}` : "Instrutor não informado"}</span>
    {item.description && <span className="block break-words">{item.description}</span>}
    {(item.courseName || item.curricularUnitName) && <span className="block break-words">{[item.courseName, item.curricularUnitName].filter(Boolean).join(" · ")}</span>}
    <span className="block">{hour(item.startsAt.slice(11))}–{hour(item.endsAt.slice(11))} · {status || item.kind}</span>
    {item.bookingStatus && item.bookingStatus !== "Aprovada" && <span className="block">Reserva: {statusText(item.bookingStatus)}</span>}
    {item.isBorrowed && <span className="block font-semibold">Empréstimo efetivado{originalTeacher ? ` · Titular: ${originalTeacher}` : ""}{originalGroup ? ` · Turma de origem: ${originalGroup.code || originalGroup.name}` : ""}</span>}
    {item.dayStatus && item.dayStatus !== "Letivo" && <span className="block">{statusText(item.dayStatus)}</span>}
    {item.calendarKind && item.calendarKind !== "Presential" && <span className="block">Dia especial: {item.calendarKind}{item.calendarReason ? ` · ${item.calendarReason}` : ""}</span>}
    {conflicts.length > 0 && <span className="block font-semibold">Conflito sinalizado na agenda · {conflicts.length} alerta(s)</span>}
    <span className="block mt-1 underline">Ver detalhes</span>
  </button>;
}

export function WeeklyOccupations({ occupations, loading = false, error = "", onOpen, today = localDate(new Date()),
  dates = weekDates(today), rooms: filteredRooms, shifts: filteredShifts, renderActivity, range, onDropSlot, adaptive = false, monthly = false, onSelectDate, selectedDate }: {
  occupations: AgendaOccupation[]; loading?: boolean; error?: string;
  onOpen: (item: AgendaOccupation) => void; today?: string; dates?: string[];
  rooms?: Room[]; shifts?: Shift[]; renderActivity?: (item: AgendaOccupation, continuous?: boolean) => React.ReactNode;
  onDropSlot?: (roomId: number, date: string, shiftId: number, event: React.DragEvent<HTMLTableCellElement>) => void;
  range?: { from: string; to: string } | null;
  adaptive?: boolean;
  monthly?: boolean; onSelectDate?: (date: string) => void; selectedDate?: string;
}) {
  const [mobileGrid, setMobileGrid] = useState(monthly);
  const [onlyRecordedDays, setOnlyRecordedDays] = useState(false);
  const [collapsedRooms, setCollapsedRooms] = useState<number[]>([]);
  const { data, error: catalogError } = useData();
  const { slots } = indexOccupations(occupations);
  const rooms = [...(filteredRooms ?? data.rooms)];
  if (!filteredRooms) for (const item of occupations) {
    if (!rooms.some(room => room.id === item.roomId)) rooms.push({ id: item.roomId, name: item.roomName || `Ambiente ${item.roomId}`, code: null } as Room);
  }
  const shifts = [...(filteredShifts ?? data.shifts)].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const failure = error || catalogError;
  const listedDates = dates.filter(date => (!range || (date >= range.from && date < range.to)) &&
    (!onlyRecordedDays || occupations.some(item => item.date === date && rooms.some(room => room.id === item.roomId))));
  return <Card className="mb-5 min-w-0 overflow-hidden">
    <div aria-label={monthly ? "Calendário mensal" : undefined}>
    <div className={adaptive ? "p-3 border-b border-line md:sr-only" : "p-4 border-b border-line"}>
      <div className={adaptive ? "sr-only" : ""}><SectionHeading title={monthly ? "Ocupações do mês" : "Ocupações da Semana"} subtitle={adaptive ? undefined : `${dateBR(dates[0])} a ${dateBR(dates[6])}`} /></div>
      {adaptive && <><div className="flex gap-2 md:hidden" role="group" aria-label={monthly ? "Formato do mês" : "Formato da semana"}>
        <button type="button" className={mobileGrid ? "btn-secondary" : "btn-primary"} aria-pressed={!mobileGrid} onClick={() => setMobileGrid(false)}>Lista por dia</button>
        <button type="button" className={mobileGrid ? "btn-primary" : "btn-secondary"} aria-pressed={mobileGrid} onClick={() => setMobileGrid(true)}>Grade</button>
      </div>{!mobileGrid && <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-ink md:hidden"><input type="checkbox" className="h-4 w-4 accent-skybrand-600" checked={onlyRecordedDays} onChange={event => setOnlyRecordedDays(event.target.checked)} />Mostrar apenas dias com registros</label>}</>}
    </div>
    {loading ? <Busy /> : failure ? <div className="p-4"><Notice message={failure} /></div> : <div className="p-4 space-y-5">
      {adaptive && !mobileGrid && <div className="space-y-4 md:hidden" aria-label={monthly ? "Lista mensal por dia" : "Lista semanal por dia"}>
        {!listedDates.length && <Empty text={onlyRecordedDays ? "Nenhum dia com registros neste período e filtros." : "Nenhum dia no período consultado."} />}
        {listedDates.map(date => <section key={date} className="border-b border-line pb-3 last:border-b-0 space-y-3">
        <h3 className="font-semibold text-ink">{dateBR(date)}{date === today ? " · Hoje" : ""}</h3>
        {range && (date < range.from || date >= range.to) ? <p className="muted">Fora do período consultado</p> : !rooms.length ? <Empty text="Nenhum ambiente para os filtros selecionados." /> : rooms.map(room => <div key={room.id} className="space-y-2">
          <h4 className="font-semibold text-ink">{[room.code, room.name].filter(Boolean).join(" · ")}</h4>
          {shifts.map(shift => { const rows = slots.get(`${room.id}|${date}|${shift.id}`) ?? []; return <div key={shift.id} className="space-y-2 border-l-2 border-line pl-3">
            <p className={renderActivity ? "sr-only" : "text-sm text-muted-ink"}>{shift.name}</p>
            {rows.length ? rows.map(item => <div key={item.id}>{renderActivity ? renderActivity(item) : <Activity item={item} data={data} onOpen={onOpen} />}</div>) : <p className="text-sm text-muted-ink">Sem registros</p>}
          </div>; })}
          {!shifts.length && <p className="muted">Turnos não cadastrados; disponibilidade desconhecida.</p>}
          {occupations.filter(item => item.roomId === room.id && item.date === date && !shifts.some(shift => shift.id === item.shiftId)).map(item => <div key={item.id}><p className="muted">Turno não identificado</p>{renderActivity ? renderActivity(item) : <Activity item={item} data={data} onOpen={onOpen} />}</div>)}
        </div>)}
      </section>)}</div>}
      <div className={`${adaptive && !mobileGrid ? "hidden md:block" : ""} space-y-5`}>
      {!rooms.length ? <Empty text="Nenhum ambiente para os filtros selecionados." /> : rooms.map(room => <section key={room.id} className="border border-line rounded-lg overflow-hidden" aria-label={room.name}>
        <h3 className="bg-canvas font-bold text-ink border-b border-line">{adaptive ? <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500" aria-expanded={!collapsedRooms.includes(room.id)} aria-controls={`weekly-room-${room.id}`} onClick={() => setCollapsedRooms(current => current.includes(room.id) ? current.filter(id => id !== room.id) : [...current, room.id])}>
          <span className="min-w-0 [overflow-wrap:anywhere]">{[room.code, room.name].filter(Boolean).join(" · ")}</span><span className="shrink-0 text-sm font-normal">{occupations.filter(item => item.roomId === room.id && dates.includes(item.date)).length} {occupations.filter(item => item.roomId === room.id && dates.includes(item.date)).length === 1 ? "ocupação" : "ocupações"} · {collapsedRooms.includes(room.id) ? "Expandir" : "Recolher"}</span>
        </button> : <span className="block p-3">{[room.code, room.name].filter(Boolean).join(" · ")}</span>}</h3>
        <div id={adaptive ? `weekly-room-${room.id}` : undefined} hidden={adaptive && collapsedRooms.includes(room.id)}>
        <div className="overflow-x-auto" role="region" aria-label={`Grade ${monthly ? "mensal" : "semanal"} de ${room.name}`} tabIndex={0}>
          <table className="w-full min-w-[1150px] table-fixed text-sm" style={monthly ? { minWidth: Math.max(1150, dates.length * 144 + 96) } : undefined}>
            <caption className="sr-only">Turnos e ocupações de {room.name}</caption>
            <thead><tr><th scope="col" className="sticky left-0 z-10 bg-surface w-24 p-3 text-left text-ink">Turno</th>{dates.map(date => {
              const weekend = [0, 6].includes(new Date(`${date}T12:00:00`).getDay());
              const inside = !range || (date >= range.from && date < range.to);
              return <th key={date} scope="col" aria-label={`${dateBR(date)}${weekend ? ", fim de semana" : ""}`} aria-current={date === today ? "date" : undefined} className={`text-left text-ink ${monthly ? "p-1" : "p-3"} ${weekend ? "bg-skybrand-500/10" : ""} ${date === today ? "ring-2 ring-inset ring-skybrand-500" : ""}`}>
                {monthly ? <button type="button" disabled={!inside} onClick={() => onSelectDate?.(date)} aria-label={`${dateBR(date)}: ver ocupações do dia${weekend ? ", fim de semana" : ""}`} aria-controls="timeline-day-details" aria-pressed={selectedDate === date}
                  className={`min-h-11 w-full rounded-control px-2 text-left font-semibold tabular-nums hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500 disabled:opacity-50 ${selectedDate === date ? "ring-2 ring-inset ring-skybrand-500" : ""}`}>{date.slice(8)}</button>
                  : <>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}{date === today && <span className="block text-xs">Hoje</span>}</>}
              </th>;
            })}</tr></thead>
            <tbody>{shifts.map(shift => <tr key={shift.id} className="border-t border-line"><th scope="row" className="sticky left-0 z-10 bg-surface p-3 align-top text-left text-ink">{shift.name}</th>{(adaptive ? consecutiveSlots(dates, slots, room.id, shift.id, range) : dates.map(date => ({ dates: [date], items: slots.get(`${room.id}|${date}|${shift.id}`) ?? [] }))).map(group => {
              const date = group.dates[0], items = group.items, continuous = group.dates.length > 1;
              const first = items[0];
              const teacher = first?.actualTeacherName ?? data.teachers.find(entry => entry.id === first?.actualTeacherId)?.displayName ?? "Instrutor não informado";
              const className = first?.actualClassGroupName ?? data.classes.find(entry => entry.id === first?.actualClassGroupId)?.name ?? "Turma não informada";
              return <td key={date} colSpan={group.dates.length} onDragOver={event => { if (onDropSlot && (!range || (date >= range.from && date < range.to))) event.preventDefault(); }} onDrop={event => {
                if (!range || (date >= range.from && date < range.to)) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const index = Math.max(0, Math.min(group.dates.length - 1, Math.floor((event.clientX - rect.left) / rect.width * group.dates.length)));
                  onDropSlot?.(room.id, group.dates[index], shift.id, event);
                }
              }} className="p-2 align-top border-l border-line">{range && (date < range.from || date >= range.to) ? <span className="text-xs text-muted-ink">Fora do período consultado</span> : continuous ? <div className="relative min-h-11 overflow-hidden rounded-control border border-line border-l-2 border-l-skybrand-500 bg-canvas" aria-label={`Sequência de ${teacher} - ${className}`}>
                <p className="pointer-events-none px-3 py-3 font-semibold text-ink [overflow-wrap:anywhere]">{teacher} · {className}</p>
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${group.dates.length}, minmax(0, 1fr))` }}>{items.map(item => <div key={item.id}>{renderActivity ? renderActivity(item, true) : <button type="button" className="h-full min-h-11 w-full hover:bg-skybrand-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-skybrand-500" aria-label={`Detalhes de ${teacher}, ${dateBR(item.date)}`} onClick={() => onOpen(item)}><span className="sr-only">Ver detalhes</span></button>}</div>)}</div>
              </div> : items.length ? <div className="space-y-2">{items.map(item => <div key={item.id}>{renderActivity ? renderActivity(item) : <Activity item={item} data={data} onOpen={onOpen} />}</div>)}</div> : <span className="text-muted-ink" aria-label="Sem ocupação registrada; disponibilidade desconhecida">—</span>}</td>;
            })}</tr>)}</tbody>
          </table>
        </div>
        {!shifts.length && <p className="p-3 text-muted-ink">Turnos não cadastrados; disponibilidade desconhecida.</p>}
        {occupations.filter(item => item.roomId === room.id && dates.includes(item.date) && !shifts.some(shift => shift.id === item.shiftId)).map(item => <div className="p-3 border-t border-line" key={item.id}><p className="text-xs text-muted-ink">{dateBR(item.date)} - Turno não identificado</p>{renderActivity ? renderActivity(item) : <Activity item={item} data={data} onOpen={onOpen} />}</div>)}
        </div>
      </section>)}
      </div>
    </div>}
    </div>
  </Card>;
}
