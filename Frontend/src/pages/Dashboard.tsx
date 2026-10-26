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
import { Card, Empty, Title, Badge } from "../components/UI";
import { UsagePanel } from "../components/UsagePanel";
import type { Occupation, User } from "../types";

export function Dashboard({
  user,
  navigate,
  occupations,
}: {
  user: User;
  navigate: (page: string) => void;
  occupations: Occupation[];
}) {
  const { data } = useData();
  const admin = user.roles.includes("Admin");
  const stats = [
    {
      title: "Ambientes cadastrados",
      value: data.rooms.length,
      icon: DoorOpen,
      color: "bg-sky-50 text-sky-700",
      page: "rooms",
    },
    {
      title: "Professores",
      value: data.teachers.length,
      icon: Users,
      color: "bg-violet-50 text-violet-700",
      page: "teachers",
    },
    {
      title: "Turmas",
      value: data.classes.length,
      icon: GraduationCap,
      color: "bg-amber-50 text-amber-700",
      page: "academic",
    },
    {
      title: admin ? "Reservas registradas" : "Minhas reservas",
      value: data.bookings.length,
      icon: Clock3,
      color: "bg-emerald-50 text-emerald-700",
      page: "bookings",
    },
  ];
  const soon = occupations
    .filter((o) => new Date(o.startsAt).getTime() >= Date.now())
    .slice(0, 5);
  return (
    <>
      <Title
        title={`Olá, ${user.displayName.split(" ")[0]}!`}
        subtitle="Acompanhe salas, aulas e solicitações da instituição."
      />
      <div className="rounded-2xl bg-gradient-to-r from-navy-900 via-navy-800 to-[#315a82] text-white p-6 md:p-8 mb-6 relative overflow-hidden">
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
            className="mt-5 bg-white text-navy-900 font-semibold rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-slate-100"
            onClick={() => navigate("bookings")}
          >
            Reservar uma sala
            <ArrowUpRight size={17} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-6">
        {stats.map((s) => (
          <button
            onClick={() => navigate(s.page)}
            key={s.title}
            className="card p-4 text-left hover:border-skybrand-200 transition"
          >
            <div className="flex items-center justify-between gap-2 mb-5">
              <span className="text-xs font-medium text-slate-500">
                {s.title}
              </span>
              <span
                className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${s.color}`}
              >
                <s.icon size={18} />
              </span>
            </div>
            <div className="flex items-end justify-between">
              <div className="text-3xl font-bold tracking-tight text-slate-800">
                {s.value}
              </div>
              <ArrowUpRight className="text-slate-300" size={18} />
            </div>
          </button>
        ))}
      </div>
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-5">
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="section-title">Próximas ocupações</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Aulas, reservas e bloqueios
              </p>
            </div>
            <button
              className="text-sm font-semibold text-skybrand-700 flex gap-1 items-center"
              onClick={() => navigate("agenda")}
            >
              Ver agenda <MoveRight size={15} />
            </button>
          </div>
          {soon.length === 0 ? (
            <Empty text="Nenhuma ocupação encontrada nos próximos dias. Consulte a agenda para outro período." />
          ) : (
            <div>
              {soon.map((o) => (
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
      <UsagePanel />
    </>
  );
}
