import { useState } from "react";
import { useData, type Catalog } from "../lib/data";
import { indexOccupations } from "../lib/roomTimeline";
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
  dates = weekDates(today), rooms: filteredRooms, shifts: filteredShifts, renderActivity, range, onDropSlot, adaptive = false }: {
  occupations: AgendaOccupation[]; loading?: boolean; error?: string;
  onOpen: (item: AgendaOccupation) => void; today?: string; dates?: string[];
  rooms?: Room[]; shifts?: Shift[]; renderActivity?: (item: AgendaOccupation) => React.ReactNode;
  onDropSlot?: (roomId: number, date: string, shiftId: number, event: React.DragEvent<HTMLTableCellElement>) => void;
  range?: { from: string; to: string } | null;
  adaptive?: boolean;
}) {
  const [mobileGrid, setMobileGrid] = useState(false);
  const [collapsedRooms, setCollapsedRooms] = useState<number[]>([]);
  const { data, error: catalogError } = useData();
  const { slots } = indexOccupations(occupations);
  const rooms = [...(filteredRooms ?? data.rooms)];
  if (!filteredRooms) for (const item of occupations) {
    if (!rooms.some(room => room.id === item.roomId)) rooms.push({ id: item.roomId, name: item.roomName || `Ambiente ${item.roomId}`, code: null } as Room);
  }
  const shifts = [...(filteredShifts ?? data.shifts)].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const failure = error || catalogError;
  return <Card className="mb-5 overflow-hidden">
    <div className="p-4 border-b border-line">
      <SectionHeading title="Ocupações da Semana" subtitle={`${dateBR(dates[0])} a ${dateBR(dates[6])}`} />
      {adaptive && <div className="mt-3 flex gap-2 md:hidden" role="group" aria-label="Formato da semana">
        <button type="button" className={mobileGrid ? "btn-secondary" : "btn-primary"} aria-pressed={!mobileGrid} onClick={() => setMobileGrid(false)}>Lista por dia</button>
        <button type="button" className={mobileGrid ? "btn-primary" : "btn-secondary"} aria-pressed={mobileGrid} onClick={() => setMobileGrid(true)}>Grade</button>
      </div>}
    </div>
    {loading ? <Busy /> : failure ? <div className="p-4"><Notice message={failure} /></div> : <div className="p-4 space-y-5">
      {adaptive && !mobileGrid && <div className="space-y-4 md:hidden" aria-label="Lista semanal por dia">{dates.map(date => <section key={date} className="rounded-lg border border-line p-3 space-y-3">
        <h3 className="font-semibold text-ink">{dateBR(date)}{date === today ? " · Hoje" : ""}</h3>
        {range && (date < range.from || date >= range.to) ? <p className="muted">Fora do período consultado</p> : !rooms.length ? <Empty text="Nenhum ambiente para os filtros selecionados." /> : rooms.map(room => <div key={room.id} className="space-y-2">
          <h4 className="font-semibold text-ink">{[room.code, room.name].filter(Boolean).join(" · ")}</h4>
          {shifts.map(shift => { const rows = slots.get(`${room.id}|${date}|${shift.id}`) ?? []; return <div key={shift.id} className="space-y-2 border-l-2 border-line pl-3">
            <p className="text-sm text-muted-ink">{shift.name}</p>
            {rows.length ? rows.map(item => <div key={item.id}>{renderActivity ? renderActivity(item) : <Activity item={item} data={data} onOpen={onOpen} />}</div>) : <p className="text-sm text-muted-ink">Sem registro · disponibilidade desconhecida</p>}
          </div>; })}
          {!shifts.length && <p className="muted">Turnos não cadastrados; disponibilidade desconhecida.</p>}
          {occupations.filter(item => item.roomId === room.id && item.date === date && !shifts.some(shift => shift.id === item.shiftId)).map(item => <div key={item.id}><p className="muted">Turno não identificado</p>{renderActivity ? renderActivity(item) : <Activity item={item} data={data} onOpen={onOpen} />}</div>)}
        </div>)}
      </section>)}</div>}
      <div className={`${adaptive && !mobileGrid ? "hidden md:block" : ""} space-y-5`}>
      {!rooms.length ? <Empty text="Nenhum ambiente para os filtros selecionados." /> : rooms.map(room => <section key={room.id} className="border border-line rounded-lg overflow-hidden" aria-label={room.name}>
        <h3 className="bg-canvas font-bold text-ink border-b border-line">{adaptive ? <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500" aria-expanded={!collapsedRooms.includes(room.id)} aria-controls={`weekly-room-${room.id}`} onClick={() => setCollapsedRooms(current => current.includes(room.id) ? current.filter(id => id !== room.id) : [...current, room.id])}>
          <span>{[room.code, room.name].filter(Boolean).join(" · ")}</span><span className="text-sm font-normal">{occupations.filter(item => item.roomId === room.id && dates.includes(item.date)).length} ocupações · {collapsedRooms.includes(room.id) ? "Expandir" : "Recolher"}</span>
        </button> : <span className="block p-3">{[room.code, room.name].filter(Boolean).join(" · ")}</span>}</h3>
        <div id={adaptive ? `weekly-room-${room.id}` : undefined} hidden={adaptive && collapsedRooms.includes(room.id)}>
        <div className="overflow-x-auto" role="region" aria-label={`Grade semanal de ${room.name}`} tabIndex={0}>
          <table className="w-full min-w-[1150px] table-fixed text-sm">
            <caption className="sr-only">Turnos e ocupações de {room.name}</caption>
            <thead><tr><th scope="col" className="sticky left-0 z-10 bg-surface w-24 p-3 text-left text-ink">Turno</th>{dates.map(date => <th key={date} scope="col" aria-current={date === today ? "date" : undefined} className={`p-3 text-left text-ink ${date === today ? "ring-2 ring-inset ring-skybrand-500" : ""}`}>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}{date === today && <span className="block text-xs">Hoje</span>}</th>)}</tr></thead>
            <tbody>{shifts.map(shift => <tr key={shift.id} className="border-t border-line"><th scope="row" className="sticky left-0 z-10 bg-surface p-3 align-top text-left text-ink">{shift.name}</th>{dates.map(date => {
              const items = slots.get(`${room.id}|${date}|${shift.id}`) ?? [];
              return <td key={date} onDragOver={event => { if (onDropSlot && (!range || (date >= range.from && date < range.to))) event.preventDefault(); }} onDrop={event => { if (!range || (date >= range.from && date < range.to)) onDropSlot?.(room.id, date, shift.id, event); }} className="p-2 align-top border-l border-line">{range && (date < range.from || date >= range.to) ? <span className="text-xs text-muted-ink">Fora do período consultado</span> : items.length ? <div className="space-y-2">{items.map(item => <div key={item.id}>{renderActivity ? renderActivity(item) : <Activity item={item} data={data} onOpen={onOpen} />}</div>)}</div> : <span className="text-muted-ink" aria-label="Sem ocupação registrada; disponibilidade desconhecida">{ "\u2014" }</span>}</td>;
            })}</tr>)}</tbody>
          </table>
        </div>
        {!shifts.length && <p className="p-3 text-muted-ink">Turnos não cadastrados; disponibilidade desconhecida.</p>}
        {occupations.filter(item => item.roomId === room.id && dates.includes(item.date) && !shifts.some(shift => shift.id === item.shiftId)).map(item => <div className="p-3 border-t border-line" key={item.id}><p className="text-xs text-muted-ink">{dateBR(item.date)} - Turno não identificado</p>{renderActivity ? renderActivity(item) : <Activity item={item} data={data} onOpen={onOpen} />}</div>)}
        </div>
      </section>)}
      </div>
    </div>}
  </Card>;
}
