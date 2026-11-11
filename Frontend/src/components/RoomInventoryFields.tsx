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

export function RoomInventoryFields({ groups, resources, software, catalog, onGroups, onResources, onRemoveGroup, onRemoveSoftware }: {
  groups: ComputerGroup[]; resources: RoomResource[]; software: Software[]; catalog: ResourceCatalogItem[];
  onGroups: (groups: ComputerGroup[]) => void; onResources: (resources: RoomResource[]) => void;
  onRemoveGroup: (index: number) => void; onRemoveSoftware: (index: number, softwareId: number) => void;
}) {
  const changeGroup = (index: number, patch: Partial<ComputerGroup>) =>
    onGroups(groups.map((group, i) => i === index ? { ...group, ...patch } : group));
  const changeResource = (index: number, patch: Partial<RoomResource>) =>
    onResources(resources.map((resource, i) => i === index ? { ...resource, ...patch } : resource));
  return <section aria-label="Inventário técnico" className="border-t border-line pt-5 space-y-6">
    <div className="flex flex-wrap justify-between gap-3 items-center">
      <SectionHeading title="Grupos de computadores" subtitle="Equipamentos cadastrados, condições operacionais e especificações técnicas." />
      <button type="button" className="btn-secondary" onClick={() => onGroups([...groups, {
        description: "", quantity: 1, operationalQuantity: null, ramGb: 0, tier: "Basico", dedicatedGpu: false, software: [],
      }])}>Adicionar grupo</button>
    </div>
    <p className="muted">Deixe em branco o que não foi verificado. Quantidade cadastrada não comprova quantidade operacional. Validade em branco significa prazo não informado.</p>
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
    <div className="flex flex-wrap justify-between gap-3 items-center border-t border-line pt-5">
      <SectionHeading title="Equipamentos e recursos" subtitle="Máquinas, ferramentas, mobiliário e demais recursos do ambiente." />
      <Field label="Adicionar recurso do catálogo"><select className="field" value="" onChange={(event) => {
        const selected = catalog.find((item) => item.id === Number(event.target.value));
        if (selected) onResources([...resources, { resourceCatalogItemId: selected.id,
          name: selected.name, type: selected.category, quantity: 1, operationalQuantity: null,
          description: null, condition: null, technicalDetails: null, voltage: null,
          warrantyExpiresOn: null, licenseExpiresOn: null }]);
      }}><option value="">Selecione um recurso</option>{catalog.filter((item) => item.active &&
        !resources.some((resource) => resource.resourceCatalogItemId === item.id ||
          (resource.name.toLocaleUpperCase("pt-BR") === item.name.toLocaleUpperCase("pt-BR") &&
            resource.type.toLocaleUpperCase("pt-BR") === item.category.toLocaleUpperCase("pt-BR"))))
        .map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></Field>
    </div>
    {resources.length === 0 && <p className="rounded-control border border-dashed border-line p-4 muted">Nenhum equipamento ou recurso cadastrado.</p>}
    {resources.map((resource, index) => <fieldset key={resource.id ?? `new-${index}`} className="border border-line rounded-panel p-4 sm:p-5">
      <legend className="font-semibold px-1">Equipamento {index + 1}{resource.id ? ` · ID ${resource.id}` : " · Novo"}</legend>
      <div className="grid sm:grid-cols-2 gap-3">
        {resource.resourceCatalogItemId && <p className="sm:col-span-2 text-sm text-muted-ink">{resource.name} · {resource.type} — identidade do catálogo preservada.</p>}
        {([["name", "Nome", 120], ["type", "Tipo", 80], ["description", "Descrição", 500],
          ["condition", "Condição", 80], ["technicalDetails", "Detalhes técnicos", 2000]] as const).filter(([key]) =>
            !resource.resourceCatalogItemId || (key !== "name" && key !== "type")).map(([key, label, maxLength]) =>
          <Field key={key} label={label}><input className="field" required={key === "name" || key === "type"} maxLength={maxLength}
            value={resource[key] ?? ""} onChange={(e) => changeResource(index, { [key]: e.target.value })} /></Field>)}
        <Field label="Quantidade cadastrada"><input className="field" required type="number" min={0} max={100000} value={resource.quantity}
          onChange={(e) => changeResource(index, { quantity: Number(e.target.value) })} /></Field>
        <Field label="Quantidade operacional (opcional)"><input className="field" type="number" min={0} max={resource.quantity}
          value={resource.operationalQuantity ?? ""} onChange={(e) => changeResource(index, { operationalQuantity: optionalNumber(e.target.value) })} /></Field>
        <Field label="Voltagem (opcional)"><input className="field" type="number" min={1} max={1000} value={resource.voltage ?? ""}
          onChange={(e) => changeResource(index, { voltage: optionalNumber(e.target.value) })} /></Field>
        <Field label="Garantia até (opcional)"><input className="field" type="date" value={resource.warrantyExpiresOn ?? ""}
          onChange={(e) => changeResource(index, { warrantyExpiresOn: e.target.value || null })} /></Field>
        <Field label="Licença até (opcional)"><input className="field" type="date" value={resource.licenseExpiresOn ?? ""}
          onChange={(e) => changeResource(index, { licenseExpiresOn: e.target.value || null })} /></Field>
      </div>
      {!resource.id && <button type="button" className="btn-secondary mt-3" onClick={() => onResources(resources.filter((_, i) => i !== index))}>Descartar equipamento novo</button>}
    </fieldset>)}
  </section>;
}
