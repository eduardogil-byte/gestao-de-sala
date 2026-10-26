import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  X,
  Inbox,
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
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl md:text-[28px] leading-tight font-bold tracking-tight text-slate-800">
          {title}
        </h1>
        {subtitle && (
          <p className="text-slate-500 mt-1.5 text-sm">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
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
    <label className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-700">
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
      className={`pill ${positive ? "bg-emerald-50 text-emerald-700" : negative ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
    >
      <span
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
      role="alert"
      className={`flex items-start gap-3 p-3.5 rounded-xl border text-sm ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : type === "info" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
    >
      {success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <div className="flex-1">{message}</div>
      {onClose && (
        <button aria-label="Fechar aviso" onClick={onClose}>
          <X size={17} />
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
      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
        <Inbox className="text-slate-400" size={22} />
      </div>
      <p className="font-semibold text-slate-700">{title}</p>
      {text && <p className="text-sm text-slate-500 mt-1 max-w-xs">{text}</p>}
    </div>
  );
}
export function Busy() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
      <LoaderCircle size={22} className="animate-spin" />
      Carregando dados...
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  width = "max-w-2xl",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] p-4 overflow-y-auto flex items-start md:items-center justify-center"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white rounded-2xl shadow-2xl w-full ${width} my-8`}
      >
        <div className="flex justify-between items-center border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            aria-label="Fechar"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
export function SubmitButton({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <button type="submit" className="btn-primary" disabled={busy}>
      {busy && <LoaderCircle size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
