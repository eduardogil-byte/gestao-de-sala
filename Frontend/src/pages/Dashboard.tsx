import {
  ArrowUpRight,
} from "lucide-react";
import { useData } from "../lib/data";
import { dateTimeBR } from "../lib/utils";
import { Card, Empty, Title } from "../components/UI";
import { ManagerDashboard } from "../components/ManagerDashboard";
import type { AgendaOccupation, User } from "../types";

export function Dashboard({
  user,
  navigate,
  occupations,
  openTimeline,
  openOpportunity,
  onExport,
  unread,
  agendaLoading,
  agendaError,
  onOpenOccupation,
}: {
  user: User;
  navigate: (page: string) => void;
  occupations: AgendaOccupation[];
  openTimeline: (semesterId: number, roomId: number) => void;
  openOpportunity: (semesterId: number, roomId: number) => void;
  onExport: (semesterId: number, secondSemesterId: number | null, roomId: number | null) => void;
  unread: number | null;
  agendaLoading?: boolean;
  agendaError?: string;
  onOpenOccupation?: (item: AgendaOccupation) => void;
}) {
  const { data } = useData();
  const admin = user.roles.includes("Admin");
  const soon = occupations
    .filter((o) => new Date(o.startsAt).getTime() >= Date.now())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (!admin) {
    const upcoming = soon.filter((o) => o.actualTeacherId === user.id && o.kind !== "Bloqueio").slice(0, 5);
    const pending = data.bookings.filter((b) => b.status === "Pendente");
    const received = data.loans.filter((l) => l.borrowerId === user.id);
    const sent = data.loans.filter((l) => l.ownerTeacherId === user.id);
    const needsReply = received.filter((l) => l.status === "AguardandoDestinatario").length;
    const needsDisposition = sent.filter((l) => l.status === "AguardandoSituacaoTitular").length;
    return <>
      <Title title={`Olá, ${user.displayName.split(" ")[0]}!`} subtitle="Suas próximas aulas, reservas e solicitações em um só lugar." />
      <div className="flex flex-wrap gap-2 mb-6">
        <button type="button" className="btn-primary" onClick={() => navigate("bookings")}>Criar reserva <ArrowUpRight size={16} /></button>
        <button type="button" className="btn-secondary" onClick={() => navigate("instructor-agenda")}>Minha agenda</button>
        <button type="button" className="btn-secondary" onClick={() => navigate("agenda")}>Disponibilidade dos ambientes</button>
        <button type="button" className="btn-secondary" onClick={() => navigate("loans")}>Acompanhar empréstimos</button>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Próximas aulas e reservas</h2>
            <button type="button" className="text-sm font-semibold text-skybrand-700 underline" onClick={() => navigate("instructor-agenda")}>Ver minha agenda</button>
          </div>
          {upcoming.length === 0 ? <Empty title="Nenhuma aula nos próximos 30 dias" text="Consulte sua agenda ou crie uma reserva." /> :
            <div className="divide-y divide-line">{upcoming.map((o) => <div key={o.id} className="p-4 sm:px-5 flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-semibold">{o.description || "Ocupação de ambiente"}</p>
                <p className="text-sm text-muted-ink">{dateTimeBR(o.startsAt)} · {data.rooms.find((r) => r.id === o.roomId)?.name || `Sala ${o.roomId}`}</p></div>
              <span className="pill bg-emerald-50 text-emerald-700">{o.isBorrowed ? "Empréstimo efetivado" : "Confirmada"}</span>
            </div>)}</div>}
        </Card>
        <div className="space-y-5">
          <Card className="p-5"><h2 className="section-title">Reservas</h2>
            <p className="text-sm text-muted-ink mt-3">{pending.length} aguardando escolha de sala · {data.bookings.filter((b) => b.status === "Aprovada").length} confirmadas</p>
            <button type="button" className="btn-secondary mt-4" onClick={() => navigate("bookings")}>Acompanhar reservas</button>
          </Card>
          <Card className="p-5"><h2 className="section-title">Empréstimos</h2>
            <p className="text-sm text-muted-ink mt-3">{received.length} recebidos · {sent.length} enviados</p>
            {(needsReply > 0 || needsDisposition > 0) && <p className="text-sm font-medium text-amber-800 mt-2">{needsReply} para responder · {needsDisposition} para definir a situação da turma</p>}
            <button type="button" className="btn-secondary mt-4" onClick={() => navigate("loans")}>Ver solicitações</button>
          </Card>
          <Card className="p-5"><h2 className="section-title">Notificações</h2>
            <p className="text-sm text-muted-ink mt-3">{unread === null ? "Não foi possível consultar avisos agora." : unread > 0 ? `${unread} aviso(s) não lido(s) que podem precisar de atenção.` : "Nenhum aviso não lido."}</p>
            <button type="button" className="btn-secondary mt-4" onClick={() => navigate("notifications")}>Abrir notificações</button>
          </Card>
        </div>
      </div>
    </>;
  }
  return <ManagerDashboard admin={admin} onTimeline={openTimeline} onOpportunity={openOpportunity} onExport={onExport} />;
}
