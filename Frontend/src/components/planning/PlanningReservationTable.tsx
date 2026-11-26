// Origem: features/reservations/PlanningReservationTable.tsx
import { dateLabel } from "./data";

export type ReservationRow = { key: string; date: string; teacher: string; group: string; unit: string; modality: string;
  room: string; shift: string; status: { label: string; tone: string } };

export function PlanningReservationTable({ rows, selected, onSelect }: { rows: ReservationRow[]; selected?: string; onSelect?: (key: string) => void }) {
  return <div className="planning-reference-tablewrap"><table className="planning-reference-table"><thead><tr><th>Data</th><th>Instrutor / turma</th><th>Unidade curricular</th><th>Ambiente</th><th>Turno</th><th>Situação</th></tr></thead><tbody>{rows.length ? rows.map((row) =>
    <tr key={row.key} className={onSelect ? `planning-reference-clickable${selected === row.key ? " is-selected" : ""}` : ""} onDoubleClick={onSelect ? () => onSelect(row.key) : undefined}
      onKeyDown={onSelect ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(row.key); } } : undefined} tabIndex={onSelect ? 0 : undefined} aria-selected={onSelect ? selected === row.key : undefined}>
      <td>{dateLabel(row.date)}</td>
      <td><strong>{row.teacher}</strong><small>{row.group}</small></td>
      <td>{row.unit}<small>{row.modality}</small></td><td>{row.room}</td><td>{row.shift}</td>
      <td><span className={`planning-reference-status ${row.status.tone}`}>{row.status.label}</span></td>
    </tr>) : <tr><td colSpan={6} className="planning-reference-empty">Nenhuma reserva corresponde aos filtros.</td></tr>}</tbody></table></div>;
}
