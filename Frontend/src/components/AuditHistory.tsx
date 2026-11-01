import { useEffect, useState } from "react";
import { read } from "../lib/api";
import { useData } from "../lib/data";
import { dateTimeBR, resultMessage } from "../lib/utils";
import { Busy, Notice } from "./UI";

type AuditRow = {
  id: number; action: string; actorName: string; createdAtUtc: string;
  beforeJson: string | null; afterJson: string | null; reason: string | null; details?: string | null;
};
type OccupationRow = {
  id: number; action: string; actorName: string; changedAtUtc: string; details: string;
  canUndo?: boolean; canRedo?: boolean;
};

const labels: Record<string, string> = {
  TeacherId: "Professor", OwnerId: "Titular", BorrowerId: "Destinatário",
  ClassGroupId: "Turma", CurricularUnitId: "UC", CurricularCapabilityId: "Capacidade",
  ApprovedRoomId: "Ambiente aprovado", RoomId: "Ambiente", RoomOccupationId: "Ocupação",
  StartsAt: "Início", EndsAt: "Fim", Status: "Estado", Recurrence: "Recorrência",
  RepeatUntil: "Até", Weekday: "Dia da semana", PreferredShiftId: "Turno",
  MeetingsPerWeek: "Encontros por semana", ReservedCount: "Datas confirmadas",
  Name: "Nome", Location: "Local", Purpose: "Finalidade", Kind: "Tipo",
  Seats: "Lugares", Desks: "Mesas", Quantity: "Quantidade", OperationalQuantity: "Em operação",
  RamGb: "RAM (GB)", Tier: "Categoria", Active: "Ativo", HasProjector: "Projetor",
  ComputerGroups: "Grupos de computadores", Software: "Softwares", SoftwareId: "Software",
  InstalledQuantity: "Instalações", ReplacedOccupationIds: "Ocupações substituídas",
  HasTeacherComputer: "Computador docente", HasInternet: "Internet",
  OwnerDisposition: "Situação da turma titular", ReplacementOccupationId: "Ocupação substituta",
  ApprovedAtUtc: "Aprovado em", EndedAtUtc: "Encerrado em", Reason: "Motivo",
};

export function AuditHistory({ type, id, onReverse }: { type: "Occupation" | "Booking" | "Loan" | "Assignment" | "Room"; id: number; onReverse?: (changeId: number, action: "undo" | "redo") => void }) {
  const { data } = useData();
  const [rows, setRows] = useState<(AuditRow | OccupationRow)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    const path = type === "Occupation" ? "/occupations/" + id + "/history" : "/audit/" + type + "/" + id;
    read<(AuditRow | OccupationRow)[]>(path).then((result) => { if (current) setRows(result); })
      .catch((reason: unknown) => { if (current) { setRows([]); setError(resultMessage(reason)); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [type, id]);

  function value(key: string, item: unknown): string {
    if (item === null || item === undefined) return "Não informado";
    if (typeof item === "boolean") return item ? "Sim" : "Não";
    if (Array.isArray(item)) return item.length ? item.map((part) => value(key, part)).join("; ") : "Nenhum";
    if (key === "TeacherId" || key === "OwnerId" || key === "BorrowerId")
      return data.teachers.find((teacher) => teacher.id === item)?.displayName ?? "Professor identificado no registro";
    if (key === "ClassGroupId") return data.classes.find((group) => group.id === item)?.name ?? "Turma nº " + item;
    if (key === "RoomId" || key === "ApprovedRoomId") return data.rooms.find((room) => room.id === item)?.name ?? "Ambiente nº " + item;
    if (key === "PreferredShiftId") return data.shifts.find((shift) => shift.id === item)?.name ?? "Turno nº " + item;
    if (typeof item === "object") return Object.entries(item).map(([field, part]) =>
      (labels[field] ?? field) + ": " + value(field, part)).join(", ");
    if ((key === "StartsAt" || key === "EndsAt") && typeof item === "string") return dateTimeBR(item);
    return String(item);
  }
  function snapshot(text: string | null, empty: string) {
    if (!text) return <span className="text-slate-500">{empty}</span>;
    try {
      const fields = JSON.parse(text) as Record<string, unknown>;
      return <dl className="space-y-1">{Object.entries(fields).map(([key, item]) =>
        <div key={key}><dt className="inline font-medium">{labels[key] ?? key}: </dt><dd className="inline">{value(key, item)}</dd></div>)}</dl>;
    } catch { return <span className="text-slate-500">Detalhes indisponíveis</span>; }
  }

  if (loading) return <Busy />;
  if (error) return <Notice message={error} />;
  if (!rows.length) return <p className="text-sm text-slate-600">Nenhuma alteração registrada para este item.</p>;
  return <ol className="space-y-3 max-h-80 overflow-y-auto">{rows.map((row) => <li key={row.id} className="rounded-lg border border-slate-200 p-3 text-sm">
    <strong>{row.action}</strong><span className="block text-xs text-slate-600">{row.actorName} · {new Date("changedAtUtc" in row ? row.changedAtUtc : row.createdAtUtc).toLocaleString("pt-BR")}</span>
    {"beforeJson" in row ? <>
      <div className="grid sm:grid-cols-2 gap-3 mt-2"><div><h4 className="font-semibold mb-1">Antes</h4>{snapshot(row.beforeJson, "Sem valores anteriores")}</div><div><h4 className="font-semibold mb-1">Depois</h4>{snapshot(row.afterJson, "Sem valores posteriores")}</div></div>
      {row.reason && <p className="mt-2">Motivo: {row.reason}</p>}
    </> : <><p className="mt-2">{row.details}</p>
      {onReverse && row.canUndo && <button type="button" className="btn-secondary mt-2" onClick={() => onReverse(row.id, "undo")}>Desfazer movimentação</button>}
      {onReverse && row.canRedo && <button type="button" className="btn-secondary mt-2" onClick={() => onReverse(row.id, "redo")}>Refazer movimentação</button>}
    </>}
  </li>)}</ol>;
}
