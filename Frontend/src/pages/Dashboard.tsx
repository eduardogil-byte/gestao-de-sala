import { ArrowUpRight, CalendarDays } from "lucide-react";
import { useData } from "../lib/data";
import { dateTimeBR } from "../lib/utils";
import { PageHeading, Panel, SenaiScope, StatCard } from "../components/senai/SenaiUI";
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
    const confirmed = data.bookings.filter((b) => b.status === "Aprovada").length;
    const assignments = data.assignments.filter((a) => a.teacherId === user.id && !a.endedAtUtc);
    const classCount = new Set(assignments.map((a) => a.classGroupId)).size;
    return <SenaiScope>
      <PageHeading eyebrow="Visão do instrutor" title={`Olá, ${user.displayName.split(" ")[0]}!`} subtitle="Suas próximas aulas, reservas e solicitações em um só lugar."
        action={<button type="button" className="btn-primary" onClick={() => navigate("bookings")}>Criar reserva <ArrowUpRight size={16} aria-hidden="true" /></button>} />
      <section aria-label="Resumo do instrutor" className="sg-stats sg-stats-5">
        <StatCard label="Turmas" value={classCount} detail="Com atribuição ativa" />
        <StatCard label="Atribuições" value={assignments.length} detail="Disciplinas e UCs ativas" />
        <StatCard tone="amber" label="Reservas pendentes" value={pending.length} detail="Aguardando escolha de sala" />
        <StatCard tone="green" label="Reservas confirmadas" value={confirmed} detail="Solicitações com sala confirmada" />
        <StatCard label="Empréstimos" value={received.length + sent.length} detail={`${received.length} recebidos · ${sent.length} enviados`} />
      </section>
      <Panel title="Minhas turmas e UCs" subtitle="Somente atribuições ativas vinculadas à sua conta."
        action={<button type="button" className="btn-secondary" onClick={() => navigate("instructor-agenda")}>Minha agenda</button>}>
        {assignments.length === 0 ? <p className="sg-empty">Nenhuma atribuição ativa.</p> :
          <div className="sg-scroll">{assignments.map((assignment) => {
            const group = data.classes.find((c) => c.id === assignment.classGroupId);
            const semester = data.semesters.find((item) => item.id === assignment.semesterId);
            return <div key={assignment.id} className="sg-item"><div className="sg-item-text">
              <strong>{group ? [group.code, group.name].filter(Boolean).join(" · ") : `Turma ${assignment.classGroupId}`}</strong>
              <small>{assignment.disciplineName} · {semester?.name ?? "Semestre não informado"}</small>
            </div></div>;
          })}</div>}
      </Panel>
      <Panel title="Próximas aulas e reservas" subtitle="Ocupações confirmadas nos próximos 30 dias."
        action={<div className="sg-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate("instructor-agenda")}>Ver minha agenda</button>
          <button type="button" className="btn-secondary" onClick={() => navigate("agenda")}>Disponibilidade dos ambientes</button>
        </div>}>
        {upcoming.length === 0 ? <p className="sg-empty">Nenhuma aula nos próximos 30 dias. Consulte sua agenda ou crie uma reserva.</p> :
          <div>{upcoming.map((o) => <div key={o.id} className="sg-item items-center flex-wrap">
            <span className="sg-item-icon"><CalendarDays size={19} aria-hidden="true" /></span>
            <div className="sg-item-text"><strong>{o.description || "Ocupação de ambiente"}</strong>
              <small>{dateTimeBR(o.startsAt)} · {data.rooms.find((r) => r.id === o.roomId)?.name || `Sala ${o.roomId}`}</small></div>
            <span className="sg-badge is-success">{o.isBorrowed ? "Empréstimo efetivado" : "Confirmada"}</span>
          </div>)}</div>}
      </Panel>
      <div className="sg-grid sg-grid-thirds">
        <Panel title="Reservas">
          <p className="sg-note">{pending.length} aguardando escolha de sala · {confirmed} confirmadas</p>
          <button type="button" className="btn-secondary mt-4" onClick={() => navigate("bookings")}>Acompanhar reservas</button>
        </Panel>
        <Panel title="Empréstimos">
          <p className="sg-note">{received.length} recebidos · {sent.length} enviados</p>
          {(needsReply > 0 || needsDisposition > 0) && <p className="sg-warning mt-2">{needsReply} para responder · {needsDisposition} para definir a situação da turma</p>}
          <button type="button" className="btn-secondary mt-4" onClick={() => navigate("loans")}>Ver solicitações</button>
        </Panel>
        <Panel title="Notificações">
          <p className="sg-note">{unread === null ? "Não foi possível consultar avisos agora." : unread > 0 ? `${unread} aviso(s) não lido(s) que podem precisar de atenção.` : "Nenhum aviso não lido."}</p>
          <button type="button" className="btn-secondary mt-4" onClick={() => navigate("notifications")}>Abrir notificações</button>
        </Panel>
      </div>
    </SenaiScope>;
  }
  return <ManagerDashboard admin={admin} onTimeline={openTimeline} onOpportunity={openOpportunity} onExport={onExport} />;
}
