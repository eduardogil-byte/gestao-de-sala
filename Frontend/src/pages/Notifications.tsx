import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { post, read } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { Busy, Card, Empty, Notice, Title } from "../components/UI";
import { AuditHistory } from "../components/AuditHistory";
import type { Notification } from "../types";

export function NotificationItem({ row, onMark, openRelated, showHistory, toggleHistory }: {
  row: Notification; onMark: (id: number) => void; openRelated: (type: string, id: number) => void;
  showHistory: boolean; toggleHistory: () => void;
}) {
  const canHistory = row.relatedId && (["Occupation", "Booking", "Loan"] as string[]).includes(row.relatedType ?? "");
  const canOpen = row.relatedId && (["Occupation", "Booking", "Loan", "Assignment", "Room"] as string[]).includes(row.relatedType ?? "");
  return <div className={"p-4 flex gap-3 items-start " + (row.readAtUtc ? "bg-white" : "bg-sky-50")}>
    <Bell size={18} className="text-sky-600 shrink-0" />
    <div className="flex-1">
      <p className="text-xs font-semibold text-slate-700 mb-1">{row.subject || "Aviso do SalaGest"} · {row.readAtUtc ? "Lida" : "Não lida"}</p>
      <p className="text-sm text-slate-800">{row.message}</p>
      <p className="text-xs text-slate-500 mt-1">Por {row.actorName} · {new Date(row.createdAtUtc).toLocaleString("pt-BR")}</p>
      {(canHistory || canOpen) && <div className="flex flex-wrap gap-3 mt-2">
        {canHistory && <button type="button" className="text-xs font-medium text-sky-700 underline" onClick={toggleHistory}>Ver histórico</button>}
        {canOpen && <button type="button" className="text-xs font-medium text-sky-700 underline" onClick={() => openRelated(row.relatedType!, row.relatedId!)}>Abrir registro relacionado</button>}
      </div>}
      {showHistory && canHistory && <div className="mt-3"><AuditHistory type={row.relatedType as "Occupation" | "Booking" | "Loan"} id={row.relatedId!} /></div>}
    </div>
    {!row.readAtUtc && <button type="button" className="btn-secondary !py-1.5" onClick={() => onMark(row.id)}><Check size={15} />Lida</button>}
  </div>;
}

export function Notifications({ openRelated }: { openRelated: (type: string, id: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [rows, setRows] = useState<Notification[]>([]),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    try {
      setRows(await read<Notification[]>("/notifications"));
      setError("");
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function mark(id: number) {
    try {
      await post(`/notifications/${id}/read`);
      await load();
      window.dispatchEvent(new Event("salagest:notifications-changed"));
    } catch (e) {
      setError(resultMessage(e));
    }
  }
  async function markAll() {
    setBusy(true);
    try {
      await post("/notifications/read-all");
      await load();
      window.dispatchEvent(new Event("salagest:notifications-changed"));
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title="Notificações"
        action={
          <button
            className="btn-secondary"
            disabled={busy || !rows.some((r) => !r.readAtUtc)}
            onClick={() => void markAll()}
          >
            <Check size={15} />
            {busy ? "Marcando..." : "Marcar todas como lidas"}
          </button>
        }
        subtitle="Avisos sobre empréstimos, transferências e alterações que envolvem sua conta."
      />
      {error && <Notice message={error} />}
      {loading && <Busy />}
      <Card className="overflow-hidden">
        {!loading && !error && rows.length === 0 ? (
          <Empty
            title="Sem notificações"
            text="Novos avisos aparecerão aqui."
          />
        ) : !loading && !error && rows.length > 0 ? (
          <div className="divide-y">
            {rows.map((row) => <NotificationItem key={row.id} row={row} onMark={(id) => void mark(id)}
              openRelated={openRelated} showHistory={historyId === row.id}
              toggleHistory={() => setHistoryId(historyId === row.id ? null : row.id)} />)}
          </div>
        ) : null}
      </Card>
    </>
  );
}
