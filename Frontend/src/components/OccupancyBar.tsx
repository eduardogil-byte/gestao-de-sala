import { shiftColor, stackedOccupation, type RoomIndicator } from "../lib/occupancyIndicators";

const number = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);

export function OccupancyLegend({ room }: { room: RoomIndicator }) {
  const bar = stackedOccupation(room);
  if (!bar) return null;
  return <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-ink" aria-label="Distribuição na capacidade total">
    {bar.segments.map((segment) => <li key={segment.id} className="flex items-center gap-2">
      <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: shiftColor(segment.name) }} />
      {segment.name}: {number(segment.percent)} p.p. · {number(segment.hours)} h
    </li>)}
    <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-sm border border-line" style={{ backgroundColor: "var(--color-shift-free)" }} />Livre: {number(bar.freePercent)}%</li>
  </ul>;
}

// compact: somente a barra; a legenda detalhada pode ser exibida à parte.
export function OccupancyBar({ room, compact = false }: { room: RoomIndicator; compact?: boolean }) {
  const bar = stackedOccupation(room);
  if (!bar) return <p className="text-sm text-muted-ink">Distribuição sem base comprovada de capacidade.</p>;
  const summary = [...bar.segments.map((segment) => `${segment.name}: ${number(segment.percent)} pontos percentuais`),
    `Livre: ${number(bar.freePercent)}%`].join("; ");
  const track = <div role="img" aria-label={`${room.roomName} · ${summary}`} className={compact ? "sg-meter" : "flex h-3 overflow-hidden rounded-full border border-line"}>
    {bar.segments.map((segment) => <span key={segment.id} title={`${segment.name}: ${number(segment.hours)} h · ${number(segment.percent)} p.p. da capacidade total`}
      style={{ width: `${segment.percent}%`, backgroundColor: shiftColor(segment.name) }} />)}
    <span title={`Livre: ${number(bar.freePercent)}%`} style={{ width: `${bar.freePercent}%`, backgroundColor: "var(--color-shift-free)" }} />
  </div>;
  return compact ? track : <div className="space-y-3">{track}<OccupancyLegend room={room} /></div>;
}
