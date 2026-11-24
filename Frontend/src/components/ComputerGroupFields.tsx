import { useState } from "react";
import { RemoveIconButton } from "./RemoveIconButton";
import type { ComputerGroup, Software } from "../types";
import { post } from "../lib/api";
import { useData } from "../lib/data";
import { resultMessage } from "../lib/utils";
import { Field, Notice } from "./UI";

function Preset({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const [other, setOther] = useState(false);
  const custom = other || (!!value && !options.includes(value));
  return <Field label={label}><select className="field" value={custom ? "other" : value} onChange={(event) => {
    setOther(event.target.value === "other"); onChange(event.target.value === "other" ? "" : event.target.value);
  }}><option value="">Não informado</option>{options.map((item) => <option key={item}>{item}</option>)}<option value="other">Outro</option></select>
    {custom && <input className="field mt-2" aria-label={`${label} personalizado`} maxLength={120} value={value} onChange={(event) => onChange(event.target.value)} />}
  </Field>;
}

export function ComputerGroupFields({ group, software, onChange, onRemoveSoftware }: {
  group: ComputerGroup; software: Software[]; onChange: (patch: Partial<ComputerGroup>) => void; onRemoveSoftware: (id: number) => void;
}) {
  const { reload } = useData();
  const [operationalMode, setOperationalMode] = useState<string | null>(() => group.operationalQuantity === group.quantity ? "all" : null);
  const [ramOther, setRamOther] = useState(false);
  const [newSoftware, setNewSoftware] = useState<Software[]>([]);
  const [softwareName, setSoftwareName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [installModes, setInstallModes] = useState<Record<number, string>>({});
  const catalog = [...software, ...newSoftware.filter((item) => !software.some((row) => row.id === item.id))];
  const mode = operationalMode ?? (group.operationalQuantity == null ? "unknown" : "quantity");
  const addSoftware = (item: Software) => {
    if (!group.software.some((row) => row.softwareId === item.id)) onChange({ software: [...group.software, {
      softwareId: item.id, name: item.name, installedQuantity: 1, licenseQuantity: null, licenseExpiresOn: null, version: null,
    }] });
  };
  async function createSoftware() {
    setError("");
    const name = softwareName.trim();
    if (name.length < 2) { setError("Informe o nome do software (mínimo 2 caracteres)."); return; }
    const existing = catalog.find((item) => item.name.trim().toLocaleUpperCase("pt-BR") === name.toLocaleUpperCase("pt-BR"));
    if (existing) { addSoftware(existing); setCreating(false); setSoftwareName(""); return; }
    setBusy(true);
    try {
      const item = await post<Software>("/software", { name });
      setNewSoftware((items) => [...items, item]); addSoftware(item); setCreating(false); setSoftwareName("");
      void reload();
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="Nome do grupo"><input className="field" required maxLength={120} value={group.description} onChange={(event) => onChange({ description: event.target.value })} /></Field>
      <Field label="Computadores cadastrados"><input className="field" required type="number" min={1} max={1000} value={group.quantity} onChange={(event) => {
        const quantity = Number(event.target.value);
        onChange({ quantity, ...(mode === "all" ? { operationalQuantity: quantity } : {}), software: group.software.map((item) => installModes[item.softwareId] === "all" ? { ...item, installedQuantity: quantity } : item) });
      }} /></Field>
      <Field label="Computadores operacionais"><select className="field" value={mode} onChange={(event) => {
        const value = event.target.value; setOperationalMode(value);
        onChange({ operationalQuantity: value === "all" ? group.quantity : value === "unknown" ? null : group.operationalQuantity ?? 0 });
      }}><option value="unknown">Não verificado</option><option value="all">Todos funcionando</option><option value="quantity">Informar quantidade</option></select>
        {mode === "quantity" && <input className="field mt-2" aria-label="Quantidade operacional" type="number" min={0} max={group.quantity} value={group.operationalQuantity ?? ""} onChange={(event) => onChange({ operationalQuantity: event.target.value === "" ? null : Number(event.target.value) })} />}
      </Field>
      <Field label="RAM"><select className="field" value={ramOther || ![0, 8, 16, 32].includes(group.ramGb) ? "other" : group.ramGb} onChange={(event) => { setRamOther(event.target.value === "other"); onChange({ ramGb: event.target.value === "other" ? 0 : Number(event.target.value) }); }}>
        <option value={0}>Não informado</option>{[8, 16, 32].map((value) => <option key={value} value={value}>{value} GB</option>)}<option value="other">Outro</option></select>
        {(ramOther || ![0, 8, 16, 32].includes(group.ramGb)) && <input className="field mt-2" aria-label="RAM personalizada em GB" type="number" min={0} max={1024} value={group.ramGb || ""} onChange={(event) => onChange({ ramGb: Number(event.target.value) })} />}
      </Field>
      <Preset label="Armazenamento" value={group.storage ?? ""} options={["256 GB", "500 GB", "1 TB"]} onChange={(storage) => onChange({ storage: storage || null })} />
      <Preset label="Sistema operacional" value={group.operatingSystem ?? ""} options={["Windows 10", "Windows 11", "Linux"]} onChange={(operatingSystem) => onChange({ operatingSystem: operatingSystem || null })} />
      <Field label="Placa de vídeo"><select className="field" value={group.dedicatedGpu ? "dedicated" : group.graphicsCard === "Integrada" ? "integrated" : "unknown"} onChange={(event) => onChange({ dedicatedGpu: event.target.value === "dedicated", graphicsCard: event.target.value === "integrated" ? "Integrada" : group.graphicsCard === "Integrada" ? null : group.graphicsCard })}>
        <option value="unknown">Não informado</option><option value="integrated">Integrada</option><option value="dedicated">Dedicada</option></select></Field>
      <Field label="Modelo da placa (opcional)"><input className="field" disabled={group.graphicsCard === "Integrada"} maxLength={160} value={group.graphicsCard === "Integrada" ? "" : group.graphicsCard ?? ""} onChange={(event) => onChange({ graphicsCard: event.target.value || null })} /></Field>
    </div>
    <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-semibold text-ink">Detalhes técnicos</summary><div className="grid sm:grid-cols-2 gap-3 mt-3">
      <Field label="Processador"><input className="field" maxLength={160} value={group.processor ?? ""} onChange={(event) => onChange({ processor: event.target.value || null })} /></Field>
      <Field label="Desempenho"><select className="field" value={group.tier} onChange={(event) => onChange({ tier: event.target.value })}>{["Basico", "Intermediario", "Alto"].map((value) => <option key={value} value={value}>{value === "Basico" ? "Básico" : value === "Intermediario" ? "Intermediário" : "Alto"}</option>)}</select></Field>
      {([['virtualization', 'Virtualização'], ['dockerWsl', 'Docker / WSL'], ['cadCompatible', 'Compatível com CAD'], ['simulatorCompatible', 'Compatível com simuladores'], ['internetAvailable', 'Internet: exceção deste grupo']] as const).map(([key, label]) => <Field key={key} label={label}><select className="field" value={group[key] == null ? "" : String(group[key])} onChange={(event) => onChange({ [key]: event.target.value === "" ? null : event.target.value === "true" })}><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select></Field>)}
      <Field label="Rede: restrições deste grupo"><input className="field" maxLength={500} value={group.networkDetails ?? ""} onChange={(event) => onChange({ networkDetails: event.target.value || null })} /></Field>
    </div></details>
    <div className="space-y-3 border-t border-line pt-3"><p className="font-semibold text-ink">Softwares instalados</p>
      <Field label="Adicionar software instalado"><select className="field" value="" onChange={(event) => { const item = catalog.find((row) => row.id === Number(event.target.value)); if (item) addSoftware(item); }}><option value="">Selecione</option>{catalog.filter((item) => !group.software.some((row) => row.softwareId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setCreating(!creating)}>Novo software</button>
      {creating && <div className="space-y-2">{error && <Notice message={error} />}<Field label="Nome do novo software"><input className="field" maxLength={100} value={softwareName} onChange={(event) => setSoftwareName(event.target.value)} /></Field><button type="button" className="btn-secondary" disabled={busy} onClick={() => void createSoftware()}>{busy ? "Salvando…" : "Salvar software no catálogo"}</button></div>}
      {group.software.map((item) => {
        const change = (patch: Partial<typeof item>) => onChange({ software: group.software.map((row) => row.softwareId === item.softwareId ? { ...row, ...patch } : row) });
        return <fieldset key={item.softwareId} className="relative rounded-lg border border-line p-3 pt-5 space-y-3"><legend className="max-w-full break-words pr-12">{item.name}</legend>
          <RemoveIconButton label={`Remover software ${item.name}`} onClick={() => onRemoveSoftware(item.softwareId)} />
          <Field label={`Instalação de ${item.name}`}><select className="field" value={installModes[item.softwareId] ?? "quantity"} onChange={(event) => { setInstallModes((modes) => ({ ...modes, [item.softwareId]: event.target.value })); if (event.target.value === "all") change({ installedQuantity: group.quantity }); }}><option value="quantity">Quantidade personalizada</option><option value="all">Instalado em todos os computadores</option></select></Field>
          {installModes[item.softwareId] !== "all" && <Field label="Instalações"><input className="field" required type="number" min={1} max={group.quantity} value={item.installedQuantity} onChange={(event) => change({ installedQuantity: Number(event.target.value) })} /></Field>}
          <Field label="Versão"><input className="field" maxLength={80} value={item.version ?? ""} onChange={(event) => change({ version: event.target.value || null })} /></Field>
          <details><summary className="cursor-pointer text-ink">Licenças</summary><div className="grid sm:grid-cols-2 gap-3 mt-3"><Field label="Licenças (opcional)"><input className="field" type="number" min={1} value={item.licenseQuantity ?? ""} onChange={(event) => change({ licenseQuantity: event.target.value === "" ? null : Number(event.target.value) })} /></Field><Field label="Validade da licença (opcional)"><input className="field" type="date" value={item.licenseExpiresOn ?? ""} onChange={(event) => change({ licenseExpiresOn: event.target.value || null })} /></Field></div></details>
        </fieldset>;
      })}
    </div>
  </div>;
}
