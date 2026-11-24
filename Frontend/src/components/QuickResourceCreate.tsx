import { useState } from "react";
import { Plus } from "lucide-react";
import { post } from "../lib/api";
import { resultMessage } from "../lib/utils";
import type { ResourceCatalogItem } from "../types";
import { Field, Notice } from "./UI";

export function QuickResourceCreate({ catalog, onCreated }: {
  catalog: ResourceCatalogItem[]; onCreated: (item: ResourceCatalogItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setError("");
    if (!name.trim() || !category.trim()) { setError("Informe nome e categoria."); return; }
    const existing = catalog.find((item) => item.name.trim().toLocaleUpperCase("pt-BR") === name.trim().toLocaleUpperCase("pt-BR"));
    if (existing) { setError("Este recurso já existe no catálogo. Selecione-o na lista ou reative-o no catálogo."); return; }
    setBusy(true);
    try {
      const item = await post<ResourceCatalogItem>("/resource-catalog", { name: name.trim(), category: category.trim(), description: description.trim() || null, active: true });
      onCreated(item); setName(""); setCategory(""); setDescription(""); setOpen(false);
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div>
    <button type="button" className="btn-secondary" aria-expanded={open} aria-controls="quick-resource-fields" disabled={busy} onClick={() => setOpen(!open)}><Plus aria-hidden="true" size={16} />Novo recurso</button>
    {open && <fieldset id="quick-resource-fields" disabled={busy} className="mt-3 space-y-3 rounded-lg border border-line p-3">
      <legend className="font-semibold text-ink">Novo recurso do catálogo</legend>
      {error && <Notice message={error} />}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nome do recurso"><input className="field" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Categoria do recurso"><input className="field" maxLength={80} list="resource-categories" value={category} onChange={(event) => setCategory(event.target.value)} />
          <datalist id="resource-categories">{[...new Set(catalog.map((item) => item.category))].sort().map((value) => <option key={value} value={value} />)}</datalist></Field>
      </div>
      <details><summary className="cursor-pointer text-sm text-ink">Descrição opcional</summary>
        <Field label="Descrição do recurso"><input className="field mt-2" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      </details>
      <p className="muted text-xs">O recurso será salvo no catálogo compartilhado.</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => void create()}>{busy ? "Salvando…" : "Salvar e adicionar ao ambiente"}</button>
    </fieldset>}
  </div>;
}
