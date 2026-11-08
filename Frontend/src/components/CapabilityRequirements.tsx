import { useEffect, useRef, useState } from "react";
import { post, put, read } from "../lib/api";
import { useData } from "../lib/data";
import { resultMessage } from "../lib/utils";
import { Busy, Checkbox, Field, Notice, SubmitButton } from "./UI";

type Requirements = {
  roomKind: string | null; requiresProjector: boolean; requiredComputers: number | null;
  minRamGb: number | null; computersCritical: boolean;
  resources: { name: string; type: string; quantity: number; critical: boolean }[];
  software: { softwareId: number; requiredLicenses: number | null; critical: boolean }[];
};
const empty: Requirements = { roomKind: null, requiresProjector: false, requiredComputers: null,
  minRamGb: null, computersCritical: false, resources: [], software: [] };
const optionalNumber = (value: string) => value === "" ? null : Number(value);

export function CapabilityRequirements({ path, admin }: { path: string; admin: boolean }) {
  const { data } = useData();
  const [draft, setDraft] = useState<Requirements | null>(null);
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    read<Requirements & { registered: boolean }>(`${path}/environment-requirements`).then((value) => {
      if (typeof value?.registered !== "boolean" || (value.registered && (!Array.isArray(value.resources) || !Array.isArray(value.software))))
        throw new Error("A API retornou requisitos técnicos incompletos.");
      if (active) { setRegistered(value.registered); setDraft(value.registered ? value : { ...empty }); }
    }).catch((cause) => { if (active) setError(resultMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; };
  }, [path]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!admin || !draft || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      if (registered) await put(`${path}/environment-requirements`, draft);
      else await post(`${path}/environment-requirements`, draft);
      if (mounted.current) { setRegistered(true); setSuccess("Requisitos técnicos salvos. As análises de compatibilidade passam a usar estes critérios."); }
    } catch (cause) { if (mounted.current) setError(resultMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <form className="space-y-4" onSubmit={(e) => void save(e)}>
    <p className="muted">Requisitos da capacidade selecionada. Compatibilidade técnica não comprova disponibilidade do ambiente.</p>
    {loading && <Busy />}{error && <Notice message={error} />}{success && <Notice type="success" message={success} />}
    {!loading && draft && !registered && <Notice type="info" message="Requisitos ainda não cadastrados. A adequação técnica não está comprovada." />}
    {draft && <>
      <fieldset disabled={busy || !admin} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Tipo de ambiente exigido"><select className="field" value={draft.roomKind ?? ""} onChange={(e) => setDraft({ ...draft, roomKind: e.target.value || null })}>
            <option value="">Sem exigência de tipo</option><option value="Comum">Sala comum</option><option value="Laboratorio">Laboratório</option>
            <option value="Hibrida">Híbrida</option><option value="Oficina">Oficina</option>
          </select></Field>
          <Field label="Computadores necessários (opcional)"><input className="field" type="number" min={1} max={1000}
            value={draft.requiredComputers ?? ""} onChange={(e) => setDraft({ ...draft, requiredComputers: optionalNumber(e.target.value) })} /></Field>
          <Field label="RAM mínima por computador (GB, opcional)"><input className="field" type="number" min={1} max={4096}
            value={draft.minRamGb ?? ""} onChange={(e) => setDraft({ ...draft, minRamGb: optionalNumber(e.target.value) })} /></Field>
        </div>
        <p className="muted">Para exigir RAM ou softwares, informe a quantidade de computadores. Critérios críticos podem impedir a compatibilidade quando não atendidos.</p>
        <Checkbox label="Projetor obrigatório" checked={draft.requiresProjector} onChange={(requiresProjector) => setDraft({ ...draft, requiresProjector })} />
        <Checkbox label="Computadores são requisito crítico" checked={draft.computersCritical} onChange={(computersCritical) => setDraft({ ...draft, computersCritical })} />
        <h3 className="font-semibold">Recursos exigidos</h3>
        {draft.resources.map((resource, index) => {
          const change = (patch: Partial<typeof resource>) => setDraft({ ...draft, resources: draft.resources.map((row, i) => i === index ? { ...row, ...patch } : row) });
          return <fieldset key={index} className="border border-line rounded-lg p-3 space-y-3">
            <legend className="px-1">Recurso {index + 1}</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Nome do recurso"><input className="field" required maxLength={120} value={resource.name} onChange={(e) => change({ name: e.target.value })} /></Field>
              <Field label="Tipo do recurso"><input className="field" required maxLength={80} value={resource.type} onChange={(e) => change({ type: e.target.value })} /></Field>
              <Field label="Quantidade exigida"><input className="field" required type="number" min={1} max={100000} value={resource.quantity} onChange={(e) => change({ quantity: Number(e.target.value) })} /></Field>
            </div>
            <Checkbox label="Recurso crítico" checked={resource.critical} onChange={(critical) => change({ critical })} />
            {admin && <button type="button" className="btn-danger" onClick={() => setDraft((current) => current && ({ ...current, resources: current.resources.filter((_, i) => i !== index) }))}>Remover requisito de recurso {index + 1}</button>}
          </fieldset>;
        })}
        {admin && <button type="button" className="btn-secondary" disabled={draft.resources.length >= 100} onClick={() => setDraft({ ...draft, resources: [...draft.resources, { name: "", type: "", quantity: 1, critical: false }] })}>Adicionar requisito de recurso</button>}
        <h3 className="font-semibold">Softwares exigidos</h3>
        {admin && <Field label="Adicionar software exigido"><select className="field" value="" onChange={(e) => {
          if (e.target.value) setDraft({ ...draft, software: [...draft.software, { softwareId: Number(e.target.value), requiredLicenses: null, critical: true }] });
        }}><option value="">Selecione</option>{data.software.filter((s) => !draft.software.some((row) => row.softwareId === s.id))
          .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {draft.software.map((software) => <fieldset key={software.softwareId} className="border border-line rounded-lg p-3 space-y-3">
          <legend className="px-1">{data.software.find((s) => s.id === software.softwareId)?.name ?? `Software ${software.softwareId}`}</legend>
          <Field label="Licenças necessárias (opcional)"><input className="field" type="number" min={1} max={1000} value={software.requiredLicenses ?? ""}
            onChange={(e) => setDraft({ ...draft, software: draft.software.map((row) => row.softwareId === software.softwareId ? { ...row, requiredLicenses: optionalNumber(e.target.value) } : row) })} /></Field>
          <Checkbox label="Software crítico" checked={software.critical} onChange={(critical) => setDraft({ ...draft, software: draft.software.map((row) => row.softwareId === software.softwareId ? { ...row, critical } : row) })} />
          {admin && <button type="button" className="btn-danger" onClick={() => setDraft((current) => current && ({ ...current, software: current.software.filter((row) => row.softwareId !== software.softwareId) }))}>Remover requisito de software {data.software.find((s) => s.id === software.softwareId)?.name ?? software.softwareId}</button>}
        </fieldset>)}
        {admin && <><p className="muted">Inclusões e remoções só são aplicadas ao salvar. O contrato permite retirar critérios individuais, mas não excluir o cadastro completo de requisitos.</p><SubmitButton busy={busy}>Salvar requisitos técnicos</SubmitButton></>}
      </fieldset>
      {!admin && <p className="muted">Consulta disponível. Somente Admin pode alterar os requisitos técnicos.</p>}
    </>}
  </form>;
}
