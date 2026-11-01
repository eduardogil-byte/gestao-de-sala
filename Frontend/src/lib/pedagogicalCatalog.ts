import type { Shift, WorkloadSummary } from "../types";

export const canEditCatalog = (roles: string[]) => roles.includes("Admin");

export function catalogPath(courseId?: number, moduleId?: number, unitId?: number) {
  let path = "/courses";
  if (courseId !== undefined) path += `/${courseId}/modules`;
  if (moduleId !== undefined) path += `/${moduleId}/curricular-units`;
  if (unitId !== undefined) path += `/${unitId}`;
  return path;
}

export function parseHours(raw: string, allowUndefined = false, maximum = 9999999.99): number | null {
  const value = raw.trim();
  if (!value && allowUndefined) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value))
    throw new Error("Informe horas positivas com até duas casas decimais.");
  const hours = Number(value.replace(",", "."));
  if (hours <= 0 || hours > maximum)
    throw new Error(`Informe horas maiores que zero e de até ${maximum.toLocaleString("pt-BR")}.`);
  return hours;
}

export function parseOrder(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw.trim())) throw new Error("Informe uma ordem inteira positiva.");
  const order = Number(raw.trim());
  if (!Number.isSafeInteger(order)) throw new Error("A ordem informada é muito grande.");
  return order;
}

export function shiftHours(shift: Shift): string | null {
  const seconds = (value: string) => {
    const [hours, minutes, secs = "0"] = value.split(":");
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(secs);
  };
  const duration = seconds(shift.endsAt) - seconds(shift.startsAt);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400 || duration * 100 % 3600 !== 0)
    return null;
  return String((duration * 100 / 3600) / 100);
}

export const formatHours = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);

export function workloadText(summary: WorkloadSummary): string {
  switch (summary.status) {
    case "Undefined": return "CH não definida";
    case "Balanced": return "Carga horária completa";
    case "MissingHours": return `Faltam ${formatHours(summary.missingHours)} horas`;
    case "ExcessHours": return `Excedem ${formatHours(summary.excessHours)} horas`;
  }
}

export function catalogErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) return "Sessão expirada. Entre novamente.";
    if (status === 403) return "Você não tem permissão para alterar o catálogo.";
    if (status === 404) return "Registro não encontrado. Atualize a lista e tente novamente.";
    if ((status === 400 || status === 409) && error instanceof Error) return error.message;
  }
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
