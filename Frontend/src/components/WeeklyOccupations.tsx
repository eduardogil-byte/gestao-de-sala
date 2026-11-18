import { useState } from "react";
import { useData, type Catalog } from "../lib/data";
import { indexOccupations } from "../lib/roomTimeline";
import { dateBR, hour, localDate, statusText } from "../lib/utils";
import { weekDates } from "./BookingCalendars";
import { Busy, Card, Empty, Notice, SectionHeading } from "./UI";
import type { AgendaOccupation } from "../types";

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
    className={`block w-full min-h-11 rounded-lg border border-l-4 p-3 text-left text-sm leading-5 [overflow-wrap:anywhere] transition-colors hover:brightness-110 ${conflicts.length ? "border-rose-200 bg-rose-50 text-rose-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
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

export function WeeklyOccupations({ occupations, loading = false, error = "", onOpen, today = localDate(new Date()) }: {
  occupations: AgendaOccupation[]; loading?: boolean; error?: string;
  onOpen: (item: AgendaOccupation) => void; today?: string;
}) {
  const { data, error: catalogError } = useData();
  const [selectedDate, setSelectedDate] = useState(today);
  const dates = weekDates(today);
  const date = dates.includes(selectedDate) ? selectedDate : today;
  const { slots, days } = indexOccupations(occupations);
  const items = days.get(date) ?? [];
  const rooms = new Map(data.rooms.map((room) => [room.id, { id: room.id, code: room.code, name: room.name }]));
  for (const item of items) {
    if (!rooms.has(item.roomId)) rooms.set(item.roomId, { id: item.roomId, code: null, name: item.roomName || `Ambiente ${item.roomId}` });
  }
  const shifts = [...data.shifts].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const failure = error || catalogError;
  return <Card className="mt-6 overflow-hidden">
    <div className="p-4 sm:p-5 border-b border-line">
      <SectionHeading title="Ocupações da Semana" subtitle={`${dateBR(dates[0])} a ${dateBR(dates[6])} · Selecione o dia para consultar ambientes e turnos.`} />
      <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="Dia das ocupações">
        {dates.map((day) => <button key={day} type="button" aria-pressed={date === day}
          aria-label={dateBR(day)} onClick={() => setSelectedDate(day)}
          className={`btn-secondary !px-3 ${date === day ? "border-skybrand-500 ring-2 ring-inset ring-skybrand-500" : ""}`}>
          {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" })}
        </button>)}
      </div>
      <p className="text-xs text-muted-ink mt-3">Sem ocupação registrada não significa Livre. A oferta e a disponibilidade dos turnos não são confirmadas por esta consulta.</p>
    </div>
    {loading ? <Busy /> : failure ? <div className="p-4"><Notice message={failure} /></div> : <div className="p-4 sm:p-5 space-y-4">
      <h3 className="text-sm font-semibold text-ink">{dateBR(date)}</h3>
      {rooms.size === 0 ? <Empty text="Nenhum ambiente ou ocupação registrado para exibir." /> : [...rooms.values()].map((room) => {
        const unknown = items.filter((item) => item.roomId === room.id && !shifts.some((shift) => shift.id === item.shiftId));
        const rows = [...shifts.map((shift) => ({ key: String(shift.id), name: shift.name, items: slots.get(`${room.id}|${date}|${shift.id}`) ?? [] })),
          ...(unknown.length ? [{ key: "unknown", name: "Turno não identificado", items: unknown }] : [])];
        return <section key={room.id} className="rounded-lg border border-line overflow-hidden" aria-label={`${room.code ? `${room.code} · ` : ""}${room.name}`}>
          <h4 className="bg-canvas px-3 sm:px-4 py-3 text-sm font-bold text-ink border-b border-line break-words">{room.code && <span className="block text-base">{room.code}</span>}{room.name}</h4>
          {rows.length ? <table className="w-full table-fixed text-sm">
            <caption className="sr-only">Turnos e ocupações de {room.name} em {dateBR(date)}</caption>
            <thead className="text-left text-muted-ink"><tr><th scope="col" className="w-24 sm:w-32 px-3 py-2 font-semibold">Turno</th><th scope="col" className="px-3 py-2 font-semibold">Ocupação</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.key} className="border-t border-line">
              <th scope="row" className="px-3 py-3 align-top text-left font-semibold text-ink break-words">{row.name}</th>
              <td className="p-2 sm:p-3 align-top">{row.items.length ? <div className="space-y-2">{row.items.map((item) => <Activity key={item.id} item={item} data={data} onOpen={onOpen} />)}</div> : <p className="text-xs text-muted-ink py-1">Sem ocupação registrada · disponibilidade não confirmada</p>}</td>
            </tr>)}</tbody>
          </table> : <p className="p-3 text-sm text-muted-ink">Não há turnos cadastrados. Disponibilidade não confirmada.</p>}
        </section>;
      })}
    </div>}
  </Card>;
}
