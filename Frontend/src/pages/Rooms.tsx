import { useState } from "react";
import {
  Cpu,
  DoorOpen,
  MapPin,
  Monitor,
  Plus,
  Projector,
  Search,
  Settings2,
  Wifi,
  X,
} from "lucide-react";
import type { ComputerGroup, Room, User } from "../types";
import { useData } from "../lib/data";
import { post, put } from "../lib/api";
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
} from "../components/UI";

type RoomInput = Omit<Room, "id">;
const emptyRoom: RoomInput = {
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
};
const emptyGroup: ComputerGroup = {
  description: "Computadores dos alunos",
  quantity: 25,
  ramGb: 8,
  tier: "Basico",
  dedicatedGpu: false,
  software: [],
};

export function Rooms({ user }: { user: User }) {
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
  function changeGroup(i: number, patch: Partial<ComputerGroup>) {
    set(
      "computerGroups",
      groups.map((g, index) => (index === i ? { ...g, ...patch } : g)),
    );
  }
  function open(room?: Room) {
    setEditing(room?.id ?? null);
    setForm(
      room
        ? {
            name: room.name,
            location: room.location,
            purpose: room.purpose || "",
            kind: room.kind,
            seats: room.seats,
            desks: room.desks,
            hasProjector: room.hasProjector,
            hasTeacherComputer: room.hasTeacherComputer,
            hasInternet: room.hasInternet,
            active: room.active,
            computerGroups: room.computerGroups.map((g) => ({
              ...g,
              software: g.software.map((s) => ({ ...s })),
            })),
          }
        : { ...emptyRoom, computerGroups: [] },
    );
    setError("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        ...form,
        computerGroups: form.computerGroups.map((g) => ({
          ...g,
          software: g.software.map((s) => ({
            softwareId: s.softwareId,
            installedQuantity: s.installedQuantity,
          })),
        })),
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
      `${r.name} ${r.location}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Title
        title="Ambientes"
        subtitle="Gerencie salas comuns, laboratórios e equipamentos."
        action={
          admin ? (
            <button className="btn-primary" onClick={() => open()}>
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
          </select>
        </div>
      </Card>
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
                    <span className="block text-xs text-slate-500">
                      Lugares
                    </span>
                    <b className="text-xl text-slate-800">{r.seats}</b>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <span className="block text-xs text-slate-500">
                      Computadores
                    </span>
                    <b className="text-xl text-slate-800">{pcs}</b>
                  </div>
                </div>
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
                    onClick={() => open(r)}
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
          onClose={() => setForm(null)}
        >
          <form className="space-y-5" onSubmit={submit}>
            {error && <Notice message={error} />}
            <div className="grid sm:grid-cols-2 gap-3">
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
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Lugares">
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
            <div className="border-t pt-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-semibold text-sm">
                  Grupos de computadores
                </h3>
                <button
                  type="button"
                  className="btn-secondary !py-1.5"
                  onClick={() =>
                    set("computerGroups", [
                      ...groups,
                      { ...emptyGroup, software: [] },
                    ])
                  }
                >
                  <Plus size={15} />
                  Adicionar grupo
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Uma sala pode ter grupos de máquinas diferentes. Softwares são
                vinculados a cada grupo.
              </p>
              <div className="space-y-3">
                {groups.map((g, i) => (
                  <div
                    className="p-4 bg-slate-50 border border-slate-100 rounded-xl"
                    key={i}
                  >
                    <div className="flex justify-between mb-3">
                      <span className="font-semibold text-sm flex items-center gap-2">
                        <Cpu size={16} />
                        Grupo {i + 1}
                      </span>
                      <button
                        title="Excluir grupo"
                        type="button"
                        onClick={() =>
                          set(
                            "computerGroups",
                            groups.filter((_, j) => i !== j),
                          )
                        }
                        className="text-slate-500 hover:text-red-600"
                      >
                        <X size={17} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Field label="Descrição">
                        <input
                          className="field"
                          value={g.description}
                          onChange={(e) =>
                            changeGroup(i, { description: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Quantidade">
                        <input
                          className="field"
                          min="1"
                          max="1000"
                          type="number"
                          value={g.quantity}
                          onChange={(e) =>
                            changeGroup(i, {
                              quantity: Number(e.target.value),
                              software: g.software.map((s) => ({
                                ...s,
                                installedQuantity: Math.min(
                                  s.installedQuantity,
                                  Number(e.target.value),
                                ),
                              })),
                            })
                          }
                        />
                      </Field>
                      <Field label="RAM (GB)">
                        <input
                          className="field"
                          min="1"
                          type="number"
                          value={g.ramGb}
                          onChange={(e) =>
                            changeGroup(i, { ramGb: Number(e.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Desempenho">
                        <select
                          className="field"
                          value={g.tier}
                          onChange={(e) =>
                            changeGroup(i, { tier: e.target.value })
                          }
                        >
                          <option value="Basico">Básico</option>
                          <option value="Intermediario">Intermediário</option>
                          <option value="Alto">Alto</option>
                        </select>
                      </Field>
                    </div>
                    <div className="mt-3">
                      <Checkbox
                        label="Possui GPU dedicada"
                        checked={g.dedicatedGpu}
                        onChange={(v) => changeGroup(i, { dedicatedGpu: v })}
                      />
                    </div>
                    {data.software.length > 0 && (
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <span className="field-label">
                          Softwares instalados e quantidade de
                          licenças/instalações
                        </span>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {data.software.map((s) => {
                            const found = g.software.find(
                              (x) => x.softwareId === s.id,
                            );
                            return (
                              <div
                                className="flex gap-3 items-center"
                                key={s.id}
                              >
                                <Checkbox
                                  label={s.name}
                                  checked={!!found}
                                  onChange={(yes) =>
                                    changeGroup(i, {
                                      software: yes
                                        ? [
                                            ...g.software,
                                            {
                                              softwareId: s.id,
                                              name: s.name,
                                              installedQuantity: g.quantity,
                                            },
                                          ]
                                        : g.software.filter(
                                            (x) => x.softwareId !== s.id,
                                          ),
                                    })
                                  }
                                />
                                {found && (
                                  <input
                                    aria-label={`Instalações de ${s.name}`}
                                    className="field !w-20 !py-1"
                                    type="number"
                                    min="1"
                                    max={g.quantity}
                                    value={found.installedQuantity}
                                    onChange={(e) =>
                                      changeGroup(i, {
                                        software: g.software.map((x) =>
                                          x.softwareId === s.id
                                            ? {
                                                ...x,
                                                installedQuantity: Number(
                                                  e.target.value,
                                                ),
                                              }
                                            : x,
                                        ),
                                      })
                                    }
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
          </form>
        </Modal>
      )}
    </>
  );
}
