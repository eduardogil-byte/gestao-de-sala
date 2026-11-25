import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Need, Software } from "../types";
import { Checkbox, Field, SearchableSelect } from "./UI";

export const defaultNeed: Need = {
  needsProjector: true,
  needsTeacherComputer: true,
  needsStudentComputers: false,
  minTier: "Basico",
  minRamGb: 0,
  needsDedicatedGpu: false,
  softwareIds: [],
};

export function NeedFields({ value, onChange, software, resourcePicker = false }: {
  value: Need; onChange: (next: Need) => void; software: Software[]; resourcePicker?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [softwareId, setSoftwareId] = useState("");
  const set = <K extends keyof Need>(key: K, next: Need[K]) => onChange({ ...value, [key]: next });
  const available = software.filter((item) => !value.softwareIds.includes(item.id));
  return <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Checkbox label="Projetor" checked={value.needsProjector} onChange={(next) => set("needsProjector", next)} />
      <Checkbox label="Computador do instrutor" checked={value.needsTeacherComputer} onChange={(next) => set("needsTeacherComputer", next)} />
      <Checkbox label={resourcePicker ? "Computador para alunos" : "Computadores para alunos"} checked={value.needsStudentComputers} onChange={(next) => resourcePicker
        ? set("needsStudentComputers", next)
        : onChange(next ? { ...value, needsStudentComputers: true } : { ...value, needsStudentComputers: false, minTier: "Basico", minRamGb: 0, needsDedicatedGpu: false })} />
      <Checkbox label="GPU dedicada" checked={value.needsDedicatedGpu} onChange={(next) => set("needsDedicatedGpu", next)} disabled={!value.needsStudentComputers && (!resourcePicker || value.softwareIds.length === 0)} />
    </div>
    {(value.needsStudentComputers || (resourcePicker && value.softwareIds.length > 0)) && <div className="grid grid-cols-2 gap-3">
      <Field label="Potência mínima"><select className="field" value={value.minTier} onChange={(event) => set("minTier", event.target.value)}>
        <option value="Basico">Básico</option><option value="Intermediario">Intermediário</option><option value="Alto">Alto</option>
      </select></Field>
      <Field label="RAM mínima (GB)"><input className="field" type="number" min="0" max="512" step="1" placeholder="0" value={!resourcePicker && value.minRamGb === 0 ? "" : value.minRamGb} onChange={(event) => set("minRamGb", Number(event.target.value))} /></Field>
    </div>}
    {resourcePicker ? <div className="space-y-2">
      <p className="field-label">Softwares necessários</p>
      {value.softwareIds.length ? <ul className="flex flex-wrap gap-2">{value.softwareIds.map((id) => {
        const name = software.find((item) => item.id === id)?.name ?? `Software #${id}`;
        return <li key={id} className="pill border border-line bg-surface text-ink gap-2">{name}
          <button type="button" aria-label={`Remover ${name}`} className="rounded p-1 hover:bg-white/10" onClick={() => set("softwareIds", value.softwareIds.filter((selected) => selected !== id))}><X size={14} aria-hidden="true" /></button>
        </li>;
      })}</ul> : <p className="muted">Nenhum software selecionado.</p>}
      <button type="button" className="btn-secondary" aria-expanded={adding} onClick={() => setAdding((open) => !open)}><Plus size={16} aria-hidden="true" /> Adicionar recurso</button>
      {adding && <div className="rounded-panel border border-line p-3 space-y-2">
        {available.length ? <><SearchableSelect label="Software do catálogo" options={[{ value: "", label: "Selecione um software" }, ...available.map((item) => ({ value: String(item.id), label: item.name }))]} value={softwareId} onChange={setSoftwareId} searchThreshold={0} />
          <button type="button" className="btn-primary" disabled={!softwareId} onClick={() => {
            const id = Number(softwareId);
            if (available.some((item) => item.id === id)) set("softwareIds", [...value.softwareIds, id]);
            setSoftwareId("");
          }}>Adicionar software</button></> : <p className="muted">Nenhum software disponível no catálogo.</p>}
      </div>}
      <p className="text-xs text-muted-ink">Softwares exigem computadores compatíveis para os alunos, mesmo sem marcar a opção acima.</p>
    </div> : software.length > 0 && <div>
      <p className="field-label mb-2">Programas necessários</p>
      <div className="grid sm:grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl max-h-36 overflow-y-auto">
        {software.map((item) => <Checkbox key={item.id} label={item.name} checked={value.softwareIds.includes(item.id)}
          onChange={(selected) => set("softwareIds", selected ? [...value.softwareIds, item.id] : value.softwareIds.filter((id) => id !== item.id))} />)}
      </div>
      <p className="text-xs text-slate-500 mt-2">A seleção de softwares exige computadores compatíveis para os alunos, mesmo se a caixa de computadores não estiver marcada.</p>
    </div>}
  </div>;
}
