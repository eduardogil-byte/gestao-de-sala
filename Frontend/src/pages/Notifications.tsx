import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { post, read } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { Card, Empty, Notice, Title } from "../components/UI";
import type { Notification } from "../types";
export function Notifications() {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Notification[]>([]),
    [error, setError] = useState("");
  async function load() {
    try {
      setRows(await read<Notification[]>("/notifications"));
      setError("");
    } catch (e) {
      setError(resultMessage(e));
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
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty
            title="Sem notificações"
            text="Novos avisos aparecerão aqui."
          />
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`p-4 flex gap-3 items-start ${r.readAtUtc ? "bg-white" : "bg-sky-50"}`}
              >
                <Bell size={18} className="text-sky-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-slate-800">{r.message}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Por {r.actorName} ·{" "}
                    {new Date(r.createdAtUtc).toLocaleString("pt-BR")}
                  </p>
                </div>
                {!r.readAtUtc && (
                  <button
                    className="btn-secondary !py-1.5"
                    onClick={() => void mark(r.id)}
                  >
                    <Check size={15} />
                    Lida
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
