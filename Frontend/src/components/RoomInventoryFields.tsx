import { QuickResourceCreate } from "./QuickResourceCreate";
import { useId, useState } from "react";
import { Info } from "lucide-react";
import type { ComputerGroup, ResourceCatalogItem, RoomResource, Software } from "../types";
import { Checkbox, Field, SectionHeading } from "./UI";

const textFields = [
  ["processor", "Processador", 160], ["storage", "Armazenamento", 120],
  ["graphicsCard", "Placa de vídeo", 160], ["operatingSystem", "Sistema operacional", 120],
  ["networkDetails", "Detalhes da rede", 500],
] as const;
const booleanFields = [
  ["virtualization", "Virtualização"], ["dockerWsl", "Docker / WSL"],
  ["cadCompatible", "Compatível com CAD"], ["simulatorCompatible", "Compatível com simuladores"],
  ["internetAvailable", "Internet disponível no grupo"],
] as const;
const optionalNumber = (value: string) => value === "" ? null : Number(value);

export function RoomInventoryFields({ groups, resources, software, catalog, onGroups, onResources, onRemoveGroup, onRemoveSoftware, onCatalogCreated }: {
  onCatalogCreated: (item: ResourceCatalogItem) => void;
  groups: ComputerGroup[]; resources: RoomResource[]; software: Software[]; catalog: ResourceCatalogItem[];
  onGroups: (groups: ComputerGroup[]) => void; onResources: (resources: RoomResource[]) => void;
  onRemoveGroup: (index: number) => void; onRemoveSoftware: (index: number, softwareId: number) => void;
}) {
  const [quantityMode, setQuantityMode] = useState<Record<string, boolean>>({});
  const [inventoryHelpOpen, setInventoryHelpOpen] = useState(false);
  const inventoryHelpId = useId();
  const usesQuantity = (resource: RoomResource, index: number) =>
    quantityMode[String(resource.id ?? `new-${index}`)] ?? !(resource.quantity === 1 && resource.operationalQuantity === 1);
  const changeGroup = (index: number, patch: Partial<ComputerGroup>) =>
    onGroups(groups.map((group, i) => i === index ? { ...group, ...patch } : group));
  const changeResource = (index: number, patch: Partial<RoomResource>) =>
    onResources(resources.map((resource, i) => i === index ? { ...resource, ...patch } : resource));
  return <section aria-label="Inventário técnico" className="border-t border-line pt-5 space-y-6">
    <details className="rounded-panel border border-line p-4">
    <summary className="cursor-pointer font-semibold text-ink">Computadores e softwares</summary>
    <p className="muted mt-2">Especificações e licenças dos computadores do ambiente.</p>
    <div className="flex flex-wrap justify-between gap-3 items-center mt-4">
      <div className="flex items-center gap-2">
        <SectionHeading title="Grupos de computadores" />
        <span className="relative inline-flex" onMouseEnter={() => setInventoryHelpOpen(true)} onMouseLeave={() => setInventoryHelpOpen(false)}>
          <button type="button" aria-label="Informações sobre os computadores" aria-describedby={inventoryHelpOpen ? inventoryHelpId : undefined}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-ink hover:bg-action-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500"
            onFocus={() => setInventoryHelpOpen(true)} onBlur={() => setInventoryHelpOpen(false)}
            onClick={() => setInventoryHelpOpen(true)} onKeyDown={(event) => { if (event.key === "Escape" && inventoryHelpOpen) { event.stopPropagation(); setInventoryHelpOpen(false); } }}>
            <Info size={17} aria-hidden="true" />
          </button>
          {inventoryHelpOpen && <span id={inventoryHelpId} role="tooltip" className="absolute right-0 top-full z-20 w-64 max-w-[calc(100vw-3rem)] rounded-lg border border-line bg-surface p-3 text-left text-sm font-normal text-ink shadow-lg">
            Equipamentos cadastrados, condições operacionais e especificações técnicas.
            <br />Deixe em branco o que não foi verificado. Quantidade cadastrada não comprova quantidade operacional. Validade em branco significa prazo não informado.
          </span>}
        </span>
      </div>
      <button type="button" className="btn-secondary" onClick={() => onGroups([...groups, {
        description: "", quantity: 1, operationalQuantity: null, ramGb: 0, tier: "Basico", dedicatedGpu: false, software: [],
      }])}>Adicionar grupo</button>
    </div>
    {groups.length === 0 && <p className="rounded-control border border-dashed border-line p-4 muted">Nenhum grupo de computadores cadastrado.</p>}
    {groups.map((group, index) => <fieldset key={group.id ?? `new-${index}`} className="rounded-panel border border-line p-4 sm:p-5 space-y-5">
      <legend className="font-semibold px-1">Grupo {index + 1}{group.id ? ` · ID ${group.id}` : " · Novo"}</legend>
      <p className="text-sm font-semibold text-ink">Identificação e quantidades</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Descrição do grupo"><input className="field" required maxLength={120} value={group.description}
          onChange={(e) => changeGroup(index, { description: e.target.value })} /></Field>
        <Field label="Computadores cadastrados"><input className="field" required type="number" min={1} max={1000} value={group.quantity}
          onChange={(e) => changeGroup(index, { quantity: Number(e.target.value) })} /></Field>
        <Field label="Computadores operacionais (opcional)"><input className="field" type="number" min={0} max={group.quantity}
          value={group.operationalQuantity ?? ""} onChange={(e) => changeGroup(index, { operationalQuantity: optionalNumber(e.target.value) })} /></Field>
        <Field label="RAM em GB (0 = não informada)"><input className="field" required type="number" min={0} value={group.ramGb}
          onChange={(e) => changeGroup(index, { ramGb: Number(e.target.value) })} /></Field>
        <Field label="Desempenho"><select className="field" value={group.tier} onChange={(e) => changeGroup(index, { tier: e.target.value })}>
          <option value="Basico">Básico</option><option value="Intermediario">Intermediário</option><option value="Alto">Alto</option>
        </select></Field>
        {textFields.map(([key, label, maxLength]) => <Field key={key} label={label}><input className="field" maxLength={maxLength}
          value={group[key] ?? ""} onChange={(e) => changeGroup(index, { [key]: e.target.value || null })} /></Field>)}
        {booleanFields.map(([key, label]) => <Field key={key} label={label}><select className="field"
          value={group[key] == null ? "" : String(group[key])} onChange={(e) => changeGroup(index, { [key]: e.target.value === "" ? null : e.target.value === "true" })}>
          <option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option>
        </select></Field>)}
      </div>
      <Checkbox label="GPU dedicada" checked={group.dedicatedGpu} onChange={(dedicatedGpu) => changeGroup(index, { dedicatedGpu })} />
      <div className="space-y-3 border-t border-line pt-4">
        <p className="text-sm font-semibold text-ink">Softwares instalados e licenças</p>
        <Field label="Adicionar software instalado"><select className="field" value="" onChange={(e) => {
          const selected = software.find((s) => s.id === Number(e.target.value));
          if (selected) changeGroup(index, { software: [...group.software, {
            softwareId: selected.id, name: selected.name, installedQuantity: 1, licenseQuantity: null, licenseExpiresOn: null, version: null,
          }] });
        }}><option value="">Selecione</option>{software.filter((s) => !group.software.some((x) => x.softwareId === s.id))
          .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        {group.software.map((installed) => {
          const change = (patch: Partial<typeof installed>) => changeGroup(index, { software: group.software.map((s) =>
            s.softwareId === installed.softwareId ? { ...s, ...patch } : s) });
          return <fieldset key={installed.softwareId} className="border border-line rounded-lg p-3 space-y-3">
            <legend className="px-1">{installed.name}</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Instalações"><input className="field" required type="number" min={1} max={group.quantity}
                value={installed.installedQuantity} onChange={(e) => change({ installedQuantity: Number(e.target.value) })} /></Field>
              <Field label="Licenças (opcional)"><input className="field" type="number" min={1} value={installed.licenseQuantity ?? ""}
                onChange={(e) => change({ licenseQuantity: optionalNumber(e.target.value) })} /></Field>
              <Field label="Versão"><input className="field" maxLength={80} value={installed.version ?? ""}
                onChange={(e) => change({ version: e.target.value || null })} /></Field>
              <Field label="Validade da licença (opcional)"><input className="field" type="date" value={installed.licenseExpiresOn ?? ""}
                onChange={(e) => change({ licenseExpiresOn: e.target.value || null })} /></Field>
            </div>
            <button type="button" className="btn-danger" onClick={() => onRemoveSoftware(index, installed.softwareId)}>Remover software {installed.name}</button>
          </fieldset>;
        })}
      </div>
      <button type="button" className="btn-danger" onClick={() => onRemoveGroup(index)}>Remover grupo {index + 1}</button>
    </fieldset>)}
    </details>
    <div className="flex flex-wrap justify-between gap-3 items-center border-t border-line pt-5">
      <SectionHeading title="Equipamentos e recursos" subtitle="Máquinas, ferramentas, mobiliário e demais recursos do ambiente." />
      <Field label="Adicionar recurso do catálogo"><select className="field" value="" onChange={(event) => {
        const selected = catalog.find((item) => item.id === Number(event.target.value));
        if (selected) onResources([...resources, { resourceCatalogItemId: selected.id,
          name: selected.name, type: selected.category, quantity: 1, operationalQuantity: 1,
          description: null, condition: null, technicalDetails: null, voltage: null,
          warrantyExpiresOn: null, licenseExpiresOn: null }]);
      }}><option value="">Selecione um recurso</option>{catalog.filter((item) => item.active &&
        !resources.some((resource) => resource.resourceCatalogItemId === item.id ||
          (resource.name.toLocaleUpperCase("pt-BR") === item.name.toLocaleUpperCase("pt-BR") &&
            resource.type.toLocaleUpperCase("pt-BR") === item.category.toLocaleUpperCase("pt-BR"))))
        .map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></Field>
    </div>
    <QuickResourceCreate catalog={catalog} onCreated={(item) => { onCatalogCreated(item);
      if (!resources.some((resource) => resource.resourceCatalogItemId === item.id))
        onResources([...resources, { resourceCatalogItemId: item.id, name: item.name, type: item.category, quantity: 1, operationalQuantity: 1, description: null, condition: null, technicalDetails: null, voltage: null, warrantyExpiresOn: null, licenseExpiresOn: null }]);
    }} />
    {resources.length === 0 && <p className="rounded-control border border-dashed border-line p-4 muted">Nenhum equipamento ou recurso cadastrado.</p>}
    {resources.map((resource, index) => <fieldset key={resource.id ?? `new-${index}`} className="border border-line rounded-panel p-4 sm:p-5">
      <legend className="font-semibold px-1">{resource.name} · {resource.type}{resource.id ? ` · ID ${resource.id}` : ""}</legend>
      {resource.resourceCatalogItemId ? <div className="grid sm:grid-cols-2 gap-3">
        <Field label={`Disponibilidade de ${resource.name}`}><select className="field"
          value={usesQuantity(resource, index) ? "quantity" : "presence"}
          onChange={(event) => { const counted = event.target.value === "quantity";
            setQuantityMode((current) => ({ ...current, [String(resource.id ?? `new-${index}`)]: counted }));
            if (!counted) changeResource(index, { quantity: 1, operationalQuantity: 1 });
            else changeResource(index, { quantity: Math.max(1, resource.quantity), operationalQuantity: resource.operationalQuantity ?? 0 }); }}>
          <option value="presence">Presente (sem contagem)</option><option value="quantity">Quantidade disponível</option>
        </select></Field>
        {usesQuantity(resource, index) &&
          <Field label="Quantidade disponível"><input className="field" type="number" min={0} max={100000}
            value={resource.operationalQuantity ?? ""} onChange={(event) => {
              const value = optionalNumber(event.target.value);
              changeResource(index, { quantity: Math.max(resource.quantity, value ?? 0), operationalQuantity: value });
            }} /></Field>}
      </div> : <p className="muted">Recurso legado preservado: {resource.quantity} cadastrado(s), {resource.operationalQuantity ?? "disponibilidade não informada"} disponível(is).</p>}
      {!resource.id && <button type="button" className="btn-secondary mt-3" onClick={() => onResources(resources.filter((_, i) => i !== index))}>Descartar equipamento novo</button>}
    </fieldset>)}
  </section>;
}
