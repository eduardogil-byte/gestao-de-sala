import { useRef, useState } from "react";
import { Card, Checkbox, Field, Notice, Title } from "../components/UI";
import { downloadFile, upload } from "../lib/api";
import { useData } from "../lib/data";
import { resultMessage } from "../lib/utils";

type Kind = "Docentes" | "Ambientes" | "Recursos" | "Capacidades";
type Status = "Novo" | "Atualizacao" | "SemAlteracao" | "Invalido" | "Duplicado";
type Row = {
  line: number;
  identifier: string;
  status: Status;
  changes: string[];
  errors: string[];
};
type Preview = {
  kind: Kind;
  fileName: string;
  total: number;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  invalidCount: number;
  duplicateCount: number;
  token: string;
  rows: Row[];
};
type Report = {
  kind: Kind;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: Row[];
};

const labels: Record<Status, string> = {
  Novo: "Novo",
  Atualizacao: "Atualização",
  SemAlteracao: "Sem alterações",
  Invalido: "Inválido",
  Duplicado: "Duplicado",
};

function formData(kind: Kind, file: File) {
  const data = new FormData();
  data.set("kind", kind);
  data.set("file", file);
  return data;
}

function errorsCsv(rows: Row[]) {
  const safe = (value: string) => {
    const protectedValue = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
    return `"${protectedValue.replace(/"/g, '""')}"`;
  };
  return ["Linha;Registro;Erros", ...rows.map((row) =>
    [row.line.toString(), row.identifier, row.errors.join(" | ")].map(safe).join(";"),
  )].join("\r\n");
}

export function InstitutionalImport() {
  const { reload } = useData();
  const [kind, setKind] = useState<Kind>("Ambientes");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [allowInvalid, setAllowInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const reset = () => {
    requestId.current++;
    setPreview(null);
    setReport(null);
    setAllowInvalid(false);
    setError("");
  };
  const analyze = async () => {
    if (!file) { setError("Selecione um arquivo CSV ou Excel."); return; }
    const id = ++requestId.current;
    setPreview(null);
    setReport(null);
    setBusy(true);
    setError("");
    try {
      const result = await upload<Preview>("/imports/preview", formData(kind, file));
      if (id === requestId.current) setPreview(result);
    } catch (cause) {
      if (id === requestId.current) setError(resultMessage(cause));
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };
  const confirm = async () => {
    if (!file || !preview) return;
    const id = ++requestId.current;
    const data = formData(kind, file);
    data.set("token", preview.token);
    data.set("allowInvalid", String(allowInvalid));
    setBusy(true);
    setError("");
    try {
      const result = await upload<Report>("/imports/confirm", data);
      if (id !== requestId.current) return;
      setReport(result);
      setPreview(null);
      void reload();
    } catch (cause) {
      if (id === requestId.current) setError(resultMessage(cause));
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };
  const downloadErrors = (rows: Row[]) => {
    const blob = new Blob(["\uFEFF", errorsCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "erros-importacao.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Title title="Importar Dados" subtitle="Analise o arquivo antes de confirmar. A prévia não altera os cadastros." />
      <Card className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tipo de cadastro">
            <select className="input" value={kind} disabled={busy} onChange={(event) => {
              setKind(event.target.value as Kind); setFile(null);
              if (fileInput.current) fileInput.current.value = "";
              reset();
            }}>
              {(["Ambientes", "Recursos", "Capacidades", "Docentes"] as Kind[]).map((value) =>
                <option key={value}>{value}</option>)}
            </select>
          </Field>
          <Field label="Arquivo CSV ou Excel (.xlsx). Limites padrão: 2 MB e 1.000 registros">
            <input ref={fileInput} className="input" type="file" accept=".csv,.xlsx" disabled={busy}
              onChange={(event) => { setFile(event.target.files?.[0] ?? null); reset(); }} />
          </Field>
        </div>
        <p className="text-sm text-slate-600">Use o modelo do cadastro selecionado. Campos vazios opcionais não apagam valores já cadastrados.</p>
        {kind === "Docentes" && <p className="text-sm text-slate-600">Docentes novos precisam primeiro de uma conta pelo fluxo institucional. Para vincular um CPF pela primeira vez, informe IdDocente e formate o CPF como texto no Excel. Cursos e capacidades usam códigos ou IDs separados por |; UCs usam CodigoCurso:OrdemModulo:CodigoUC.</p>}
        {kind === "Ambientes" && <p className="text-sm text-slate-600">Para atribuir código a um ambiente já cadastrado, informe seu IdAmbiente. Ambientes novos exigem todos os campos de capacidade e infraestrutura do modelo.</p>}
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" type="button" onClick={() => {
            void downloadFile(`/imports/template/${kind}`, `modelo-${kind.toLowerCase()}.csv`)
              .catch((cause) => setError(resultMessage(cause)));
          }}>Baixar modelo CSV</button>
          <button className="btn-primary" type="button" disabled={busy || !file} onClick={() => void analyze()}>
            {busy ? "Aguarde..." : "Analisar arquivo"}
          </button>
          {(preview || report) && <button className="btn-secondary" type="button" disabled={busy} onClick={() => {
            reset(); setFile(null);
            if (fileInput.current) fileInput.current.value = "";
          }}>Cancelar</button>}
        </div>
        {error && <Notice type="error" message={error} />}
      </Card>

      {preview && <Card className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Prévia da importação</h2>
          <p className="text-sm text-slate-500">{preview.fileName} · {preview.total} linhas analisadas</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5 text-sm">
          {[["Novos", preview.newCount], ["Atualizações", preview.updateCount],
            ["Sem alterações", preview.unchangedCount], ["Inválidos", preview.invalidCount],
            ["Duplicados", preview.duplicateCount]].map(([label, count]) =>
            <div key={label} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <p className="text-slate-500">{label}</p><p className="text-xl font-semibold">{count}</p>
            </div>)}
        </div>
        {preview.total === 0 && <p className="text-sm text-slate-600">O arquivo não possui registros para analisar.</p>}
        <div className="max-h-[460px] overflow-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 sticky top-0"><tr>
              <th className="p-3">Linha</th><th className="p-3">Registro</th><th className="p-3">Situação</th><th className="p-3">Alterações ou problemas</th>
            </tr></thead>
            <tbody>{preview.rows.map((row) => <tr key={row.line} className="border-t border-slate-100 align-top">
              <td className="p-3">{row.line}</td><td className="p-3">{row.identifier}</td>
              <td className="p-3">{labels[row.status]}</td>
              <td className="p-3">{[...row.changes, ...row.errors].join("; ") || "Nenhuma alteração"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {preview.invalidCount + preview.duplicateCount > 0 && <>
          <Notice type="error" message="Há linhas inválidas. Corrija o arquivo ou confirme explicitamente a importação apenas das linhas válidas." />
          <Checkbox label={`Ignorar ${preview.invalidCount + preview.duplicateCount} linha(s) inválida(s) e confirmar as válidas`}
            checked={allowInvalid} onChange={setAllowInvalid} disabled={busy} />
          <button className="btn-secondary" type="button" onClick={() =>
            downloadErrors(preview.rows.filter((row) => row.errors.length > 0))}>Baixar erros CSV</button>
        </>}
        <button className="btn-primary" type="button" disabled={busy ||
          preview.newCount + preview.updateCount === 0 ||
          (preview.invalidCount + preview.duplicateCount > 0 && !allowInvalid)}
          onClick={() => void confirm()}>Confirmar importação</button>
      </Card>}

      {report && <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Importação concluída</h2>
        <p className="text-sm text-slate-600">{report.kind}: {report.total} analisados · {report.created} criados · {report.updated} atualizados · {report.unchanged} sem alterações · {report.skipped} ignorados.</p>
        {report.skipped > 0 && <>
          <Notice type="error" message="A importação foi parcial. Consulte as linhas ignoradas no relatório de erros." />
          <button className="btn-secondary" type="button" onClick={() => downloadErrors(report.errors)}>Baixar erros CSV</button>
        </>}
      </Card>}
    </div>
  );
}
