import { useEffect, useState, type FormEvent } from "react";
import { put, read } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { Busy, Field, Notice, SubmitButton } from "./UI";
import type { ResourceCatalogItem } from "../types";

type Requirement = { resourceCatalogItemId: number; name: string; category: string; quantity: number };

export function UnitResourceRequirements({ path, admin }: { path: string; admin: boolean }) {
  const [catalog, setCatalog] = useState<ResourceCatalogItem[]>([]);
  const [rows, setRows] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([read<ResourceCatalogItem[]>("/resource-catalog"), read<Requirement[]>(`${path}/resources`)])
      .then(([items, requirements]) => { if (active) { setCatalog(items); setRows(requirements); } })
      .catch((cause) => { if (active) setError(resultMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!admin || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await put(`${path}/resources`, rows.map(({ resourceCatalogItemId, quantity }) => ({ resourceCatalogItemId, quantity })));
      setSuccess("Recursos da UC salvos. A análise de compatibilidade usa os mesmos recursos cadastrados nos ambientes.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }

  return <form className="space-y-4" onSubmit={(event) => void save(event)}>
    <p className="muted">Selecione os recursos necessários para a UC. Para um recurso sem contagem, use quantidade 1 (presença). Não é necessário cadastrar atividades ou capacidades para esta seleção.</p>
    {loading && <Busy />}{error && <Notice message={error} />}{success && <Notice type="success" message={success} />}
    {!loading && rows.length === 0 && <Notice type="info" message="Nenhum recurso configurado para esta UC. Compatibilidade técnica não comprovada." />}
    {!loading && <fieldset disabled={!admin || busy} className="space-y-3">
      {rows.length > 0 && <h3 className="text-sm font-bold text-ink">Recursos escolhidos ({rows.length})</h3>}
      {rows.map((row) => <div key={row.resourceCatalogItemId} className="grid gap-3 rounded-panel border border-line p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <p className="text-ink font-medium">{row.name} <span className="muted">· {row.category}</span></p>
        <Field label={`Quantidade necessária de ${row.name}`}><input className="field" type="number" min={1} max={100000} required value={row.quantity}
          onChange={(event) => setRows((current) => current.map((item) => item.resourceCatalogItemId === row.resourceCatalogItemId
            ? { ...item, quantity: Number(event.target.value) } : item))} /></Field>
        {admin && <button type="button" className="btn-danger" onClick={() => setRows((current) => current.filter((item) => item.resourceCatalogItemId !== row.resourceCatalogItemId))}>Remover {row.name}</button>}
      </div>)}
      {admin && <Field label="Adicionar recurso do catálogo"><select className="field" value="" onChange={(event) => {
        const item = catalog.find((candidate) => candidate.id === Number(event.target.value));
        if (item) setRows((current) => [...current, { resourceCatalogItemId: item.id, name: item.name, category: item.category, quantity: 1 }]);
      }}><option value="">Selecione</option>{catalog.filter((item) => item.active && !rows.some((row) => row.resourceCatalogItemId === item.id))
        .map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></Field>}
      {admin && <SubmitButton busy={busy}>Salvar recursos da UC</SubmitButton>}
    </fieldset>}
  </form>;
}
