import { useEffect, useRef, useState } from "react";
import {
  DoorOpen,
  HardDrive,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import type { Room, RoomInventory, RoomResource, User } from "../types";
import { useData } from "../lib/data";
import { post, put, read } from "../lib/api";
import { RoomInventoryFields } from "../components/RoomInventoryFields";
import { OperatingShiftEditor } from "../components/OperatingShiftEditor";
import { indicatorPath, isSemesterIndicators, type SemesterIndicators } from "../lib/occupancyIndicators";
import { resultMessage, roomKind } from "../lib/utils";
import {
  Busy,
  Card,
  Checkbox,
  Empty,
  Field,
  FilterBar,
  MetricCard,
  Modal,
  Notice,
  SectionHeading,
  SubmitButton,
  Title,
  useConfirmation,
} from "../components/UI";

type RoomInput = Omit<Room, "id"> & { resources: RoomResource[] };
type OfferedShift = { shiftId: number; weekdaysMask: number };
const stated = (value: string | null | undefined) => value?.trim() || "Não informado";
const yesNoUnknown = (value: boolean | null | undefined) => value == null ? "Não informado" : value ? "Sim" : "Não";
const emptyRoom: RoomInput = {
  code: "",
  name: "",
  location: "",
  purpose: "",
  kind: "Comum",
  seats: 30,
  desks: 30,
  hasProjector: true,
  hasTeacherComputer: true,
  hasInternet: true,
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
    try {
      await post("/software", { name: softwareName });
      setSoftwareName("");
      await reload();
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
  const roomAction = (room: Room) => <div className="flex flex-wrap gap-2">
    <button type="button" className="btn-secondary" disabled={detailLoading || opening} onClick={() => void showDetail(room)}>Ver ficha e inventário</button>
    {admin && <button type="button" className="btn-secondary" disabled={opening || detailLoading} onClick={() => void open(room)}><Settings2 size={15} /> Editar ambiente</button>}
    {admin && semesterId && <button type="button" className="btn-secondary" onClick={() => setShiftRoom(room)}>Configurar turnos</button>}
  </div>;
  return (
    <>
      <Title
        title="Ambientes"
        subtitle="Consulte as fichas técnicas e gerencie salas, laboratórios e oficinas."
        action={admin ? <>
            {onImport && <><button type="button" className="btn-secondary" onClick={() => onImport("Ambientes")}>Importar ambientes</button>
              <button type="button" className="btn-secondary" onClick={() => onImport("Recursos")}>Importar recursos</button></>}
            <button className="btn-primary" disabled={opening} onClick={() => void open()}>
              <Plus size={17} /> Novo ambiente
            </button>
          </> : undefined}
      />
      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <MetricCard label="Ambientes cadastrados" value={data.rooms.length} detail="Todos os tipos retornados pela API" icon={DoorOpen} />
        <MetricCard label="Ativos" value={data.rooms.filter((room) => room.active).length} detail="Situação cadastral" tone="emerald" />
        <MetricCard label="Inativos" value={data.rooms.filter((room) => !room.active).length} detail="Situação cadastral" tone="slate" />
      </div>
      <div className="mb-5">
        <FilterBar>
          <label className="relative sm:col-span-2 xl:col-span-3">
            <span className="field-label">Buscar ambiente</span>
            <Search
              size={17}
              className="absolute left-3 bottom-3 text-slate-400"
            />
            <input
              aria-label="Buscar ambiente"
              className="field !pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, código ou localização"
            />
          </label>
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
        </FilterBar>
      </div>
      {catalogLoading && <Busy />}
      {catalogError && <Notice message={catalogError} />}
      {(opening || detailLoading) && <p role="status">Carregando inventário técnico...</p>}
      {indicatorState === "error" && <Notice type="info" message="Não foi possível consultar os turnos oferecidos neste semestre. Nenhuma disponibilidade foi presumida." />}
      {!catalogLoading && list.length === 0 ? (
        <Card>
          <Empty
            title={data.rooms.length ? "Nenhum ambiente encontrado" : "Nenhum ambiente cadastrado"}
            text={data.rooms.length ? "Ajuste a busca ou os filtros para visualizar outros ambientes." : "Os ambientes cadastrados aparecerão aqui."}
          />
        </Card>
      ) : !catalogLoading && (
        <Card className="p-4 sm:p-5 space-y-4">
          <SectionHeading title="Ambientes" subtitle={`${list.length} de ${data.rooms.length} ambientes exibidos. Configuração de turnos e ocupação são informações distintas; nenhuma delas comprova disponibilidade em um horário.`} />
          <div className="hidden lg:block table-wrap"><table className="w-full text-sm"><thead><tr className="text-left text-muted-ink border-b border-line">
            <th scope="col" className="p-3">Ambiente</th><th scope="col" className="p-3">Tipo e localização</th><th scope="col" className="p-3">Alunos</th><th scope="col" className="p-3">Turnos configurados</th><th scope="col" className="p-3">Turnos com ocupação</th><th scope="col" className="p-3">Situação</th><th scope="col" className="p-3">Ações</th>
          </tr></thead><tbody>{list.map((room) => <tr key={room.id} className="border-b border-line last:border-0 align-top">
            <td className="p-3"><strong className="text-ink">{room.code || `#${room.id}`}</strong><span className="block text-muted-ink">{room.name}</span></td>
            <td className="p-3">{roomKind(room.kind)}<span className="block text-muted-ink">{room.location || "Localização não informada"}</span></td>
            <td className="p-3 tabular-nums">{room.seats}</td><td className="p-3 text-muted-ink">{shiftLabel(room)}</td><td className="p-3 text-muted-ink">{occupiedShiftLabel(room)}</td>
            <td className="p-3"><span className={`pill ${room.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{room.active ? "Ativa" : "Inativa"}</span></td>
            <td className="p-3">{roomAction(room)}</td>
          </tr>)}</tbody></table></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">{list.map((room) => <article key={room.id} className="rounded-panel border border-line p-4 space-y-3">
            <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">{room.code || `#${room.id}`}</p><h3 className="font-bold text-ink">{room.name}</h3></div><span className={`pill ${room.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{room.active ? "Ativa" : "Inativa"}</span></div>
            <p className="muted">{roomKind(room.kind)} · {room.location || "Localização não informada"}</p>
            <dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-muted-ink">Capacidade</dt><dd>{room.seats} alunos</dd></div><div><dt className="text-muted-ink">Turnos configurados</dt><dd>{shiftLabel(room)}</dd></div><div className="col-span-2"><dt className="text-muted-ink">Turnos com ocupação</dt><dd>{occupiedShiftLabel(room)}</dd></div></dl>
            {roomAction(room)}
          </article>)}</div>
        </Card>
      )}
      {admin && (
        <Card className="p-5 mt-6">
          <SectionHeading title="Catálogo de softwares" subtitle="Softwares disponíveis para associar aos grupos de computadores." />
          <div className="flex flex-wrap gap-2 mb-4">
            {data.software.length ? (
              data.software.map((s) => (
                <span key={s.id} className="pill bg-slate-100 text-slate-600">
                  {s.name}
                </span>
              ))
            ) : (
              <p className="muted">Nenhum software cadastrado.</p>
            )}
          </div>
          <form className="flex flex-wrap gap-2 mt-4" onSubmit={addSoftware}>
            <input
              className="field max-w-sm"
              aria-label="Nome do software"
              required
              placeholder="Ex.: SolidWorks"
              value={softwareName}
              onChange={(e) => setSoftwareName(e.target.value)}
            />
            <button className="btn-secondary" disabled={softwareBusy}>
              <Plus size={16} />
              Adicionar
            </button>
          </form>
        </Card>
      )}
      {error && !form && (
        <div className="mt-4">
          <Notice message={error} onClose={() => setError("")} />
        </div>
      )}
      {shiftRoom && semesterId && <Modal width="max-w-2xl" title={`Turnos oferecidos · ${shiftRoom.name}`} onClose={() => setShiftRoom(null)}>
        <OperatingShiftEditor key={`${semesterId}|${shiftRoom.id}`} semesterId={Number(semesterId)} roomId={String(shiftRoom.id)} onSaved={() => setIndicatorRefresh((value) => value + 1)} />
      </Modal>}
      {detail && <Modal width="max-w-3xl" title={`${detail.room.code || `#${detail.room.id}`} · ${detail.room.name}`} onClose={() => setDetail(null)}>
        <div className="space-y-5">
          <p className="muted">Ficha técnica cadastrada. Os turnos oferecidos não comprovam disponibilidade para reserva.</p>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            {[["Tipo", roomKind(detail.room.kind)], ["Localização", detail.room.location || "Não informada"], ["Capacidade", `${detail.room.seats} alunos`], ["Carteiras", String(detail.room.desks)], ["Situação", detail.room.active ? "Ativa" : "Inativa"], ["Turnos configurados", shiftLabel(detail.room)], ["Turnos com ocupação", occupiedShiftLabel(detail.room)]].map(([label, value]) => <div key={label} className="rounded-control border border-line p-3"><dt className="text-muted-ink">{label}</dt><dd className="mt-1 font-semibold text-ink">{value}</dd></div>)}
          </dl>
          <div className="space-y-3"><SectionHeading title="Grupos de computadores" subtitle="Quantidades operacionais desconhecidas permanecem sem confirmação." />
            {detail.inventory.computerGroups.length ? detail.inventory.computerGroups.map((group, index) => <div key={group.id ?? index} className="rounded-control border border-line p-4 text-sm space-y-2">
              <h3 className="font-semibold text-ink"><HardDrive size={16} className="inline mr-2" />{group.description}</h3>
              <p>{group.quantity} cadastrados · {group.operationalQuantity == null ? "Operacionais não informados" : `${group.operationalQuantity} operacionais`}</p>
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {[["Processador", stated(group.processor)], ["RAM", group.ramGb ? `${group.ramGb} GB` : "Não informada"],
                  ["Armazenamento", stated(group.storage)], ["Placa de vídeo", stated(group.graphicsCard)],
                  ["GPU dedicada", yesNoUnknown(group.dedicatedGpu)], ["Desempenho", stated(group.tier)],
                  ["Sistema operacional", stated(group.operatingSystem)], ["Virtualização", yesNoUnknown(group.virtualization)],
                  ["Docker / WSL", yesNoUnknown(group.dockerWsl)], ["Suporte a CAD", yesNoUnknown(group.cadCompatible)],
                  ["Suporte a simuladores", yesNoUnknown(group.simulatorCompatible)],
                  ["Internet no grupo", yesNoUnknown(group.internetAvailable)], ["Rede e restrições", stated(group.networkDetails)]].map(([label, value]) =>
                  <div key={label}><dt className="text-muted-ink">{label}</dt><dd className="text-ink break-words">{value}</dd></div>)}
              </dl>
              <div className="border-t border-line pt-3"><h4 className="font-semibold text-ink mb-2">Softwares e licenças</h4>
                {group.software.length ? <ul className="space-y-2">{group.software.map((item) => <li key={item.softwareId}>
                  <strong>{item.name}</strong> · Versão: {stated(item.version)} · {item.installedQuantity} instalações · Licenças: {item.licenseQuantity ?? "Não informadas"} · Validade: {stated(item.licenseExpiresOn)}
                </li>)}</ul> : <p className="muted">Nenhum software informado.</p>}
              </div>
            </div>) : <p className="muted">Nenhum grupo cadastrado.</p>}
          </div>
          <div className="space-y-3"><SectionHeading title="Equipamentos e recursos" />
            {detail.inventory.resources.length ? detail.inventory.resources.map((item, index) => <div key={item.id ?? index} className="rounded-control border border-line p-4 text-sm">
              <h3 className="font-semibold text-ink">{item.name} · {item.type}</h3><p>{item.quantity} cadastrados · {item.operationalQuantity == null ? "Operacionais não informados" : `${item.operationalQuantity} operacionais`}</p>
              {item.description && <p className="muted">{item.description}</p>}
              {item.technicalDetails && <p className="muted">{item.technicalDetails}</p>}
              <p className="muted">{[item.condition && `Condição: ${item.condition}`, item.voltage && `Voltagem: ${item.voltage} V`, item.warrantyExpiresOn && `Garantia até ${item.warrantyExpiresOn}`, item.licenseExpiresOn && `Licença até ${item.licenseExpiresOn}`].filter(Boolean).join(" · ")}</p>
            </div>) : <p className="muted">Nenhum equipamento cadastrado.</p>}
          </div>
          {admin && <button type="button" className="btn-secondary" onClick={() => { const room = detail.room; setDetail(null); void open(room); }}>Editar ambiente</button>}
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
            <SectionHeading title="Dados gerais" subtitle="Código, capacidade e recursos físicos do ambiente." />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Código do ambiente">
                <input className="field" maxLength={30} value={form.code || ""}
                  onChange={(e) => set("code", e.target.value)} placeholder="Ex.: LAB-01" />
              </Field>
              <Field label="Nome da sala">
                <input
                  required
                  className="field"
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Laboratório 02"
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
              <div className="grid grid-cols-2 gap-2">
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
                <Field label="Carteiras">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    className="field"
                    value={form.desks}
                    onChange={(e) => set("desks", Number(e.target.value))}
                  />
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <Checkbox
                label="Projetor"
                checked={form.hasProjector}
                onChange={(v) => set("hasProjector", v)}
              />
              <Checkbox
                label="PC do professor"
                checked={form.hasTeacherComputer}
                onChange={(v) => set("hasTeacherComputer", v)}
              />
              <Checkbox
                label="Internet"
                checked={form.hasInternet}
                onChange={(v) => set("hasInternet", v)}
              />
              <Checkbox
                label="Sala ativa"
                checked={form.active}
                onChange={(v) => set("active", v)}
              />
            </div>
            <RoomInventoryFields groups={groups} resources={form.resources} software={data.software}
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
    </>
  );
}
