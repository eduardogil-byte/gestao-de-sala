import { useState } from "react";
import { post, put } from "../lib/api";
import { resultMessage } from "../lib/utils";
import type { ResourceCatalogItem } from "../types";
import { Card, Field, Notice, SectionHeading, SubmitButton, useConfirmation } from "./UI";

type Draft = { name: string; category: string; description: string; active: boolean };
const empty: Draft = { name: "", category: "", description: "", active: true };

export function ResourceCatalogManager({ catalog, onChanged }: {
  catalog: ResourceCatalogItem[]; onChanged: () => Promise<void>;
}) {
  const confirm = useConfirmation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const edit = (item: ResourceCatalogItem) => {
    setEditingId(item.id);
    setDraft({ name: item.name, category: item.category, description: item.description ?? "", active: item.active });
    setError(""); setSuccess("");
  };
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      if (editingId) await put(`/resource-catalog/${editingId}`, draft);
      else await post("/resource-catalog", draft);
      await onChanged();
      setEditingId(null); setDraft(empty);
      setSuccess("Catálogo de recursos atualizado.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  async function setActive(item: ResourceCatalogItem, active: boolean) {
    if (!active && !await confirm({ title: "Desativar recurso", message: `O recurso ${item.name} deixará de aparecer em novos cadastros. Inventários e requisitos existentes serão preservados.`, confirmLabel: "Desativar", danger: true })) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await put(`/resource-catalog/${item.id}`, { name: item.name, category: item.category, description: item.description, active });
      await onChanged();
      setSuccess(active ? "Recurso reativado." : "Recurso desativado; vínculos existentes preservados.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  return <Card className="p-5 mt-6 space-y-4">
    <SectionHeading title="Catálogo de recursos" subtitle="Tipos disponíveis para o inventário dos ambientes. Sala ativa é uma propriedade independente." />
    {error && <Notice message={error} />}{success && <Notice type="success" message={success} />}
    {catalog.length ? <ul className="grid gap-2 sm:grid-cols-2">
      {catalog.map((item) => <li key={item.id} className="rounded-control border border-line p-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><strong className="text-ink">{item.name}</strong><p className="text-sm text-muted-ink">{item.category} · {item.active ? "Ativo" : "Inativo"}</p>{item.description && <p className="text-sm text-muted-ink">{item.description}</p>}</div>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={() => edit(item)}>Editar {item.name}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void setActive(item, !item.active)}>{item.active ? "Desativar" : "Reativar"} {item.name}</button></div>
      </li>)}
    </ul> : <p className="muted">Nenhum tipo cadastrado. Cadastre o primeiro recurso para associá-lo a um ambiente.</p>}
    <form className="space-y-3 border-t border-line pt-4" onSubmit={(event) => void save(event)}>
      <h3 className="font-semibold text-ink">{editingId ? "Editar tipo de recurso" : "Novo tipo de recurso"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><input className="field" required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <Field label="Categoria"><input className="field" required maxLength={80} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></Field>
        <Field label="Descrição"><input className="field" maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap gap-2"><SubmitButton busy={busy}>{editingId ? "Salvar tipo" : "Adicionar recurso"}</SubmitButton>
        {editingId && <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setDraft(empty); }}>Cancelar edição</button>}
      </div>
    </form>
  </Card>;
}
