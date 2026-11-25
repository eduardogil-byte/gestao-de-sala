export const dayNames = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
export const dateBR = (v?: string | null) =>
  v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
export const dateTimeBR = (v?: string | null) =>
  v ? `${dateBR(v)} • ${v.slice(11, 16)}` : "—";
export const hour = (v: string) => v.slice(0, 5);
export function localDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function nextDate(date: string, n: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
}
export function formatMonthWeek(date: string) {
  const anchor = new Date(`${date}T12:00:00`);
  if (Number.isNaN(anchor.getTime())) return "—";
  const start = nextDate(date, -anchor.getDay());
  const end = nextDate(start, 6);
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
  // Cada mês conta todas as semanas de domingo a sábado que o intersectam.
  const label = (value: string) => {
    const current = new Date(`${value}T12:00:00`);
    const first = new Date(current.getFullYear(), current.getMonth(), 1, 12);
    const last = new Date(current.getFullYear(), current.getMonth() + 1, 0, 12);
    const week = Math.ceil((current.getDate() + first.getDay()) / 7);
    const total = Math.ceil((last.getDate() + first.getDay()) / 7);
    const month = current.toLocaleDateString("pt-BR", { month: "long", ...(crossesYear ? { year: "numeric" } : {}) });
    return `${month[0].toLocaleUpperCase("pt-BR")}${month.slice(1)} · Semana ${week}/${total}`;
  };
  return start.slice(0, 7) === end.slice(0, 7) ? label(start) : `${label(start)} / ${label(end)}`;
}
export function resultMessage(err: unknown) {
  return err instanceof Error ? err.message : "Ocorreu um erro inesperado.";
}
export const roomKind = (k: string) =>
  ({
    Comum: "Sala comum",
    Laboratorio: "Laboratório",
    Hibrida: "Sala híbrida",
    Oficina: "Oficina",
  })[k] || k;
export const statusText = (s: string) =>
  ({
    Pendente: "Pendente",
    Aprovada: "Aprovada",
    Rejeitada: "Rejeitada",
    Rascunho: "Rascunho",
    Publicada: "Publicada",
    PendenteDono: "Aguardando titular",
    PendenteAdmin: "Aguardando admin",
    AguardandoDestinatario: "Aguardando destinatário",
    AguardandoSituacaoTitular: "Aguardando definição da turma titular",
    Aprovado: "Aprovado",
    Rejeitado: "Rejeitado",
  })[s] || s;
export function normalizeTime(v: string) {
  return v.length === 5 ? `${v}:00` : v;
}
