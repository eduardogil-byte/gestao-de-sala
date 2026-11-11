import { useEffect, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { useData } from "../lib/data";
import { read, put, register } from "../lib/api";
import { dayNames, hour, resultMessage } from "../lib/utils";
import { TeacherProfile } from "../components/TeacherProfile";
import { Busy, Card, Empty, Field, MetricCard, Notice, SearchableSelect, SectionHeading, SubmitButton, Title } from "../components/UI";
import type { Availability, User } from "../types";

export function Teachers({ user, onImport }: { user: User; onImport?: () => void }) {
  const admin = user.roles.includes("Admin");
  const { data, reload, loading } = useData();
  const [teacherId, setTeacherId] = useState(admin ? "" : user.id);
  const [query, setQuery] = useState("");
  const [available, setAvailable] = useState<Availability[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (admin && !teacherId && data.teachers.length) setTeacherId(data.teachers[0].id);
  }, [admin, teacherId, data.teachers]);
  useEffect(() => {
    let current = true;
    setAvailable([]);
    setError("");
    if (!teacherId) { setAvailabilityLoading(false); return () => { current = false; }; }
    setAvailabilityLoading(true);
    read<Availability[]>(`/teachers/${encodeURIComponent(teacherId)}/availability`)
      .then((rows) => { if (current) setAvailable(rows); })
      .catch((cause) => { if (current) setError(resultMessage(cause)); })
      .finally(() => { if (current) setAvailabilityLoading(false); });
    return () => { current = false; };
  }, [teacherId]);
  async function saveAvailability() {
    if (!teacherId || busy || availabilityLoading) return;
    setBusy(true); setError(""); setSuccess("");
    try { await put(`/teachers/${encodeURIComponent(teacherId)}/availability`, available); setSuccess("Disponibilidade atualizada."); }
    catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!admin || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await register(name, email, password);
      await reload();
      setName(""); setEmail(""); setPassword("");
      setSuccess("Professor cadastrado.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  function toggle(weekday: number, shiftId: number) {
    const found = available.some((item) => item.weekday === weekday && item.shiftId === shiftId);
    setAvailable(found ? available.filter((item) => item.weekday !== weekday || item.shiftId !== shiftId)
      : [...available, { weekday, shiftId }]);
  }
  const shown = data.teachers.filter((item) => (admin || item.id === user.id) && `${item.displayName} ${admin ? item.email ?? "" : ""}`
    .toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));
  const selected = data.teachers.find((item) => item.id === teacherId);
  return <div className="space-y-5">
    <Title title="Docentes" subtitle="Consulte perfis pedagógicos, habilitações e disponibilidade por turno. Cadastros e alterações de perfil são restritos ao Admin."
      action={admin && onImport ? <button type="button" className="btn-secondary" onClick={onImport}>Importar docentes</button> : undefined} />
    {error && <Notice message={error} onClose={() => setError("")} />}
    {success && <Notice type="success" message={success} onClose={() => setSuccess("")} />}
    {admin && <div className="grid gap-3 sm:grid-cols-2"><MetricCard label="Docentes cadastrados" value={data.teachers.length} detail="Contas com perfil Professor retornadas pela API" />
      <MetricCard label="Docentes exibidos" value={shown.length} detail="Resultado da busca atual" tone="slate" /></div>}
    <Card className="p-4 sm:p-5 space-y-4"><SectionHeading title="Professores cadastrados" subtitle="Selecione um docente para consultar o perfil e a disponibilidade." />
      {admin && <Field label="Buscar docente"><input className="field max-w-lg" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou e-mail" /></Field>}
      {loading ? <Busy /> : data.teachers.length === 0 ? <Empty text="Ainda não existem professores cadastrados." /> : shown.length === 0 ?
        <Empty title="Nenhum docente encontrado" text="Tente outro termo de busca." /> : <>
          <div className="hidden md:block data-table-wrap"><table className="w-full text-left text-sm"><thead><tr>
            <th className="table-head p-3">Docente</th>{admin && <th className="table-head p-3">E-mail</th>}<th className="table-head p-3">Perfil</th>
          </tr></thead><tbody>{shown.map((item) => <tr key={item.id} className="border-t border-line">
            <td className="p-3 font-semibold text-ink">{item.displayName}</td>{admin && <td className="p-3 text-muted-ink">{item.email || "Não informado"}</td>}
            <td className="p-3"><button type="button" className={teacherId === item.id ? "btn-primary" : "btn-secondary"}
              aria-pressed={teacherId === item.id} onClick={() => setTeacherId(item.id)}>Ver perfil</button></td>
          </tr>)}</tbody></table></div>
          <div className="md:hidden space-y-2">{shown.map((item) => <div key={item.id} className="rounded-xl border border-line p-3 space-y-2">
            <p className="font-semibold text-ink">{item.displayName}</p>{admin && item.email && <p className="text-sm text-muted-ink break-all">{item.email}</p>}
            <button type="button" className={teacherId === item.id ? "btn-primary" : "btn-secondary"}
              aria-pressed={teacherId === item.id} onClick={() => setTeacherId(item.id)}>Ver perfil</button>
          </div>)}</div>
        </>}
    </Card>
    {teacherId && (selected || !admin) && <>
      <TeacherProfile key={teacherId} teacherId={teacherId} admin={admin} />
      <Card className="p-4 sm:p-5 space-y-4"><SectionHeading title="Disponibilidade por turno"
        subtitle={`Disponibilidade informada por ${selected?.displayName ?? user.displayName}. A agenda efetiva depende das atribuições e reservas.`} />
        {admin && <SearchableSelect label="Professor" value={teacherId} onChange={setTeacherId}
          options={data.teachers.map((item) => ({ value: item.id, label: item.displayName }))} />}
        {availabilityLoading ? <Busy /> : data.shifts.length === 0 ? <Empty title="Nenhum turno cadastrado" /> : <>
          <div className="data-table-wrap"><table className="min-w-full text-sm"><thead><tr><th className="table-head px-3 py-3">Dia</th>
            {data.shifts.map((shift) => <th className="table-head px-3 py-3 text-center" key={shift.id}>{shift.name}
              <span className="block font-normal">{hour(shift.startsAt)}–{hour(shift.endsAt)}</span></th>)}</tr></thead>
            <tbody>{dayNames.slice(0, 5).map((day, index) => <tr key={day} className="border-b border-line"><th scope="row" className="px-3 py-3 text-left font-medium text-ink">{day}</th>
              {data.shifts.map((shift) => { const active = available.some((item) => item.weekday === index + 1 && item.shiftId === shift.id);
                return <td key={shift.id} className="p-2 text-center"><button type="button" aria-label={`${day} · ${shift.name}`}
                  aria-pressed={active} disabled={busy || availabilityLoading} onClick={() => toggle(index + 1, shift.id)}
                  className={`min-h-11 min-w-11 rounded-lg border font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${active ? "border-sky-500 bg-sky-700 text-white" : "border-line text-muted-ink hover:border-sky-400"}`}>
                  {active ? <Check size={18} aria-hidden="true" className="mx-auto" /> : "+"}</button></td>; })}</tr>)}</tbody>
          </table></div>
          <p className="muted">Marque os dias e turnos em que o docente informou disponibilidade.</p>
          <button type="button" onClick={() => void saveAvailability()} disabled={busy || availabilityLoading} className="btn-primary">{busy ? "Salvando..." : "Salvar disponibilidade"}</button>
        </>}
      </Card>
    </>}
    {admin && <Card className="p-4 sm:p-5 space-y-4"><SectionHeading title="Cadastrar professor" subtitle="Cria uma conta com papel Professor. Os demais dados podem ser preenchidos no perfil pedagógico após o cadastro." />
      <form onSubmit={(event) => void create(event)} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><input className="field" required maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="E-mail"><input type="email" className="field" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <Field label="Senha inicial" className="sm:col-span-2"><input type="password" minLength={8} required autoComplete="new-password" className="field" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
        <div className="sm:col-span-2"><SubmitButton busy={busy}>Criar professor</SubmitButton></div>
      </form>
    </Card>}
  </div>;
}
