import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  X,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { statusText } from "../lib/utils";

export function Title({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-5 mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] md:text-[2rem] leading-tight font-extrabold tracking-[-.025em] text-ink text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-ink mt-2 max-w-3xl text-sm leading-6">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <h2 className="section-title">{title}</h2>
      {subtitle && <p className="muted mt-1 max-w-3xl leading-5">{subtitle}</p>}
    </div>
    {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
  </div>;
}

export function FilterBar({ children, actions, embedded = false }: { children: ReactNode; actions?: ReactNode; embedded?: boolean }) {
  return <section aria-label="Filtros" className={embedded ? "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" : "filter-bar"}>
    <div className="filter-group">{children}</div>
    {actions && <div className="flex flex-wrap gap-2 sm:ml-auto">{actions}</div>}
  </section>;
}

const metricTones = {
  blue: "border-l-sky-400 text-sky-300",
  violet: "border-l-violet-400 text-violet-300",
  amber: "border-l-amber-400 text-amber-300",
  emerald: "border-l-emerald-400 text-emerald-300",
  rose: "border-l-rose-400 text-rose-300",
  slate: "border-l-slate-400 text-slate-300",
};

export function MetricCard({ label, value, detail, icon: Icon, tone = "blue", onClick }: {
  label: string; value: ReactNode; detail?: string; icon?: LucideIcon;
  tone?: keyof typeof metricTones; onClick?: () => void;
}) {
  const content = <>
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-bold uppercase tracking-[.06em] text-muted-ink">{label}</p>
      {Icon && <span className={`rounded-lg p-2 ${metricTones[tone]}`}><Icon aria-hidden="true" size={19} /></span>}
    </div>
    <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink tabular-nums">{value}</p>
    {detail && <p className="mt-1 text-xs leading-5 text-muted-ink">{detail}</p>}
  </>;
  const className = `card min-h-[116px] border-l-[3px] p-4 text-left ${metricTones[tone]} ${onClick ? "card-interactive w-full cursor-pointer" : ""}`;
  return onClick ? <button type="button" className={className} onClick={onClick}>{content}</button> : <div className={className}>{content}</div>;
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}
export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
export function SearchableSelect({ label, options, value, onChange, searchThreshold = 12, required = false }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  searchThreshold?: number;
  required?: boolean;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const visible = options.filter((option) => option.value === value || option.label.toLocaleLowerCase("pt-BR").includes(query));
  return <div className="space-y-2">
    {options.length > searchThreshold && <Field label={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}>
      <input className="field" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
    </Field>}
    <Field label={label}>
      <select className="field" value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        {visible.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
    {query && visible.length === 1 && visible[0].value === value && !visible[0].label.toLocaleLowerCase("pt-BR").includes(query) &&
      <p className="muted" role="status">Nenhum outro resultado para a busca.</p>}
  </div>;
}
export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer text-sm text-ink">
      <input
        type="checkbox"
        className="w-4 h-4 rounded accent-sky-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
export function Badge({ status }: { status: string }) {
  const positive = ["Aprovada", "Aprovado", "Publicada", "Ativa"].includes(
    status,
  );
  const negative = ["Rejeitada", "Rejeitado", "Inativa"].includes(status);
  return (
    <span
      className={`pill ${positive ? "bg-emerald-950 text-emerald-200" : negative ? "bg-rose-950 text-rose-200" : "bg-amber-950 text-amber-200"}`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full ${positive ? "bg-emerald-500" : negative ? "bg-red-500" : "bg-amber-500"}`}
      />
      {statusText(status)}
    </span>
  );
}
export function Notice({
  message,
  type = "error",
  onClose,
}: {
  message: string;
  type?: "error" | "success" | "info";
  onClose?: () => void;
}) {
  const success = type === "success";
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      className={`flex items-start gap-3 p-3.5 rounded-xl border text-sm ${success ? "border-emerald-700 bg-emerald-950 text-emerald-100" : type === "info" ? "border-sky-700 bg-sky-950 text-sky-100" : "border-rose-700 bg-rose-950 text-rose-100"}`}
    >
      {success ? <CheckCircle2 aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />}
      <div className="flex-1">{message}</div>
      {onClose && (
        <button type="button" aria-label="Fechar aviso" className="-m-2 min-h-10 min-w-10 flex items-center justify-center rounded-lg hover:bg-black/5" onClick={onClose}>
          <X aria-hidden="true" size={17} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title = "Nenhum registro encontrado",
  text,
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="py-12 text-center flex flex-col items-center">
      <div className="w-12 h-12 bg-navy-800 rounded-xl flex items-center justify-center mb-3">
        <Inbox className="text-muted-ink" size={22} />
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {text && <p className="text-sm text-muted-ink mt-1 max-w-xs">{text}</p>}
    </div>
  );
}
export function Busy() {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="flex items-center justify-center py-16 text-muted-ink gap-2">
      <LoaderCircle aria-hidden="true" size={22} className="animate-spin" />
      Carregando dados...
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  width = "max-w-2xl",
  descriptionId,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: string;
  descriptionId?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    const firstField = dialog?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    (firstField ?? focusable()[0] ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
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
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 p-3 sm:p-4 flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`bg-surface text-ink rounded-panel shadow-xl w-full ${width} max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col min-h-0`}
      >
        <div className="flex shrink-0 justify-between items-center border-b border-line px-4 sm:px-6 py-3 sm:py-4 gap-3">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:bg-white/10"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </div>
        <div className="modal-scroll min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

type ConfirmationOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
};

const ConfirmationContext = createContext<((options: ConfirmationOptions) => Promise<boolean>) | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ options: ConfirmationOptions; resolve: (confirmed: boolean) => void } | null>(null);
  const confirm = (options: ConfirmationOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve }));
  const answer = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };
  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmationDialog options={pending.options} onAnswer={answer} />}
    </ConfirmationContext.Provider>
  );
}

export function ConfirmationDialog({ options, onAnswer }: { options: ConfirmationOptions; onAnswer: (confirmed: boolean) => void }) {
  const descriptionId = useId();
  return <Modal title={options.title} onClose={() => onAnswer(false)} width="max-w-md" descriptionId={descriptionId}>
    <p id={descriptionId} className="text-sm leading-relaxed text-muted-ink">{options.message}</p>
    <div className="mt-6 flex flex-wrap justify-end gap-2">
      <button type="button" className="btn-secondary" onClick={() => onAnswer(false)}>Cancelar</button>
      <button type="button" className={options.danger ? "btn-danger" : "btn-primary"} onClick={() => onAnswer(true)}>{options.confirmLabel}</button>
    </div>
  </Modal>;
}

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("useConfirmation requer ConfirmationProvider");
  return confirm;
}
export function SubmitButton({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
      {busy && <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
