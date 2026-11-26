import { useState } from "react";
import { Pencil, Plus, Power, RotateCcw } from "lucide-react";
import { post, put } from "../lib/api";
import { resultMessage } from "../lib/utils";
import type { ResourceCatalogItem } from "../types";
import { Field, Modal, Notice, SubmitButton, useConfirmation } from "./UI";
import { Panel } from "./senai/SenaiUI";

type Draft = { name: string; category: string; description: string; active: boolean };
const empty: Draft = { name: "", category: "", description: "", active: true };

export function ResourceCatalogManager({ catalog, onChanged }: {
  catalog: ResourceCatalogItem[]; onChanged: () => Promise<void>;
}) {
  const confirm = useConfirmation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const edit = (item: ResourceCatalogItem) => {
    setEditingId(item.id);
    setDraft({ name: item.name, category: item.category, description: item.description ?? "", active: item.active });
    setError(""); setSuccess("");
    setEditorOpen(true);
  };
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      if (editingId) await put(`/resource-catalog/${editingId}`, draft);
      else await post("/resource-catalog", draft);
      await onChanged();
      setEditingId(null); setDraft(empty);
      setEditorOpen(false);
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
  return <>
    <Panel title="Catálogo de recursos" subtitle="Recursos compartilhados entre os ambientes."
      action={<button type="button" className="btn-primary" disabled={busy} onClick={() => { setEditingId(null); setDraft(empty); setError(""); setSuccess(""); setEditorOpen(true); }}><Plus size={17} aria-hidden="true" />Novo tipo de recurso</button>}>
      {error && !editorOpen && <div className="mb-3"><Notice message={error} /></div>}
      {success && <div className="mb-3"><Notice type="success" message={success} /></div>}
      {catalog.length ? <ul className="sg-catalog">
        {catalog.map((item) => <li key={item.id}>
          <div className="sg-item-text"><strong>{item.name}</strong><small>{item.category}{item.description ? ` · ${item.description}` : ""}</small></div>
          <span className={`sg-status ${item.active ? "is-active" : ""}`}>{item.active ? "Ativo" : "Inativo"}</span>
          <div className="sg-row-actions">
            <button type="button" className="sg-icon-button" title="Editar" aria-label={`Editar recurso ${item.name}`} disabled={busy} onClick={() => edit(item)}><Pencil size={16} aria-hidden="true" /></button>
            <button type="button" className="sg-icon-button" title={item.active ? "Desativar" : "Reativar"} aria-label={`${item.active ? "Desativar" : "Reativar"} recurso ${item.name}`}
              disabled={busy} onClick={() => void setActive(item, !item.active)}>{item.active ? <Power size={16} aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}</button>
          </div>
        </li>)}
      </ul> : <p className="sg-empty">Nenhum tipo cadastrado. Cadastre o primeiro recurso para associá-lo a um ambiente.</p>}
    </Panel>
    {editorOpen && <Modal title={editingId ? "Editar tipo de recurso" : "Novo tipo de recurso"} width="max-w-xl" onClose={() => { if (!busy) { setEditorOpen(false); setError(""); } }}>
    {error && <div className="mb-3"><Notice message={error} /></div>}
    <form onSubmit={(event) => void save(event)}><fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><input className="field" required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <Field label="Categoria"><input className="field" required maxLength={80} list="catalog-categories" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          <datalist id="catalog-categories">{[...new Set(catalog.map((item) => item.category))].sort().map((value) => <option key={value} value={value} />)}</datalist></Field>
        <Field label="Descrição"><input className="field" maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => { setEditorOpen(false); setError(""); }}>Cancelar</button>
        <SubmitButton busy={busy}>{editingId ? "Salvar alterações" : "Adicionar recurso"}</SubmitButton>
      </div>
    </fieldset></form>
    </Modal>}
  </>;
}
