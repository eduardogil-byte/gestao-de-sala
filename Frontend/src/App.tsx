import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  Download,
  GraduationCap,
  Handshake,
  Import,
  LayoutDashboard,
  Link2,
  Layers3,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  SearchCheck,
  Table2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Access } from "./pages/Access";
import { Dashboard } from "./pages/Dashboard";
import { RoomOpportunities } from "./pages/RoomOpportunities";
import { InstitutionalImport } from "./pages/InstitutionalImport";
import { ExportData } from "./pages/ExportData";
import { Agenda } from "./pages/Agenda";
import { RoomTimeline } from "./pages/RoomTimeline";
import { InstructorAgenda } from "./pages/InstructorAgenda";
import { Rooms } from "./pages/Rooms";
import { Academic } from "./pages/Academic";
import { PedagogicalCatalog } from "./pages/PedagogicalCatalog";
import { Teachers } from "./pages/Teachers";
import { Schedules } from "./pages/Schedules";
import { SemesterPlanning } from "./pages/SemesterPlanning";
import { Bookings } from "./pages/Bookings";
import { Loans } from "./pages/Loans";
import { Notifications } from "./pages/Notifications";
import { DataProvider, useData } from "./lib/data";
import { post, read, tokenStore } from "./lib/api";
import { localDate, nextDate, resultMessage } from "./lib/utils";
import { getNavigationSections, type NavigationItem, type Page } from "./lib/navigation";
import { Busy, Notice } from "./components/UI";
import type { User, Occupation } from "./types";

const navIcons = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  timeline: CalendarRange,
  instructor: UserRound,
  planning: Layers3,
  schedule: Table2,
  door: DoorOpen,
  opportunity: SearchCheck,
  spreadsheet: Table2,
  import: Import,
  export: Download,
  catalog: Layers3,
  people: Users,
  booking: ClipboardList,
  loan: Handshake,
  bell: Bell,
  course: GraduationCap,
} satisfies Record<NavigationItem["icon"], typeof LayoutDashboard>;

function Workspace({ user, onLogout, onPasswordChanged, institutionalNotice = "", institutionalError = "" }: { user: User; onLogout: () => void; onPasswordChanged: () => void; institutionalNotice?: string; institutionalError?: string }) {
  const { data, loading, error, reload } = useData();
  const [page, setPage] = useState<Page>("dashboard");
  const [related, setRelated] = useState<{ page: Page; id: number } | null>(null);
  const [agendaFocus, setAgendaFocus] = useState<{ date: string; roomId: number; occupationId: number } | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<{ semesterId: number; roomId: number; anchor: string; shiftId?: number } | null>(null);
  const [opportunityFilter, setOpportunityFilter] = useState<{ semesterId: number; roomId: number } | null>(null);
  const [exportFilter, setExportFilter] = useState<{ semesterId: number; secondSemesterId: number | null; roomId: number | null } | null>(null);
  const [importKind, setImportKind] = useState<"Ambientes" | "Recursos" | "Docentes">("Ambientes");
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const accountHeaderRef = useRef<HTMLButtonElement>(null);
  const menuReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [agendaError, setAgendaError] = useState("");
  const [unread, setUnread] = useState<number | null>(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkPassword, setLinkPassword] = useState("");
  const [linkError, setLinkError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  async function changePassword(event: React.FormEvent) {
    event.preventDefault(); setPasswordError(""); setPasswordBusy(true);
    try {
      await post("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword(""); setNewPassword(""); onPasswordChanged();
    } catch (reason) { setPasswordError(resultMessage(reason)); }
    finally { setPasswordBusy(false); }
  }
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await read<{ count: number }>(
          "/notifications/unread-count",
        );
        if (active) setUnread(result.count);
      } catch {
        if (active) setUnread(null);
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
  useEffect(() => {
    let active = true;
    void read<{ enabled: boolean }>("/auth/institutional/config")
      .then((config) => { if (active) setSsoEnabled(config.enabled === true); })
      .catch(() => { if (active) setSsoEnabled(false); });
    return () => { active = false; };
  }, []);
  async function beginInstitutionalLink() {
    if (linkBusy || !linkPassword) return;
    setLinkBusy(true); setLinkError("");
    try {
      const { ticket } = await post<{ ticket: string }>("/auth/institutional/link/start", { password: linkPassword });
      setLinkPassword("");
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/api/auth/institutional/link";
      const input = document.createElement("input");
      input.type = "hidden"; input.name = "ticket"; input.value = ticket;
      form.append(input); document.body.append(form); form.submit();
    } catch (reason) {
      setLinkError(resultMessage(reason));
      setLinkPassword("");
      setLinkBusy(false);
    }
  }
  const admin = user.roles.includes("Admin");
  useEffect(() => {
    if (!menu) return;
    const menuElement = menuRef.current;
    const focusable = () => Array.from(menuElement?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    menuElement?.querySelector<HTMLElement>("[aria-current='page']")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const returnFocus = menuReturnFocusRef.current ?? menuButtonRef.current;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [menu]);
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
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const open = (p: string) => {
    setRelated(null);
    setAgendaFocus(null);
    setTimelineFilter(null);
    setOpportunityFilter(null);
    setExportFilter(null);
    if (p === "imports") setImportKind("Ambientes");
    setPage(p as Page);
    setMenu(false);
    scrollToTop();
  };
  const openTimeline = (semesterId: number, roomId: number, anchor?: string, shiftId?: number) => {
    const semester = data.semesters.find((item) => item.id === semesterId);
    setTimelineFilter({ semesterId, roomId, anchor: anchor ?? semester?.startDate ?? localDate(new Date()), shiftId });
    setPage("room-timeline");
    scrollToTop();
  };
  const openOpportunity = (semesterId: number, roomId: number) => {
    setOpportunityFilter({ semesterId, roomId });
    setPage("opportunities");
    scrollToTop();
  };
  const openDashboardExport = (semesterId: number, secondSemesterId: number | null, roomId: number | null) => {
    setExportFilter({ semesterId, secondSemesterId, roomId });
    setPage("exports");
    scrollToTop();
  };
  const navigation = getNavigationSections(admin);
  const current = navigation.flatMap((section) => section.items).find((item) => item.page === page);
  const openAccount = () => {
    setCollapsed(false);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      menuReturnFocusRef.current = accountHeaderRef.current;
      setMenu(true);
    }
    window.requestAnimationFrame(() => accountButtonRef.current?.focus());
  };
  return (
    <div className="app-workspace min-h-screen bg-canvas flex">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-lg focus:bg-skybrand-600 focus:px-4 focus:py-2 focus:text-white">Ir para o conteúdo</a>
      {menu && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-slate-900/60 z-30 lg:hidden"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        id="primary-navigation"
        ref={menuRef}
        aria-label="Menu principal"
        className={`fixed top-0 bottom-0 left-0 z-40 w-[264px] ${collapsed ? "lg:w-[76px]" : "lg:w-[264px]"} bg-navy-950 text-white flex flex-col border-r border-white/10 shadow-2xl shadow-slate-950/10 transition-[width,transform] lg:translate-x-0 ${menu ? "visible translate-x-0" : "invisible -translate-x-full lg:visible"}`}
      >
        <div className={`h-[83px] flex items-center justify-between border-b border-white/10 ${collapsed ? "px-4 lg:px-3 lg:justify-center" : "px-6"}`}>
          <div className={`flex items-center gap-2.5 ${collapsed ? "lg:hidden" : ""}`}>
            <div className="h-10 w-10 rounded-xl bg-skybrand-600 ring-1 ring-white/15 flex items-center justify-center shadow-lg shadow-sky-950/20">
              <Layers3 aria-hidden="true" size={23} />
            </div>
            <div className={collapsed ? "lg:hidden" : ""}>
              <span className="block text-[21px] font-extrabold tracking-tight">SalaGest</span>
              <span className="block text-[10px] font-medium tracking-wide text-slate-400">Gestão de ambientes</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar menu"
            className="lg:hidden min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:bg-white/10"
            onClick={() => setMenu(false)}
          >
            <X size={20} />
          </button>
          <button type="button" aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            aria-expanded={!collapsed} aria-controls="primary-navigation"
            className="hidden lg:flex min-w-10 min-h-10 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
        </div>
        <div className={`${collapsed ? "lg:px-2" : ""} px-3 py-5 flex-1 overflow-y-auto overflow-x-hidden`}>
          <nav aria-label="Navegação principal" className="space-y-4">
            {navigation.map((section) => (
              <section key={section.title} aria-label={section.title}>
                <p className={`text-[10px] font-bold tracking-[.14em] text-slate-400 px-3 mb-1.5 uppercase ${collapsed ? "lg:sr-only" : ""}`}>
                  {section.title}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = navIcons[item.icon];
                    const active = page === item.page;
                    return (
                      <button
                        type="button"
                        key={item.page}
                        aria-label={item.teacherLabel && !admin ? item.teacherLabel : item.label}
                        title={collapsed ? (item.teacherLabel && !admin ? item.teacherLabel : item.label) : undefined}
                        aria-current={active ? "page" : undefined}
                        onClick={() => open(item.page)}
                        className={`w-full min-h-11 flex items-center gap-3 rounded-control px-3 py-2.5 text-[13px] text-left font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-300 ${collapsed ? "lg:justify-center lg:px-2" : ""} ${active ? "bg-skybrand-600 text-white shadow-md shadow-sky-950/25" : "text-slate-300 hover:bg-white/[.1] hover:text-white"}`}
                      >
                        <Icon aria-hidden="true" size={19} />
                        <span className={collapsed ? "lg:sr-only" : ""}>{item.teacherLabel && !admin ? item.teacherLabel : item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        </div>
        <div className={`${collapsed ? "lg:px-2" : ""} px-4 pb-5`}>
          {collapsed && <button type="button" className="hidden lg:flex w-full min-h-11 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20" aria-label="Expandir menu e acessar conta" title="Conta" onClick={() => { setCollapsed(false); window.requestAnimationFrame(() => accountButtonRef.current?.focus()); }}>{user.displayName.charAt(0).toUpperCase()}</button>}
          <div className={`p-3 bg-white/5 border border-white/10 rounded-xl ${collapsed ? "lg:hidden" : ""}`}>
            <p className="text-sm font-semibold">{user.displayName}</p>
            <p className="text-xs text-slate-400 mt-1">
              {admin ? "Administrador" : "Professor"}
            </p>
            <button
              className="mt-3 flex min-h-10 items-center text-xs font-semibold gap-2 text-slate-300 hover:text-white"
              onClick={onLogout}
            >
              <LogOut size={14} />
              Sair da conta
            </button>
            <button ref={accountButtonRef} type="button" className="mt-3 block min-h-10 text-xs font-semibold text-slate-300 underline"
              onClick={() => { setChangingPassword(!changingPassword); setPasswordError(""); }}>Alterar senha</button>
            {changingPassword && <form className="mt-3 space-y-2" onSubmit={(event) => void changePassword(event)}>
              <label className="block text-xs text-slate-300">Senha atual
                <input className="field mt-1" type="password" autoComplete="current-password" required
                  value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
              <label className="block text-xs text-slate-300">Nova senha
                <input className="field mt-1" type="password" autoComplete="new-password" required minLength={8}
                  value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
              <button type="submit" className="text-xs font-semibold text-white underline" disabled={passwordBusy}>Salvar senha</button>
              {passwordError && <p role="alert" className="text-xs text-rose-200">{passwordError}</p>}
            </form>}
            {ssoEnabled && !linking && <button type="button"
              className="mt-3 flex min-h-10 items-center text-xs font-semibold gap-2 text-slate-300 hover:text-white"
              onClick={() => { setLinkError(""); setLinking(true); }}>
              <Link2 size={14} />Vincular conta institucional
            </button>}
            {ssoEnabled && linking && <div className="mt-3 space-y-2">
              <label className="block text-xs text-slate-300" htmlFor="institutional-link-password">Confirme sua senha local</label>
              <input id="institutional-link-password" type="password" autoComplete="current-password"
                className="w-full rounded-lg px-2 py-2 text-sm text-slate-900" value={linkPassword}
                onChange={(event) => setLinkPassword(event.target.value)} disabled={linkBusy} />
              <div className="flex gap-2">
                <button type="button" className="text-xs underline text-slate-300" disabled={linkBusy}
                  onClick={() => { setLinking(false); setLinkPassword(""); setLinkError(""); }}>Cancelar</button>
                <button type="button" className="text-xs font-semibold text-white underline disabled:opacity-60"
                  disabled={linkBusy || !linkPassword} onClick={() => void beginInstitutionalLink()}>
                  {linkBusy ? "Abrindo provedor..." : "Continuar"}
                </button>
              </div>
            </div>}
            {linkError && <p role="alert" className="mt-2 text-xs text-rose-200">{linkError}</p>}
          </div>
        </div>
      </aside>
      <div className={`flex-1 min-w-0 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]"}`}>
        <header className="h-[76px] bg-surface border-b border-line px-3 sm:px-5 md:px-8 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              ref={menuButtonRef}
              className="lg:hidden min-w-11 min-h-11 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Abrir menu"
              aria-expanded={menu}
              aria-controls="primary-navigation"
              onClick={() => { menuReturnFocusRef.current = menuButtonRef.current; setMenu(true); }}
            >
              <Menu size={23} />
            </button>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-[.12em] text-slate-500">
                SalaGest · Plataforma institucional
              </p>
              <p className="text-sm font-semibold text-ink mt-1 truncate max-w-[28vw] sm:max-w-none">
                {(current?.teacherLabel && !admin ? current.teacherLabel : current?.label) || "Painel"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              aria-label="Atualizar dados"
              title="Atualizar"
              className="hidden sm:flex rounded-xl min-w-11 min-h-11 items-center justify-center text-slate-600 hover:bg-slate-100"
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
              className="rounded-xl min-w-11 min-h-11 flex items-center justify-center text-slate-600 hover:bg-slate-100 relative"
            >
              <Bell size={19} />
              {unread !== null && unread > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 text-white text-[10px] font-bold min-w-5 h-5 px-1 flex items-center justify-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
            <div className="hidden sm:block h-9 w-px bg-line" />
            <button ref={accountHeaderRef} type="button" onClick={openAccount} aria-label="Abrir opções da conta" className="flex min-h-11 items-center gap-2 rounded-xl px-1 hover:bg-slate-100">
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
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="max-w-[1540px] mx-auto p-4 sm:p-6 lg:p-8 xl:p-10">
          {institutionalNotice && <div className="mb-5"><Notice type="success" message={institutionalNotice} /></div>}
          {institutionalError && <div className="mb-5"><Notice type="error" message={institutionalError} /></div>}
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
            <Dashboard user={user} navigate={open} occupations={occupations} openTimeline={openTimeline} openOpportunity={openOpportunity} onExport={openDashboardExport} unread={unread} />
          ) : page === "agenda" ? (
            <Agenda
              user={user}
              occupations={occupations}
              reloadAgenda={reloadAgenda}
              focus={agendaFocus}
            />
          ) : page === "room-timeline" ? (
            <RoomTimeline user={user} openBookings={() => open("bookings")} initialFilter={timelineFilter} />
          ) : page === "opportunities" && admin ? (
            <RoomOpportunities initial={opportunityFilter} onTimeline={openTimeline} />
          ) : page === "imports" && admin ? (
            <InstitutionalImport key={importKind} initialKind={importKind} />
          ) : page === "exports" && admin ? (
            <ExportData initial={exportFilter} />
          ) : page === "instructor-agenda" ? (
            <InstructorAgenda user={user} onOpenRelated={(type, id) => { const target = type === "Booking" ? "bookings" : "loans"; setRelated({ page: target, id }); setPage(target); }} onManage={(date, roomId, occupationId) => { setAgendaFocus({ date, roomId, occupationId }); setPage("agenda"); }} />
          ) : page === "rooms" ? (
            <Rooms user={user} onImport={admin ? (kind) => { setImportKind(kind); setPage("imports"); scrollToTop(); } : undefined} />
          ) : page === "academic" && admin ? (
            <Academic user={user} />
          ) : page === "pedagogical-catalog" ? (
            <PedagogicalCatalog user={user} />
          ) : page === "teachers" ? (
            <Teachers user={user} onImport={admin ? () => { setImportKind("Docentes"); setPage("imports"); scrollToTop(); } : undefined} />
          ) : page === "schedules" && admin ? (
            <Schedules user={user} reloadAgenda={reloadAgenda} />
          ) : page === "semester-planning" ? (
            <SemesterPlanning user={user} reloadAgenda={reloadAgenda} />
          ) : page === "bookings" ? (
            <Bookings user={user} reloadAgenda={reloadAgenda}
              focusId={related?.page === "bookings" ? related.id : null} />
          ) : page === "loans" ? (
            <Loans user={user} reloadAgenda={reloadAgenda}
              focusId={related?.page === "loans" ? related.id : null} />
          ) : page === "notifications" ? (
            <Notifications openRelated={(type, id) => {
              const target = ({ Occupation: "room-timeline", Booking: "bookings", Loan: "loans",
                SemesterPlan: "semester-planning", PlanProposal: "semester-planning",
                Assignment: "instructor-agenda", Room: "rooms" } as Record<string, Page>)[type];
              if (target) { setRelated({ page: target, id }); setPage(target); }
            }} />
          ) : null}
        </main>
        <footer className="py-5 px-8 text-center text-xs text-slate-600">
          SalaGest · Gestão institucional de ambientes
        </footer>
      </div>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [starting, setStarting] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const [institutionalNotice, setInstitutionalNotice] = useState("");
  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);
  const acceptLogin = useCallback((profile: User) => {
    setAuthMessage("");
    setUser(profile);
  }, []);
  useEffect(() => {
    let active = true;
    const onInvalid = () => {
      logout();
      setAuthMessage("Sua sessão expirou ou foi invalidada. Entre novamente. Formulários ainda não enviados podem precisar ser preenchidos de novo.");
    };
    window.addEventListener("salagest:unauthorized", onInvalid);
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = fragment.get("ssoCode") ?? params.get("ssoCode");
    const ssoError = params.get("ssoError");
    const linked = params.get("ssoLinked") === "1";
    if (code || ssoError || linked) {
      params.delete("ssoCode"); params.delete("ssoError"); params.delete("ssoLinked");
      fragment.delete("ssoCode");
      const query = params.toString();
      window.history.replaceState({}, document.title,
        `${window.location.pathname}${query ? `?${query}` : ""}${fragment.size ? `#${fragment}` : ""}`);
    }
    if (ssoError) {
      setAuthMessage(({ provider: "O provedor institucional não concluiu a autenticação.",
        identity: "O provedor não retornou uma identidade válida.",
        unlinked: "A identidade foi autenticada, mas não está vinculada a uma conta autorizada do SalaGest. Procure a administração.",
        link: "Não foi possível vincular a identidade. Ela pode já estar associada a outra conta; procure a administração." } as Record<string, string>)[ssoError] ?? "Não foi possível concluir a autenticação institucional.");
    }
    if (linked) setInstitutionalNotice("Conta institucional vinculada a este usuário do SalaGest.");
    const establishUser = async () => {
      try {
        if (code) {
          const result = await post<{ accessToken: string }>("/auth/institutional/exchange", { code });
          if (!result?.accessToken) throw new Error("O SalaGest não retornou uma sessão válida.");
          tokenStore.set(result.accessToken);
        }
        const current = tokenStore.get();
        if (current) {
          const profile = await read<User>("/me");
          if (active) acceptLogin(profile);
        }
      } catch (reason) {
        tokenStore.clear();
        if (active && code) setAuthMessage(resultMessage(reason));
        else if (active) logout();
      } finally { if (active) setStarting(false); }
    };
    if (code || tokenStore.get()) void establishUser();
    else setStarting(false);
    return () => { active = false; window.removeEventListener("salagest:unauthorized", onInvalid); };
  }, [acceptLogin, logout]);
  if (starting)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Busy />
      </div>
    );
  return user ? (
    <DataProvider>
      <Workspace user={user} onLogout={logout} onPasswordChanged={() => {
        logout(); setAuthMessage("Senha alterada. Entre novamente para continuar.");
      }} institutionalNotice={institutionalNotice} institutionalError={authMessage} />
    </DataProvider>
  ) : (
    <Access onLogin={acceptLogin} initialMessage={authMessage} />
  );
}
