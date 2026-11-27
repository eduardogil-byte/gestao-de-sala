import type { RoomIndicator } from "../lib/occupancyIndicators";
import { Card } from "./UI";

const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const valid = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value >= 0;

export function TimelineOccupancySummary({ rooms, loading, message }: {
  rooms?: (RoomIndicator | undefined)[]; loading?: boolean; message?: string;
}) {
  const available = !loading && !message && Boolean(rooms?.length) && rooms!.every(room => room != null);
  const hoursKnown = available && rooms!.every(room => valid(room?.capacityHours) && valid(room?.occupiedWithinCapacityHours));
  const daysKnown = available && rooms!.every(room => valid(room?.eligibleSlots) && valid(room?.occupiedEligibleSlots));
  const capacity = rooms?.reduce((total, room) => total + (room?.capacityHours ?? 0), 0) ?? 0;
  const occupied = rooms?.reduce((total, room) => total + (room?.occupiedWithinCapacityHours ?? 0), 0) ?? 0;
  const days = rooms?.reduce((total, room) => total + (room?.eligibleSlots ?? 0), 0) ?? 0;
  const occupiedDays = rooms?.reduce((total, room) => total + (room?.occupiedEligibleSlots ?? 0), 0) ?? 0;
  const outside = rooms?.reduce((total, room) => total + (room?.outsideCapacityHours ?? 0), 0) ?? 0;
  const percent = hoursKnown && capacity > 0 ? occupied / capacity * 100 : null;
  const cards = [
    { title: "Ocupação total", value: percent == null ? "—" : `${number(percent)}%`, detail: "Da capacidade ofertada no período" },
    { title: "Horas ocupadas", value: hoursKnown ? `${number(occupied)} h` : "—", detail: hoursKnown ? `de ${number(capacity)} h totais no período` : "Total não definido" },
    { title: "Dias de aula ocupados", value: daysKnown ? number(occupiedDays) : "—", detail: daysKnown ? `de ${number(days)} dias de aula no período` : "Total não definido" },
  ];
  return <section className="mb-4 space-y-2" aria-label="Indicadores gerais de ocupação" aria-busy={loading || undefined}>
    <dl className="grid gap-3 sm:grid-cols-3">
      {cards.map(card => <Card key={card.title} className="min-w-0 p-4">
        <dt className="text-sm font-medium text-muted-ink">{card.title}</dt>
        <dd className="mt-2 text-3xl font-semibold tabular-nums text-ink">{loading ? "—" : card.value}</dd>
        <dd className="mt-1 text-sm text-muted-ink">{loading ? "Calculando…" : card.detail}</dd>
      </Card>)}
    </dl>
    {(loading || message || !rooms?.length) && <p className="px-1 text-sm text-muted-ink" role="status">{loading ? "Calculando ocupação…" : message || "Nenhum ambiente para calcular os totais."}</p>}
    {available && outside > 0 && <p className="px-1 text-xs text-muted-ink">{number(outside)} h fora da oferta, não incluídas no percentual.</p>}
    {available && rooms!.some(room => (room?.unclassifiedOccupations ?? 0) > 0) && <p className="px-1 text-xs text-muted-ink">Há registros sem turno válido; suas horas não foram somadas.</p>}
  </section>;
}
