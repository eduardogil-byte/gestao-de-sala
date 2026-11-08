import { useRef, useState } from "react";
import {
  DoorOpen,
  MapPin,
  Monitor,
  Plus,
  Projector,
  Search,
  Settings2,
  Wifi,
} from "lucide-react";
import type { Room, RoomInventory, RoomResource, User } from "../types";
import { useData } from "../lib/data";
import { post, put, read } from "../lib/api";
import { RoomInventoryFields } from "../components/RoomInventoryFields";
import { resultMessage, roomKind } from "../lib/utils";
import {
  Card,
  Checkbox,
  Empty,
  Field,
  Modal,
  Notice,
  SubmitButton,
  Title,
  useConfirmation,
} from "../components/UI";

type RoomInput = Omit<Room, "id"> & { resources: RoomResource[] };
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
export function Rooms({ user }: { user: User }) {
  const confirm = useConfirmation();
  const openingRequest = useRef(0);
  const persistedSoftware = useRef<Record<number, number[]>>({});
  const [opening, setOpening] = useState(false);
  const [removedGroupIds, setRemovedGroupIds] = useState<number[]>([]);
  const [removedSoftwareIds, setRemovedSoftwareIds] = useState<Record<number, number[]>>({});
  const admin = user.roles.includes("Admin");
  const { data, reload } = useData();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<RoomInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [softwareName, setSoftwareName] = useState("");
  const [softwareBusy, setSoftwareBusy] = useState(false);
  const set = <K extends keyof RoomInput>(k: K, v: RoomInput[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  const groups = form?.computerGroups || [];
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
      `${r.name} ${r.location} ${r.code ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Title
        title="Ambientes"
        subtitle="Gerencie salas comuns, laboratórios e equipamentos."
        action={
          admin ? (
            <button className="btn-primary" disabled={opening} onClick={() => void open()}>
              <Plus size={17} /> Nova sala
            </button>
          ) : undefined
        }
      />
      <Card className="p-4 mb-5">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[220px] relative">
            <Search
              size={17}
              className="absolute left-3 top-3 text-slate-400"
            />
            <input
              aria-label="Buscar sala"
              className="field !pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome ou localização..."
            />
          </div>
          <select
            aria-label="Tipo de sala"
            className="field !w-auto"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            <option value="Comum">Sala comum</option>
            <option value="Laboratorio">Laboratório</option>
            <option value="Hibrida">Híbrida</option>
            <option value="Oficina">Oficina</option>
          </select>
        </div>
      </Card>
      {opening && <p role="status">Carregando inventário técnico...</p>}
      {list.length === 0 ? (
        <Card>
          <Empty
            title="Nenhuma sala cadastrada"
            text={
              admin
                ? "Cadastre a primeira sala para começar a montar a grade."
                : "Aguarde o administrador cadastrar as salas."
            }
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((r) => {
            const pcs = r.computerGroups.reduce((a, g) => a + g.quantity, 0);
            return (
              <Card
                key={r.id}
                className="p-5 hover:border-skybrand-200 transition"
              >
                <div className="flex justify-between gap-2 items-start">
                  <div className="w-11 h-11 bg-skybrand-50 rounded-xl flex items-center justify-center text-skybrand-700">
                    <DoorOpen size={21} />
                  </div>
                  <span
                    className={`pill ${r.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {r.active ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mt-4">
                  {r.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1">ID {r.id}{r.code ? ` · Código ${r.code}` : " · Código não informado"}</p>
                <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                  <MapPin size={13} />
                  {r.location || "Localização não informada"} •{" "}
                  {roomKind(r.kind)}
                </div>
                {r.purpose && (
                  <p className="text-xs text-slate-500 mt-2">
                    Uso: {r.purpose}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 mt-5">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <span className="block text-xs text-slate-500">Capacidade de alunos</span>
                    <b className="text-xl text-slate-800">{r.seats}</b>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <span className="block text-xs text-slate-500">
                      Computadores cadastrados
                    </span>
                    <b className="text-xl text-slate-800">{pcs}</b>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Operacionais informados: {r.computerGroups.reduce((sum, g) => sum + (g.operationalQuantity ?? 0), 0)}.
                  {r.computerGroups.some((g) => g.operationalQuantity == null) && " Há grupos com quantidade operacional desconhecida."}
                  {` Carteiras: ${r.desks}.`}
                </p>
                <div className="flex flex-wrap gap-2 mt-4 text-[11px] text-slate-500">
                  {r.hasProjector && (
                    <span className="inline-flex gap-1 items-center">
                      <Projector size={13} />
                      Projetor
                    </span>
                  )}
                  {r.hasTeacherComputer && (
                    <span className="inline-flex gap-1 items-center">
                      <Monitor size={13} />
                      PC docente
                    </span>
                  )}
                  {r.hasInternet && (
                    <span className="inline-flex gap-1 items-center">
                      <Wifi size={13} />
                      Internet
                    </span>
                  )}
                </div>
                {admin && (
                  <button
                    disabled={opening} onClick={() => void open(r)}
                    className="btn-secondary w-full mt-5"
                  >
                    <Settings2 size={15} />
                    Editar ambiente
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {admin && (
        <Card className="p-5 mt-6">
          <h3 className="section-title mb-3">Catálogo de softwares</h3>
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
          <form className="flex gap-2" onSubmit={addSoftware}>
            <input
              className="field max-w-sm"
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
      {form && (
        <Modal
          width="max-w-3xl"
          title={editing ? "Editar sala" : "Cadastrar sala"}
          onClose={() => { if (!busy) setForm(null); }}
        >
          <form className="space-y-5" onSubmit={submit}>
            <fieldset disabled={busy} className="space-y-5">
            {error && <Notice message={error} />}
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
