import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  GraduationCap,
  Users,
  MoveRight,
} from "lucide-react";
import { useData } from "../lib/data";
import { dateTimeBR, roomKind } from "../lib/utils";
import { Card, Empty, Title, Badge, MetricCard, SectionHeading } from "../components/UI";
import { UsagePanel } from "../components/UsagePanel";
import { ManagerDashboard } from "../components/ManagerDashboard";
import type { Occupation, User } from "../types";

export function Dashboard({
  user,
  navigate,
  occupations,
  openTimeline,
  openOpportunity,
  onExport,
  unread,
}: {
  user: User;
  navigate: (page: string) => void;
  occupations: Occupation[];
  openTimeline: (semesterId: number, roomId: number) => void;
  openOpportunity: (semesterId: number, roomId: number) => void;
  onExport: (semesterId: number, secondSemesterId: number | null, roomId: number | null) => void;
  unread: number | null;
}) {
  const { data } = useData();
  const admin = user.roles.includes("Admin");
  const stats = [
    {
      title: "Ambientes cadastrados",
      value: data.rooms.length,
      icon: DoorOpen,
      tone: "blue" as const,
      detail: "Recursos e capacidade física",
      page: "rooms",
    },
    {
      title: "Professores",
      value: data.teachers.length,
      icon: Users,
      tone: "violet" as const,
      detail: "Perfis pedagógicos cadastrados",
      page: "teachers",
    },
    {
      title: "Turmas",
      value: data.classes.length,
      icon: GraduationCap,
      tone: "amber" as const,
      detail: "Ofertas acadêmicas cadastradas",
      page: "academic",
    },
    {
      title: admin ? "Reservas registradas" : "Minhas reservas",
      value: data.bookings.length,
      icon: Clock3,
      tone: "emerald" as const,
      detail: admin ? "Todos os estados registrados" : "Solicitações vinculadas à sua conta",
      page: "bookings",
    },
  ];
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
  return (
    <>
      <Title
        title={`Olá, ${user.displayName.split(" ")[0]}!`}
        subtitle="Acompanhe salas, aulas e solicitações da instituição."
      />
      <div className="rounded-panel bg-navy-900 text-white p-6 md:p-8 mb-6 relative overflow-hidden shadow-soft border border-navy-700">
        <div className="absolute right-0 top-0 w-60 h-60 rounded-full border-[40px] border-white/5 translate-x-1/3 -translate-y-1/3" />
        <div className="relative z-10 max-w-xl">
          <span className="uppercase tracking-wider text-xs font-semibold text-blue-200">
            Planejamento de ambientes
          </span>
          <h2 className="text-xl md:text-[27px] font-bold tracking-tight mt-3">
            Mais organização. Menos conflitos.
          </h2>
          <p className="text-blue-100/85 text-sm mt-2 leading-relaxed">
            Reserve por turno, visualize conflitos e encontre a sala mais
            adequada para cada aula.
          </p>
          <button
            className="btn-primary mt-5"
            onClick={() => navigate("bookings")}
          >
            Reservar uma sala
            <ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-6">
        {stats.map((s) => (
          <MetricCard key={s.title} label={s.title} value={s.value} detail={s.detail}
            icon={s.icon} tone={s.tone} onClick={() => navigate(s.page)} />
        ))}
      </div>
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-5">
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <SectionHeading title="Próximas ocupações" subtitle="Aulas, reservas e bloqueios"
              action={<button
              className="text-sm font-semibold text-skybrand-700 flex gap-1 items-center"
              onClick={() => navigate("agenda")}
            >
              Ver agenda <MoveRight size={15} />
            </button>} />
          </div>
          {soon.length === 0 ? (
            <Empty text="Nenhuma ocupação encontrada nos próximos dias. Consulte a agenda para outro período." />
          ) : (
            <div>
              {soon.slice(0, 5).map((o) => (
                <div
                  key={o.id}
                  className="px-5 py-3.5 border-b border-slate-100 last:border-b-0 flex items-center gap-3"
                >
                  <div className="h-10 w-10 shrink-0 bg-sky-50 text-skybrand-700 flex items-center justify-center rounded-xl">
                    <CalendarDays size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {o.description || "Ocupação de sala"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {dateTimeBR(o.startsAt)} ·{" "}
                      {data.rooms.find((r) => r.id === o.roomId)?.name ||
                        `Sala ${o.roomId}`}
                    </p>
                  </div>
                  {o.isBorrowed ? (
                    <span className="pill bg-blue-50 text-blue-700">
                      Emprestada
                    </span>
                  ) : (
                    <Badge
                      status={o.kind === "Aula" ? "Publicada" : "Aprovada"}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="section-title">Ambientes por tipo</h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Distribuição dos espaços cadastrados
            </p>
            {["Comum", "Laboratorio", "Hibrida"].map((k) => {
              const count = data.rooms.filter((r) => r.kind === k).length;
              return (
                <div key={k} className="mb-4 last:mb-0">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-600">{roomKind(k)}</span>
                    <b className="text-slate-700">{count}</b>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-2 bg-skybrand-500 rounded-full"
                      style={{
                        width: `${data.rooms.length ? (100 * count) / data.rooms.length : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
          <Card className="p-5">
            <div className="flex gap-2 items-center mb-3">
              <CheckCircle2 size={19} className="text-emerald-600" />
              <h3 className="section-title">Comece por aqui</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              {admin
                ? "Cadastre salas, softwares e turmas para começar a receber alocações."
                : "Escolha uma turma, os dias e o turno para reservar um ambiente."}
            </p>
            <button
              onClick={() => navigate(admin ? "rooms" : "bookings")}
              className="btn-secondary w-full"
            >
              {admin ? "Configurar ambientes" : "Criar reserva"}
              <MoveRight size={15} />
            </button>
          </Card>
        </div>
      </div>
      {admin ? <ManagerDashboard admin={admin} onTimeline={openTimeline} onOpportunity={openOpportunity}
        onExport={onExport} /> : <UsagePanel />}
    </>
  );
}
