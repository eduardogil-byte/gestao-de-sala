import { useEffect, useState } from "react";
import { Check, Clock3, UserPlus } from "lucide-react";
import { useData } from "../lib/data";
import { read, put, register } from "../lib/api";
import { dayNames, hour, resultMessage } from "../lib/utils";
import {
  Card,
  Empty,
  Field,
  Notice,
  SubmitButton,
  Title,
} from "../components/UI";
import type { Availability, User } from "../types";

export function Teachers({ user }: { user: User }) {
  const admin = user.roles.includes("Admin");
  const { data, reload } = useData();
  const [teacherId, setTeacherId] = useState(user.id);
  const [available, setAvailable] = useState<Availability[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (teacherId)
      read<Availability[]>(`/teachers/${teacherId}/availability`)
        .then(setAvailable)
        .catch((e) => setError(resultMessage(e)));
  }, [teacherId]);
  async function save() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await put(`/teachers/${teacherId}/availability`, available);
      setSuccess("Disponibilidade atualizada.");
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await register(name, email, password);
      await reload();
      setName("");
      setEmail("");
      setPassword("");
      setSuccess("Professor cadastrado.");
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function toggle(weekday: number, shiftId: number) {
    const found = available.some(
      (a) => a.weekday === weekday && a.shiftId === shiftId,
    );
    setAvailable(
      found
        ? available.filter(
            (a) => a.weekday !== weekday || a.shiftId !== shiftId,
          )
        : [...available, { weekday, shiftId }],
    );
  }
  return (
    <>
      <Title
        title="Professores e disponibilidade"
        subtitle="Indique os turnos em que cada professor pode ministrar aulas."
      />
      {error && (
        <div className="mb-4">
          <Notice message={error} onClose={() => setError("")} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <Notice
            type="success"
            message={success}
            onClose={() => setSuccess("")}
          />
        </div>
      )}
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-5">
        <Card className="p-5">
          <div className="flex gap-2 items-center mb-5">
            <Clock3 className="text-skybrand-700" size={19} />
            <h3 className="section-title">Disponibilidade por turno</h3>
          </div>
          {admin ? (
            <Field label="Selecione o professor">
              <select
                className="field mb-4"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
              >
                <option value={user.id}>Sua conta (administrador)</option>
                {data.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="muted mb-4">Disponibilidade de {user.displayName}</p>
          )}
          {data.shifts.length === 0 ? (
            <Empty title="Nenhum turno cadastrado" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-head px-3 py-3">Dia</th>
                    {data.shifts.map((s) => (
                      <th
                        className="table-head px-3 py-3 text-center"
                        key={s.id}
                      >
                        <div>{s.name}</div>
                        <span className="normal-case font-normal tracking-normal">
                          {hour(s.startsAt)}–{hour(s.endsAt)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayNames.map((day, i) => (
                    <tr key={day} className="border-b border-slate-100">
                      <td className="px-3 py-3 text-slate-700 font-medium">
                        {day}
                      </td>
                      {data.shifts.map((s) => {
                        const active = available.some(
                          (a) => a.weekday === i + 1 && a.shiftId === s.id,
                        );
                        return (
                          <td key={s.id} className="text-center">
                            <button
                              title={`${day} · ${s.name}`}
                              onClick={() => toggle(i + 1, s.id)}
                              className={`h-9 w-12 mx-auto rounded-lg flex items-center justify-center border ${active ? "bg-skybrand-600 text-white border-skybrand-600" : "bg-white border-slate-200 text-slate-300 hover:bg-sky-50"}`}
                            >
                              {active ? (
                                <Check size={18} />
                              ) : (
                                <span className="text-sm">+</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-4 mb-3">
            Marque os dias e turnos disponíveis. O gerador não alocará aulas
            fora dessas opções.
          </p>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="btn-primary"
          >
            {busy ? "Salvando..." : "Salvar disponibilidade"}
          </button>
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="section-title mb-4">Professores cadastrados</h3>
            {data.teachers.length === 0 ? (
              <Empty text="Ainda não existem professores." />
            ) : (
              data.teachers.map((t) => (
                <div
                  className="flex gap-3 items-center border-b border-slate-100 py-3 first:pt-0 last:border-0"
                  key={t.id}
                >
                  <div className="w-9 h-9 bg-sky-100 text-skybrand-700 rounded-full font-bold flex items-center justify-center">
                    {t.displayName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {t.displayName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{t.email}</p>
                  </div>
                </div>
              ))
            )}
          </Card>
          {admin && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus size={19} className="text-skybrand-700" />
                <h3 className="section-title">Cadastrar professor</h3>
              </div>
              <form onSubmit={create} className="space-y-3">
                <Field label="Nome">
                  <input
                    className="field"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="E-mail">
                  <input
                    type="email"
                    className="field"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Senha inicial">
                  <input
                    type="password"
                    minLength={8}
                    required
                    className="field"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <SubmitButton busy={busy}>Criar professor</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
