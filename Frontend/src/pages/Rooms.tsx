import { useEffect, useRef, useState } from "react";
import { AppWindow, Eye, HardDrive, Pencil, Plus, Search, Settings2, SlidersHorizontal } from "lucide-react";
import type { ResourceCatalogItem, Room, RoomInventory, RoomResource, User } from "../types";
import { useData } from "../lib/data";
import { post, put, read } from "../lib/api";
import { RoomInventoryFields } from "../components/RoomInventoryFields";
import { ResourceCatalogManager } from "../components/ResourceCatalogManager";
import { OperatingShiftEditor } from "../components/OperatingShiftEditor";
import { indicatorPath, isBottleneck, isSemesterIndicators, type SemesterIndicators } from "../lib/occupancyIndicators";
import { resultMessage, roomKind } from "../lib/utils";
import { Busy, Checkbox, Field, Modal, Notice, SubmitButton, useConfirmation } from "../components/UI";
import { PageHeading, Panel, SenaiScope, StatCard, Tabs } from "../components/senai/SenaiUI";

type RoomInput = Omit<Room, "id" | "desks"> & { resources: RoomResource[] };
type OfferedShift = { shiftId: number; weekdaysMask: number };
const stated = (value: string | null | undefined) => value?.trim() || "Não informado";
const yesNoUnknown = (value: boolean | null | undefined) => value == null ? "Não informado" : value ? "Sim" : "Não";
type DetailTab = "resumo" | "recursos" | "computadores";
type ResourceFilter = "todos" | "reduzida" | "desconhecida";
const reduced = (item: RoomResource) => item.operationalQuantity != null && item.operationalQuantity < item.quantity;
const emptyRoom: RoomInput = {
  code: "",
  name: "",
  location: "",
  purpose: "",
  kind: "Comum",
  seats: 30,
  hasProjector: false,
  hasTeacherComputer: false,
  hasInternet: false,
  active: true,
  computerGroups: [],
  resources: [],
};
export function Rooms({ user, onImport }: { user: User; onImport?: (kind: "Ambientes" | "Recursos") => void }) {
  const confirm = useConfirmation();
  const openingRequest = useRef(0);
  const persistedSoftware = useRef<Record<number, number[]>>({});
  const [opening, setOpening] = useState(false);
  const [removedGroupIds, setRemovedGroupIds] = useState<number[]>([]);
  const [removedSoftwareIds, setRemovedSoftwareIds] = useState<Record<number, number[]>>({});
  const admin = user.roles.includes("Admin");
  const { data, reload, loading: catalogLoading, error: catalogError } = useData();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("resumo");
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>("todos");
  const resourceCatalogRef = useRef<HTMLDivElement>(null);
  const [semesterId, setSemesterId] = useState("");
  const [shiftRoom, setShiftRoom] = useState<Room | null>(null);
  const [indicatorRefresh, setIndicatorRefresh] = useState(0);
  const [indicators, setIndicators] = useState<SemesterIndicators | null>(null);
  const [indicatorState, setIndicatorState] = useState<"idle" | "loading" | "error">("idle");
  const [offeredShifts, setOfferedShifts] = useState<Record<number, OfferedShift[] | null>>({});
  const [detail, setDetail] = useState<{ room: Room; inventory: RoomInventory } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<RoomInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [softwareName, setSoftwareName] = useState("");
  const [softwareBusy, setSoftwareBusy] = useState(false);
  const [softwareSuccess, setSoftwareSuccess] = useState("");
  const [softwareSearch, setSoftwareSearch] = useState("");
  const [resourceCatalog, setResourceCatalog] = useState<ResourceCatalogItem[]>([]);
  const [resourceCatalogError, setResourceCatalogError] = useState("");
  async function refreshResourceCatalog() {
    const items = await read<ResourceCatalogItem[]>("/resource-catalog");
    setResourceCatalog(items);
    setResourceCatalogError("");
  }
  useEffect(() => {
    let active = true;
    read<ResourceCatalogItem[]>("/resource-catalog").then((items) => { if (active) setResourceCatalog(items); })
      .catch((cause) => { if (active) setResourceCatalogError(resultMessage(cause)); });
    return () => { active = false; };
  }, []);
  const set = <K extends keyof RoomInput>(k: K, v: RoomInput[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  const groups = form?.computerGroups || [];
  useEffect(() => {
    if (!admin || !semesterId) { setIndicators(null); setIndicatorState("idle"); return; }
    let active = true;
    setIndicators(null); setIndicatorState("loading");
    read<unknown>(indicatorPath(Number(semesterId))).then((value) => {
      if (!isSemesterIndicators(value) || value.semesterId !== Number(semesterId)) throw new Error("Indicadores de outro semestre ou incompletos.");
      if (active) { setIndicators(value); setIndicatorState("idle"); }
    }).catch(() => { if (active) setIndicatorState("error"); });
    return () => { active = false; };
  }, [admin, semesterId, indicatorRefresh]);
  useEffect(() => {
    if (!admin || !semesterId) { setOfferedShifts({}); return; }
    let active = true;
    setOfferedShifts({});
    const rooms = data.rooms;
    void (async () => {
      for (let start = 0; start < rooms.length; start += 8) {
        const batch = await Promise.all(rooms.slice(start, start + 8).map(async (room) => {
          try {
            const rows = await read<OfferedShift[]>(`/semesters/${semesterId}/rooms/${room.id}/operating-shifts`);
            if (!Array.isArray(rows) || rows.some((row) => !Number.isInteger(row.shiftId) || !Number.isInteger(row.weekdaysMask) || row.weekdaysMask < 1 || row.weekdaysMask > 127))
              return [room.id, null] as const;
            return [room.id, rows] as const;
          } catch { return [room.id, null] as const; }
        }));
        if (!active) return;
        setOfferedShifts((current) => ({ ...current, ...Object.fromEntries(batch) }));
      }
    })();
    return () => { active = false; };
  }, [admin, semesterId, data.rooms, indicatorRefresh]);
  async function showDetail(room: Room) {
    const request = ++openingRequest.current;
    setDetail(null); setDetailLoading(true); setError("");
    setDetailTab("resumo"); setResourceFilter("todos");
    try {
      const inventory = await read<RoomInventory>(`/rooms/${room.id}/inventory`);
      if (request === openingRequest.current) setDetail({ room, inventory });
    } catch (cause) { if (request === openingRequest.current) setError(resultMessage(cause)); }
    finally { if (request === openingRequest.current) setDetailLoading(false); }
  }
  async function open(room?: Room) {
    const request = ++openingRequest.current;
    setError(""); setForm(null); setOpening(true);
    setRemovedGroupIds([]); setRemovedSoftwareIds({});
    try {
      const inventory = room ? await read<RoomInventory>(`/rooms/${room.id}/inventory`) : { computerGroups: [], resources: [] };
      if (request !== openingRequest.current) return;
      persistedSoftware.current = Object.fromEntries(inventory.computerGroups.filter((g) => g.id != null)
        .map((g) => [g.id!, g.software.map((s) => s.softwareId)]));
      setEditing(room?.id ?? null);
      setForm(room ? { ...room, ...inventory } : { ...emptyRoom, computerGroups: [], resources: [] });
    } catch (cause) { if (request === openingRequest.current) setError(resultMessage(cause)); }
    finally { if (request === openingRequest.current) setOpening(false); }
  }
  async function removeGroup(index: number) {
    const group = groups[index];
    if (!await confirm({ title: "Remover grupo de computadores", message: `O grupo ${group.description || index + 1} e suas instalações serão removidos ao salvar. O histórico de auditoria será preservado.`, confirmLabel: "Remover grupo", danger: true })) return;
    if (group.id) setRemovedGroupIds((ids) => [...ids, group.id!]);
    set("computerGroups", groups.filter((_, i) => i !== index));
  }
  async function removeSoftware(index: number, softwareId: number) {
    const group = groups[index];
    if (!await confirm({ title: "Remover software do grupo", message: "A instalação e os dados de licença deste software serão removidos do grupo ao salvar. O catálogo de softwares e o histórico serão preservados.", confirmLabel: "Remover software", danger: true })) return;
    if (group.id && persistedSoftware.current[group.id]?.includes(softwareId))
      setRemovedSoftwareIds((ids) => ({ ...ids, [group.id!]: [...new Set([...(ids[group.id!] ?? []), softwareId])] }));
    set("computerGroups", groups.map((g, i) => i === index ? { ...g, software: g.software.filter((s) => s.softwareId !== softwareId) } : g));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      const { computerGroups, resources, ...room } = form;
      delete (room as Partial<Room>).desks;
      const body = {
        ...room,
        computerGroups: [],
        inventory: {
          computerGroups: computerGroups.map(({ id, software, ...details }) => ({
            id: id ?? null,
            details: { ...details, operationalQuantity: details.operationalQuantity ?? null },
            software: software.map((s) => ({ ...s, licenseQuantity: s.licenseQuantity ?? null, licenseExpiresOn: s.licenseExpiresOn || null })),
            removedSoftwareIds: (id ? removedSoftwareIds[id] ?? [] : []).filter((id) => !software.some((s) => s.softwareId === id)),
          })),
          resources: resources.map(({ id, ...details }) => ({ id: id ?? null, details })),
          removedGroupIds,
        },
      };
      if (editing) await put(`/rooms/${editing}`, body);
      else await post("/rooms", body);
      await reload();
      setForm(null);
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function addSoftware(e: React.FormEvent) {
    e.preventDefault();
    setSoftwareBusy(true);
    setError("");
    setSoftwareSuccess("");
    try {
      await post("/software", { name: softwareName });
      setSoftwareName("");
      await reload();
      setSoftwareSuccess("Software adicionado ao catálogo.");
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setSoftwareBusy(false);
    }
  }
  const list = data.rooms.filter(
    (r) =>
      (!kind || r.kind === kind) &&
      (!status || (status === "active") === r.active) &&
      `${r.name} ${r.location} ${r.code ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const shiftLabel = (room: Room) => {
    if (!admin) return "Consulta restrita ao Admin";
    if (!semesterId) return "Selecione um semestre";
    const configured = offeredShifts[room.id];
    if (configured === undefined) return "Consultando configuração";
    if (configured === null) return "Não informado";
    if (!configured.length) return "Nenhum turno configurado";
    const names = configured.map((row) => data.shifts.find((shift) => shift.id === row.shiftId)?.name);
    return names.every(Boolean) ? names.join(", ") : "Não informado";
  };
  const occupiedShiftLabel = (room: Room) => {
    if (!admin) return "Consulta restrita ao Admin";
    if (!semesterId) return "Selecione um semestre";
    if (indicatorState === "loading") return "Consultando ocupações";
    if (indicatorState === "error" || !indicators) return "Não informado";
    const report = indicators.rooms.find((item) => item.roomId === room.id);
    if (!report) return "Não informado";
    const occupied = report.shifts.filter((shift) => shift.occupiedHours > 0);
    return occupied.length ? occupied.map((shift) => shift.shiftName).join(", ") : "Nenhuma ocupação por turno identificada";
  };
  const roomAction = (room: Room) => <div className="sg-row-actions">
    <button type="button" className="sg-icon-button" title="Ver detalhes" aria-label={`Ver detalhes de ${room.name}`} disabled={opening || detailLoading} onClick={() => void showDetail(room)}><Eye size={17} aria-hidden="true" /></button>
    {admin && <button type="button" className="sg-icon-button" title="Editar" aria-label={`Editar ambiente ${room.name}`} disabled={opening || detailLoading} onClick={() => void open(room)}><Pencil size={16} aria-hidden="true" /><span className="sr-only">Editar</span></button>}
    {admin && semesterId && <button type="button" className="sg-icon-button" title="Configurar turnos" aria-label={`Configurar turnos de ${room.name}`} onClick={() => setShiftRoom(room)}><Settings2 size={17} aria-hidden="true" /><span className="sr-only">Configurar turnos</span></button>}
  </div>;
  const roomInformation = (room: Room) => <button type="button" disabled={detailLoading || opening}
    aria-label={`Abrir informações de ${room.name}`} onClick={() => void showDetail(room)} className="sg-name-button">
    {room.name}
  </button>;
  const openRoomInformation = (event: React.MouseEvent, room: Room) => {
    if (!detailLoading && !opening && !(event.target as HTMLElement).closest("button, a, input, select")) void showDetail(room);
  };
  const bottleneckLabel = (room: Room) => {
    const indicator = admin && indicatorState === "idle" ? indicators?.rooms.find((item) => item.roomId === room.id) : undefined;
    return indicator && isBottleneck(indicator) ? <span className="sg-badge is-danger">{indicator.occupancyPercent}% · Gargalo</span> : null;
  };
  const roomStatus = (room: Room) => <span className={`sg-status ${room.active ? "is-active" : ""}`}>{room.active ? "Ativa" : "Inativa"}</span>;
  const filtered = !!(search || kind || status || semesterId);
  const activeRooms = data.rooms.filter((room) => room.active);
  const softwareList = data.software.filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(softwareSearch.toLocaleLowerCase("pt-BR")));
  const resources = detail?.inventory.resources ?? [];
  const resourceFilters: { id: ResourceFilter; label: string; items: RoomResource[] }[] = [
    { id: "todos", label: "Todos", items: resources },
    { id: "reduzida", label: "Disponibilidade reduzida", items: resources.filter(reduced) },
    { id: "desconhecida", label: "Sem quantidade operacional", items: resources.filter((item) => item.operationalQuantity == null) },
  ];
  const shownResources = resourceFilters.find((item) => item.id === resourceFilter)!.items;
  return (
    <>
      <SenaiScope>
        <PageHeading eyebrow={admin ? "Cadastros / Ambientes" : "Ambientes / Consulta"} title="Ambientes"
          subtitle="Salas, laboratórios e oficinas cadastrados, com inventário e turnos."
          action={admin ? <>
            {onImport && <><button type="button" className="btn-secondary" onClick={() => onImport("Ambientes")}>Importar ambientes</button>
              <button type="button" className="btn-secondary" onClick={() => onImport("Recursos")}>Importar recursos</button></>}
            <button type="button" className="btn-primary" disabled={opening} onClick={() => void open()}>
              <Plus size={17} aria-hidden="true" /> Novo ambiente
            </button>
          </> : undefined} />
        <section aria-label="Resumo dos ambientes" className={`sg-stats ${admin ? "sg-stats-4" : ""}`}>
          <StatCard label="Ambientes" value={data.rooms.length} detail="cadastrados" />
          <StatCard tone="green" label="Ativos" value={activeRooms.length} detail={`${data.rooms.length - activeRooms.length} inativo(s)`} />
          <StatCard label="Capacidade" value={activeRooms.reduce((total, room) => total + room.seats, 0)} detail="vagas em ambientes ativos" />
          {admin && <StatCard tone="amber" label="Catálogo" value={resourceCatalogError ? "—" : resourceCatalog.length} detail="tipos de recurso cadastrados" />}
        </section>
        {catalogLoading && <Busy />}
        {catalogError && <Notice message={catalogError} />}
        {resourceCatalogError && <Notice message={`Catálogo de recursos indisponível: ${resourceCatalogError}`} />}
        {(opening || detailLoading) && <p role="status" className="sg-note">Carregando inventário técnico...</p>}
        {indicatorState === "error" && <Notice type="info" message="Não foi possível consultar os turnos oferecidos neste semestre. Nenhuma disponibilidade foi presumida." />}
        {error && !form && <Notice message={error} onClose={() => setError("")} />}
        <section className="card sg-panel" aria-label="Lista de ambientes">
          <div className="sg-toolbar" role="search" aria-label="Filtros de ambientes">
            <div className="sg-search"><Field label="Buscar ambiente">
              <input type="search" className="field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, código ou localização" />
            </Field><Search size={16} aria-hidden="true" /></div>
            <Field label="Tipo de ambiente">
              <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Todos os tipos</option>
                <option value="Comum">Sala comum</option>
                <option value="Laboratorio">Laboratório</option>
                <option value="Hibrida">Híbrida</option>
                <option value="Oficina">Oficina</option>
              </select>
            </Field>
            <Field label="Situação"><select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option>
            </select></Field>
            {admin && <Field label="Semestre dos turnos"><select className="field" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
              <option value="">Selecione</option>{data.semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
            </select></Field>}
            <div className="sg-filters-end">
              {!catalogLoading && <span className="sg-count" role="status">{list.length} de {data.rooms.length} ambientes exibidos</span>}
              {filtered && <button type="button" className="btn-quiet" onClick={() => { setSearch(""); setKind(""); setStatus(""); setSemesterId(""); }}>Limpar filtros</button>}
              {admin && <button type="button" className="btn-secondary" onClick={() => {
                resourceCatalogRef.current?.scrollIntoView({ block: "start" }); resourceCatalogRef.current?.focus({ preventScroll: true });
              }}><SlidersHorizontal size={16} aria-hidden="true" /> Gerenciar catálogo de recursos</button>}
            </div>
          </div>
          {!catalogLoading && list.length === 0 ? <div className="sg-panel-body"><p className="sg-empty">
            <strong>{data.rooms.length ? "Nenhum ambiente encontrado" : "Nenhum ambiente cadastrado"}</strong><br />
            {data.rooms.length ? "Ajuste a busca ou os filtros para visualizar outros ambientes." : "Os ambientes cadastrados aparecerão aqui."}
          </p></div> : !catalogLoading && <>
            <div className="hidden overflow-x-auto lg:block"><table className="sg-table sg-rooms-table"><thead><tr>
              <th scope="col">Ambiente</th><th scope="col">Tipo e localização</th><th scope="col">Capacidade</th><th scope="col">Turnos configurados</th><th scope="col">Turnos com ocupação</th><th scope="col">Situação</th><th scope="col" className="sg-col-actions">Ações</th>
            </tr></thead><tbody>{list.map((room) => <tr key={room.id} onClick={(event) => openRoomInformation(event, room)} className="cursor-pointer">
              <td><span className="sg-code">{room.code || `#${room.id}`}</span><span className="block">{roomInformation(room)}</span>{bottleneckLabel(room)}</td>
              <td>{roomKind(room.kind)}<span className="sg-sub">{room.location || "Localização não informada"}</span></td>
              <td className="tabular-nums">{room.seats} alunos</td><td>{shiftLabel(room)}</td><td>{occupiedShiftLabel(room)}</td>
              <td>{roomStatus(room)}</td>
              <td>{roomAction(room)}</td>
            </tr>)}</tbody></table></div>
            <div className="sg-cards lg:hidden">{list.map((room) => <article key={room.id} onClick={(event) => openRoomInformation(event, room)}>
              <div className="sg-cards-top"><span className="sg-code">{room.code || `#${room.id}`}</span>{roomStatus(room)}</div>
              <h3>{roomInformation(room)}</h3>
              <p className="sg-note">{roomKind(room.kind)} · {room.location || "Localização não informada"}</p>
              {bottleneckLabel(room)}
              <dl><div><dt>Capacidade</dt><dd>{room.seats} alunos</dd></div><div><dt>Turnos configurados</dt><dd>{shiftLabel(room)}</dd></div><div className="sg-wide"><dt>Turnos com ocupação</dt><dd>{occupiedShiftLabel(room)}</dd></div></dl>
              {roomAction(room)}
            </article>)}</div>
          </>}
        </section>
        {admin && <div ref={resourceCatalogRef} tabIndex={-1} className="sg-anchor">
          <ResourceCatalogManager catalog={resourceCatalog} onChanged={refreshResourceCatalog} />
        </div>}
        {admin && <Panel title="Catálogo de softwares" subtitle="Softwares disponíveis para associar aos grupos de computadores.">
          {softwareSuccess && <div className="mb-3"><Notice type="success" message={softwareSuccess} onClose={() => setSoftwareSuccess("")} /></div>}
          <p className="sg-note mb-3" role="status">{data.software.length} software(s) cadastrado(s)</p>
          {data.software.length > 8 && <Field label="Buscar software"><input className="field" type="search" value={softwareSearch} onChange={(event) => setSoftwareSearch(event.target.value)} placeholder="Nome do software…" /></Field>}
          {data.software.length ? <ul className="sg-catalog">
            {softwareList.map((item) => <li key={item.id}>
              <AppWindow size={18} className="sg-catalog-icon" aria-hidden="true" />
              <div className="sg-item-text"><strong>{item.name}</strong></div>
              <span className="sg-status is-active">Cadastrado</span>
            </li>)}
          </ul> : <p className="sg-empty">Nenhum software cadastrado. Adicione um software para associá-lo aos computadores dos ambientes.</p>}
          {data.software.length > 0 && softwareSearch && softwareList.length === 0 && <p className="sg-note mt-3">Nenhum software encontrado para esta busca.</p>}
          <form className="mt-4 flex flex-wrap gap-2" onSubmit={addSoftware}>
            <input className="field max-w-sm" aria-label="Nome do software" required placeholder="Ex.: SolidWorks"
              value={softwareName} onChange={(e) => setSoftwareName(e.target.value)} />
            <button className="btn-secondary" disabled={softwareBusy}><Plus size={16} aria-hidden="true" />Adicionar</button>
          </form>
        </Panel>}
      </SenaiScope>
      <SenaiScope modals>
      {shiftRoom && semesterId && <Modal width="max-w-2xl" title={`Turnos oferecidos · ${shiftRoom.name}`} onClose={() => setShiftRoom(null)}>
        <OperatingShiftEditor key={`${semesterId}|${shiftRoom.id}`} semesterId={Number(semesterId)} roomId={String(shiftRoom.id)} onSaved={() => setIndicatorRefresh((value) => value + 1)} />
      </Modal>}
      {detail && <Modal width="max-w-4xl" title={`${detail.room.code || `#${detail.room.id}`} · ${detail.room.name}`} onClose={() => setDetail(null)}>
        <div className="sg-stack">
          <div className="sg-detail-head">
            <div className="sg-meta"><span className="sg-code">{detail.room.code || `#${detail.room.id}`}</span><span className="sg-note">{roomKind(detail.room.kind)}</span>{roomStatus(detail.room)}</div>
            {admin && <button type="button" className="btn-secondary" onClick={() => { const room = detail.room; setDetail(null); void open(room); }}><Pencil size={16} aria-hidden="true" />Editar</button>}
          </div>
          <p className="sg-note">Ficha técnica cadastrada. Os turnos oferecidos não comprovam disponibilidade para reserva.</p>
          <Tabs label="Seções do ambiente" idPrefix="room-detail" active={detailTab} onChange={(next) => setDetailTab(next as DetailTab)} items={[
            { id: "resumo", label: "Resumo" }, { id: "recursos", label: "Recursos", count: resources.length },
            { id: "computadores", label: "Computadores e softwares", count: detail.inventory.computerGroups.length },
          ]} />
          <div role="tabpanel" id={`room-detail-panel-${detailTab}`} aria-labelledby={`room-detail-tab-${detailTab}`} className="sg-stack">
            {detailTab === "resumo" && <>
              <div className="sg-stats sg-stats-4 sg-stats-compact">
                <StatCard label="Capacidade" value={detail.room.seats} detail="vagas para alunos" />
                <StatCard tone="green" label="Recursos" value={resources.length} detail="vinculados ao ambiente" />
                <StatCard tone="amber" label="Com restrição" value={resources.filter(reduced).length} detail="disponibilidade reduzida" />
                <StatCard label="Grupos" value={detail.inventory.computerGroups.length} detail="de computadores" />
              </div>
              <Panel title="Informações gerais">
                <dl className="sg-facts">
                  {[["Tipo", roomKind(detail.room.kind)], ["Localização", detail.room.location || "Não informada"], ["Capacidade", `${detail.room.seats} alunos`], ["Carteiras", String(detail.room.desks)], ["Situação", detail.room.active ? "Ativa" : "Inativa"], ["Finalidade", stated(detail.room.purpose)], ["Turnos configurados", shiftLabel(detail.room)], ["Turnos com ocupação", occupiedShiftLabel(detail.room)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>
              </Panel>
            </>}
            {detailTab === "recursos" && <Panel title="Equipamentos e recursos" subtitle="Quantidades cadastradas e operacionais neste ambiente.">
              {resources.length ? <>
                <div className="sg-pills" role="group" aria-label="Filtrar recursos por situação operacional">
                  {resourceFilters.map((item) => <button type="button" key={item.id} aria-pressed={resourceFilter === item.id} onClick={() => setResourceFilter(item.id)}>{item.label}<span>{item.items.length}</span></button>)}
                </div>
                {shownResources.length ? <ul>{shownResources.map((item, index) => <li key={item.id ?? index} className="sg-item flex-wrap">
                  <div className="sg-item-text">
                    <strong>{item.name} · {item.type}</strong>
                    <small>{item.quantity} cadastrados · {item.operationalQuantity == null ? "Operacionais não informados" : `${item.operationalQuantity} operacionais`}</small>
                    {item.description && <small>{item.description}</small>}
                    {item.technicalDetails && <small>{item.technicalDetails}</small>}
                    <small>{[item.condition && `Condição: ${item.condition}`, item.voltage && `Voltagem: ${item.voltage} V`, item.warrantyExpiresOn && `Garantia até ${item.warrantyExpiresOn}`, item.licenseExpiresOn && `Licença até ${item.licenseExpiresOn}`].filter(Boolean).join(" · ")}</small>
                  </div>
                  {reduced(item) && <span className="sg-badge is-danger">Disponibilidade reduzida</span>}
                </li>)}</ul> : <p className="sg-empty">Nenhum recurso nesta situação.</p>}
              </> : <p className="sg-empty">Nenhum equipamento cadastrado.</p>}
            </Panel>}
            {detailTab === "computadores" && (detail.inventory.computerGroups.length ? <>
              <p className="sg-note">Quantidades operacionais desconhecidas permanecem sem confirmação.</p>
              {detail.inventory.computerGroups.map((group, index) => <Panel key={group.id ?? index} title={group.description}
                subtitle={`${group.quantity} cadastrados · ${group.operationalQuantity == null ? "Operacionais não informados" : `${group.operationalQuantity} operacionais`}`}
                action={<HardDrive size={18} className="sg-catalog-icon" aria-hidden="true" />}>
                <dl className="sg-facts">
                  {[["Processador", stated(group.processor)], ["RAM", group.ramGb ? `${group.ramGb} GB` : "Não informada"],
                    ["Armazenamento", stated(group.storage)], ["Placa de vídeo", stated(group.graphicsCard)],
                    ["GPU dedicada", yesNoUnknown(group.dedicatedGpu)], ["Desempenho", stated(group.tier)],
                    ["Sistema operacional", stated(group.operatingSystem)], ["Virtualização", yesNoUnknown(group.virtualization)],
                    ["Docker / WSL", yesNoUnknown(group.dockerWsl)], ["Suporte a CAD", yesNoUnknown(group.cadCompatible)],
                    ["Suporte a simuladores", yesNoUnknown(group.simulatorCompatible)],
                    ["Internet no grupo", yesNoUnknown(group.internetAvailable)], ["Rede e restrições", stated(group.networkDetails)]].map(([label, value]) =>
                    <div key={label}><dt>{label}</dt><dd className="break-words">{value}</dd></div>)}
                </dl>
                <h3 className="mb-2 text-sm font-bold">Softwares e licenças</h3>
                {group.software.length ? <ul>{group.software.map((item) => <li key={item.softwareId} className="sg-item"><div className="sg-item-text">
                  <strong>{item.name}</strong><small>Versão: {stated(item.version)} · {item.installedQuantity} instalações · Licenças: {item.licenseQuantity ?? "Não informadas"} · Validade: {stated(item.licenseExpiresOn)}</small>
                </div></li>)}</ul> : <p className="sg-empty">Nenhum software informado.</p>}
              </Panel>)}
            </> : <p className="sg-empty">Nenhum grupo cadastrado.</p>)}
          </div>
        </div>
      </Modal>}
      {form && (
        <Modal
          width="max-w-3xl"
          title={editing ? "Editar ambiente" : "Cadastrar ambiente"}
          onClose={() => { if (!busy) setForm(null); }}
        >
          <form className="space-y-5" onSubmit={submit}>
            <fieldset disabled={busy} className="space-y-5">
            {error && <Notice message={error} />}
            <div><h3 className="text-sm font-bold">Dados gerais</h3><p className="sg-note">Código, capacidade e recursos físicos do ambiente.</p></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Código do ambiente">
                <input className="field" maxLength={30} value={form.code || ""}
                  onChange={(e) => set("code", e.target.value)} placeholder="Ex.: LAB-01" />
              </Field>
              <Field label="Tipo">
                <select
                  className="field"
                  value={form.kind}
                  onChange={(e) => set("kind", e.target.value)}
                >
                  <option value="Comum">Sala comum</option>
                  <option value="Laboratorio">Laboratório</option>
                  <option value="Hibrida">Híbrida</option>
                  <option value="Oficina">Oficina</option>
                </select>
              </Field>
              <Field label="Nome da sala" className="sm:col-span-2">
                <input
                  required
                  className="field"
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Laboratório 02"
                />
              </Field>
              <Field label="Capacidade de alunos">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  className="field"
                  value={form.seats}
                  onChange={(e) => set("seats", Number(e.target.value))}
                />
              </Field>
              <Field label="Localização">
                <input
                  className="field"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Bloco B / 2º andar"
                />
              </Field>
              <Field label="Finalidade / uso recomendado">
                <input
                  className="field"
                  value={form.purpose || ""}
                  onChange={(e) => set("purpose", e.target.value)}
                  placeholder="Ex.: Robótica, SolidWorks, programação"
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              <Checkbox label="Ambiente ativo" checked={form.active} onChange={(v) => set("active", v)} />
            </div>
            {editing && <details className="rounded-control border border-line p-3">
              <summary className="cursor-pointer font-semibold">Campos legados de compatibilidade</summary>
              <p className="muted mt-2">Mantidos para salas e importações anteriores. Recursos do catálogo com quantidade operacional informada passam a prevalecer.</p>
              <div className="flex flex-wrap gap-4 mt-3">
              <Checkbox
                label="Projetor"
                checked={form.hasProjector}
                onChange={(v) => set("hasProjector", v)}
              />
              <Checkbox
                label="PC do instrutor"
                checked={form.hasTeacherComputer}
                onChange={(v) => set("hasTeacherComputer", v)}
              />
              </div>
            </details>}
            <RoomInventoryFields groups={groups} resources={form.resources} software={data.software} catalog={resourceCatalog} onCatalogCreated={(item) => setResourceCatalog((items) => [...items.filter((row) => row.id !== item.id), item])}
              onGroups={(next) => set("computerGroups", next)} onResources={(next) => set("resources", next)}
              onRemoveGroup={(index) => void removeGroup(index)} onRemoveSoftware={(index, id) => void removeSoftware(index, id)} />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setForm(null)}
              >
                Cancelar
              </button>
              <SubmitButton busy={busy}>
                {editing ? "Salvar alterações" : "Cadastrar sala"}
              </SubmitButton>
            </div>
            </fieldset>
          </form>
        </Modal>
      )}
      </SenaiScope>
    </>
  );
}
