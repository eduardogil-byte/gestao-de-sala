import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  Layers3,
  LogOut,
  Menu,
  RefreshCcw,
  Users,
  X,
} from "lucide-react";
import { Access } from "./pages/Access";
import { Dashboard } from "./pages/Dashboard";
import { Agenda } from "./pages/Agenda";
import { Rooms } from "./pages/Rooms";
import { Academic } from "./pages/Academic";
import { Teachers } from "./pages/Teachers";
import { Schedules } from "./pages/Schedules";
import { Bookings } from "./pages/Bookings";
import { Loans } from "./pages/Loans";
import { Notifications } from "./pages/Notifications";
import { DataProvider, useData } from "./lib/data";
import { read, tokenStore } from "./lib/api";
import { localDate, nextDate, resultMessage } from "./lib/utils";
import { Busy, Notice } from "./components/UI";
import type { User, Occupation } from "./types";

type Page =
  | "dashboard"
  | "agenda"
  | "rooms"
  | "academic"
  | "teachers"
  | "schedules"
  | "bookings"
  | "loans"
  | "notifications";
const nav: [Page, string, typeof LayoutDashboard][] = [
  ["dashboard", "Visão geral", LayoutDashboard],
  ["agenda", "Agenda", CalendarDays],
  ["rooms", "Ambientes", DoorOpen],
  ["academic", "Turmas e disciplinas", GraduationCap],
  ["teachers", "Professores", Users],
  ["bookings", "Reservas", ClipboardList],
  ["loans", "Empréstimos", Handshake],
  ["notifications", "Notificações", Bell],
];

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { data, loading, error, reload } = useData();
  const [page, setPage] = useState<Page>("dashboard");
  const [menu, setMenu] = useState(false);
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [agendaError, setAgendaError] = useState("");
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await read<{ count: number }>(
          "/notifications/unread-count",
        );
        if (active) setUnread(result.count);
      } catch {
        /* A consulta pode ser repetida na próxima atualização. */
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("salagest:notifications-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("salagest:notifications-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const admin = user.roles.includes("Admin");
  const reloadAgenda = useCallback(async () => {
    try {
      const from = localDate(new Date());
      const rows = await read<Occupation[]>(
        `/agenda?from=${from}T00:00:00&to=${nextDate(from, 30)}T00:00:00`,
      );
      setOccupations(rows);
      setAgendaError("");
    } catch (e) {
      setAgendaError(resultMessage(e));
    }
  }, []);
  useEffect(() => {
    void reloadAgenda();
  }, [reloadAgenda]);
  const open = (p: string) => {
    setPage(p as Page);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const current = nav.find((n) => n[0] === page);
  return (
    <div className="min-h-screen bg-[#f7f9fc] flex">
      {menu && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-30 lg:hidden"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-[255px] bg-navy-900 text-white flex flex-col transition-transform lg:translate-x-0 ${menu ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-[83px] flex items-center justify-between px-6 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-skybrand-500 flex items-center justify-center">
              <Layers3 size={23} />
            </div>
            <span className="text-[22px] font-bold tracking-tight">
              SalaGest
            </span>
          </div>
          <button
            aria-label="Fechar menu"
            className="lg:hidden"
            onClick={() => setMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-4 py-7 flex-1 overflow-y-auto">
          <p className="text-[11px] font-semibold tracking-[.15em] text-slate-400 px-4 mb-3 uppercase">
            Menu principal
          </p>
          <nav className="space-y-1">
            {nav
              .filter(
                (item) => admin || !["academic", "schedules"].includes(item[0]),
              )
              .map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => open(id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] text-left font-medium transition ${page === id ? "bg-skybrand-600 text-white shadow-lg shadow-sky-900/20" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                >
                  <Icon size={19} />
                  {label}
                </button>
              ))}
          </nav>
        </div>
        <div className="px-4 pb-5">
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
            <p className="text-sm font-semibold">{user.displayName}</p>
            <p className="text-xs text-slate-400 mt-1">
              {admin ? "Administrador" : "Professor"}
            </p>
            <button
              className="mt-3 flex items-center text-xs font-semibold gap-2 text-slate-300 hover:text-white"
              onClick={onLogout}
            >
              <LogOut size={14} />
              Sair da conta
            </button>
          </div>
        </div>
      </aside>
      <div className="flex-1 min-w-0 lg:pl-[255px]">
        <header className="h-[83px] bg-white border-b border-slate-200/80 px-5 md:px-9 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 text-slate-600"
              aria-label="Abrir menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={23} />
            </button>
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wide text-slate-400">
                Plataforma institucional
              </p>
              <p className="text-sm font-semibold text-slate-700 mt-1">
                {current?.[1] || "Painel"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              aria-label="Atualizar dados"
              title="Atualizar"
              className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100"
              onClick={() => {
                void reload();
                void reloadAgenda();
              }}
            >
              <RefreshCcw size={18} />
            </button>
            <button
              title="Notificações"
              aria-label={
                unread
                  ? `Ver notificações: ${unread} não lidas`
                  : "Ver notificações"
              }
              onClick={() => open("notifications")}
              className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 relative"
            >
              <Bell size={19} />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 text-white text-[10px] font-bold min-w-5 h-5 px-1 flex items-center justify-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
            <div className="h-9 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-skybrand-100 text-skybrand-700 font-bold flex items-center justify-center">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:block text-sm font-semibold text-slate-700 max-w-32 truncate">
                {user.displayName}
              </span>
              <ChevronDown
                size={15}
                className="hidden sm:block text-slate-400"
              />
            </div>
          </div>
        </header>
        <main className="max-w-[1500px] mx-auto p-5 md:p-8 lg:p-9">
          {error && (
            <div className="mb-5">
              <Notice type="error" message={error} />
            </div>
          )}
          {agendaError && (
            <div className="mb-5">
              <Notice type="error" message={agendaError} />
            </div>
          )}
          {loading ? (
            <Busy />
          ) : page === "dashboard" ? (
            <Dashboard user={user} navigate={open} occupations={occupations} />
          ) : page === "agenda" ? (
            <Agenda
              user={user}
              occupations={occupations}
              reloadAgenda={reloadAgenda}
            />
          ) : page === "rooms" ? (
            <Rooms user={user} />
          ) : page === "academic" && admin ? (
            <Academic user={user} />
          ) : page === "teachers" ? (
            <Teachers user={user} />
          ) : page === "schedules" && admin ? (
            <Schedules user={user} reloadAgenda={reloadAgenda} />
          ) : page === "bookings" ? (
            <Bookings user={user} reloadAgenda={reloadAgenda} />
          ) : page === "loans" ? (
            <Loans user={user} reloadAgenda={reloadAgenda} />
          ) : page === "notifications" ? (
            <Notifications />
          ) : null}
        </main>
        <footer className="py-5 px-8 text-center text-xs text-slate-400">
          SalaGest · MVP institucional · React + ASP.NET Core
        </footer>
      </div>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [starting, setStarting] = useState(true);
  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);
  useEffect(() => {
    const onInvalid = () => logout();
    window.addEventListener("salagest:unauthorized", onInvalid);
    if (!tokenStore.get()) {
      setStarting(false);
    } else {
      read<User>("/me")
        .then(setUser)
        .catch(() => logout())
        .finally(() => setStarting(false));
    }
    return () => window.removeEventListener("salagest:unauthorized", onInvalid);
  }, [logout]);
  if (starting)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Busy />
      </div>
    );
  return user ? (
    <DataProvider>
      <Workspace user={user} onLogout={logout} />
    </DataProvider>
  ) : (
    <Access onLogin={setUser} />
  );
}
