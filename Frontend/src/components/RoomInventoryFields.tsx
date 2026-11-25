import { ComputerGroupFields } from "./ComputerGroupFields";
import { QuickResourceCreate } from "./QuickResourceCreate";
import { RemoveIconButton } from "./RemoveIconButton";
import { useId, useState } from "react";
import { Info } from "lucide-react";
import type { ComputerGroup, ResourceCatalogItem, RoomResource, Software } from "../types";
import { Checkbox, Field, SectionHeading } from "./UI";

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
  const [resourceHelpOpen, setResourceHelpOpen] = useState(false);
  const resourceHelpId = useId();
  const nextGroupName = () => {
    let number = 1;
    while (groups.some((group) => group.description.trim().toLocaleLowerCase("pt-BR") === `grupo ${number}`)) number++;
    return `Grupo ${number}`;
  };
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
        description: nextGroupName(), operatingSystem: "Windows 11", quantity: 1, operationalQuantity: 1, ramGb: 8, storage: "256 GB", graphicsCard: "Integrada", tier: "Basico", dedicatedGpu: false, software: [],
      }])}>Adicionar grupo</button>
    </div>
    {groups.length === 0 && <p className="rounded-control border border-dashed border-line p-4 muted">Nenhum grupo de computadores cadastrado.</p>}
    {groups.map((group, index) => <fieldset key={group.id ?? `new-${index}`} className="relative rounded-panel border border-line p-4 pt-5 sm:p-5 space-y-5">
      <legend className="font-semibold px-1 pr-12 max-w-full break-words">Grupo {index + 1}{group.id ? ` · ID ${group.id}` : " · Novo"}</legend>
      <RemoveIconButton label={`Remover grupo de computadores ${group.description || index + 1}`} onClick={() => onRemoveGroup(index)} />
      <ComputerGroupFields group={group} software={software} onChange={(patch) => changeGroup(index, patch)} onRemoveSoftware={(id) => onRemoveSoftware(index, id)} />
      <button type="button" className="btn-secondary" onClick={() => onGroups([...groups, {
        ...group, id: undefined, description: nextGroupName(), operationalQuantity: null,
        software: group.software.map((item) => ({ ...item, installedQuantity: 1, licenseQuantity: null, licenseExpiresOn: null })),
      }])}>Duplicar configuração</button>
    </fieldset>)}
    </details>
    <div className="flex flex-wrap justify-between gap-3 items-center border-t border-line pt-5">
      <div className="flex items-center gap-2">
        <SectionHeading title="Equipamentos e recursos" />
        <span className="relative inline-flex" onMouseEnter={() => setResourceHelpOpen(true)} onMouseLeave={() => setResourceHelpOpen(false)}>
          <button type="button" aria-label="Informações sobre equipamentos e recursos" aria-describedby={resourceHelpOpen ? resourceHelpId : undefined}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-ink hover:bg-action-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500"
            onFocus={() => setResourceHelpOpen(true)} onBlur={() => setResourceHelpOpen(false)}
            onClick={() => setResourceHelpOpen(true)} onKeyDown={(event) => { if (event.key === "Escape" && resourceHelpOpen) { event.stopPropagation(); setResourceHelpOpen(false); } }}>
            <Info size={17} aria-hidden="true" />
          </button>
          {resourceHelpOpen && <span id={resourceHelpId} role="tooltip" className="absolute right-0 top-full z-20 w-64 max-w-[calc(100vw-3rem)] rounded-lg border border-line bg-surface p-3 text-left text-sm font-normal text-ink shadow-lg">
            Máquinas, ferramentas, mobiliário e demais recursos do ambiente.
          </span>}
        </span>
      </div>
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
    {resources.map((resource, index) => <fieldset key={resource.id ?? `new-${index}`} className="relative border border-line rounded-panel p-4 pt-5 sm:p-5">
      <legend className={`font-semibold px-1 break-words max-w-full ${!resource.id ? "pr-12" : ""}`}>{resource.name} · {resource.type}{resource.id ? ` · ID ${resource.id}` : ""}</legend>
      {!resource.id && <RemoveIconButton label={`Remover recurso ${resource.name}`} onClick={() => onResources(resources.filter((_, i) => i !== index))} />}
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
    </fieldset>)}
  </section>;
}
