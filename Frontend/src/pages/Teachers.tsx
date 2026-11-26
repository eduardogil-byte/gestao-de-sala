import { useEffect, useId, useState, type FormEvent, type MouseEvent } from "react";
import { Check, Eye, Info, Plus, Search } from "lucide-react";
import { useData } from "../lib/data";
import { read, put, register } from "../lib/api";
import { dateBR, dayNames, hour, resultMessage } from "../lib/utils";
import { TeacherProfile, type TeacherTab } from "../components/TeacherProfile";
import { Busy, Field, Modal, Notice, SearchableSelect, SubmitButton } from "../components/UI";
import { PageHeading, Panel, SenaiScope, StatCard } from "../components/senai/SenaiUI";
import type { Availability, User } from "../types";

export function Teachers({ user, onImport }: { user: User; onImport?: () => void }) {
  const admin = user.roles.includes("Admin");
  const { data, reload, loading } = useData();
  const [teacherId, setTeacherId] = useState(admin ? "" : user.id);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<TeacherTab>("resumo");
  const [createOpen, setCreateOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
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
      setCreateOpen(false);
      setSuccess("Instrutor cadastrado.");
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
  const showProfile = (id: string) => { setTeacherId(id); setProfileOpen(true); setProfileTab("resumo"); setError(""); setSuccess(""); };
  const teacherName = (item: typeof data.teachers[number]) => <button type="button" aria-label={`Abrir perfil de ${item.displayName}`} onClick={() => showProfile(item.id)}
    className="sg-name-button">{item.displayName}</button>;
  const detailsButton = (item: typeof data.teachers[number]) => <button type="button" className="sg-icon-button" title="Ver detalhes" aria-label={`Ver detalhes de ${item.displayName}`} onClick={() => showProfile(item.id)}>
    <Eye size={17} aria-hidden="true" /></button>;
  const openFromRow = (event: MouseEvent, id: string) => { if (!(event.target as HTMLElement).closest("button")) showProfile(id); };
  const activeAssignments = data.assignments.filter((item) => !item.endedAtUtc);
  const assignmentsOf = (id: string) => activeAssignments.filter((item) => item.teacherId === id);
  const classCount = (id: string) => new Set(assignmentsOf(id).map((item) => item.classGroupId)).size;
  const assigned = data.teachers.filter((item) => assignmentsOf(item.id).length > 0).length;
  const teacherAssignments = data.assignments.filter((item) => item.teacherId === teacherId);
  const profileName = selected?.displayName ?? user.displayName;

  const availabilityPanel = <Panel title="Disponibilidade por turno"
    subtitle={`Disponibilidade informada por ${profileName}. A agenda efetiva depende das atribuições e reservas.`}>
    <div className="sg-stack">
      {admin && <SearchableSelect label="Instrutor" value={teacherId} onChange={setTeacherId}
        options={data.teachers.map((item) => ({ value: item.id, label: item.displayName }))} />}
      {availabilityLoading ? <Busy /> : data.shifts.length === 0 ? <p className="sg-empty">Nenhum turno cadastrado.</p> : <>
        <div className="sg-slots-wrap"><table className="sg-table sg-slots"><thead><tr><th scope="col">Dia</th>
          {data.shifts.map((shift) => <th scope="col" key={shift.id}>{shift.name}
            <span>{hour(shift.startsAt)}–{hour(shift.endsAt)}</span></th>)}</tr></thead>
          <tbody>{dayNames.slice(0, 5).map((day, index) => <tr key={day}><th scope="row">{day}</th>
            {data.shifts.map((shift) => { const active = available.some((item) => item.weekday === index + 1 && item.shiftId === shift.id);
              return <td key={shift.id}><button type="button" aria-label={`${day} · ${shift.name}`}
                aria-pressed={active} disabled={busy || availabilityLoading} onClick={() => toggle(index + 1, shift.id)} className="sg-slot">
                {active ? <Check size={18} aria-hidden="true" /> : "+"}</button></td>; })}</tr>)}</tbody>
        </table></div>
        <p className="sg-note">Marque os dias e turnos em que o docente informou disponibilidade.</p>
        <button type="button" onClick={() => void saveAvailability()} disabled={busy || availabilityLoading} className="btn-primary justify-self-start">{busy ? "Salvando..." : "Salvar disponibilidade"}</button>
      </>}
    </div>
  </Panel>;

  const assignmentsPanel = <Panel title="Turmas atribuídas" subtitle="Atribuições pedagógicas registradas. Não representam reservas de ambiente.">
    {teacherAssignments.length === 0 ? <p className="sg-empty">Nenhuma atribuição registrada para este instrutor.</p> :
      <ul>{teacherAssignments.map((assignment) => {
        const group = data.classes.find((item) => item.id === assignment.classGroupId);
        const semester = data.semesters.find((item) => item.id === assignment.semesterId);
        return <li key={assignment.id} className="sg-item flex-wrap"><div className="sg-item-text">
          <strong>{group ? [group.code, group.name].filter(Boolean).join(" · ") : `Turma ${assignment.classGroupId}`}</strong>
          <small>{assignment.disciplineName} · {semester?.name ?? "Semestre não informado"}</small>
        </div>
          <span className={`sg-status ${assignment.endedAtUtc ? "" : "is-active"}`}>{assignment.endedAtUtc ? `Encerrada em ${dateBR(assignment.endedAtUtc)}` : "Ativa"}</span>
        </li>;
      })}</ul>}
  </Panel>;

  return <>
    <SenaiScope>
      <PageHeading eyebrow={admin ? "Cadastros / Instrutores" : "Pedagógico / Instrutores"} title={admin ? "Gestão de instrutores" : "Instrutores"}
        subtitle={admin ? "Consulte perfis, habilitações, disponibilidade e atribuições dos instrutores." : "Consulte seu perfil, habilitações, disponibilidade e atribuições."}
        action={admin ? <>
          {onImport && <button type="button" className="btn-secondary" onClick={onImport}>Importar docentes</button>}
          <button type="button" className="btn-primary" onClick={() => { setError(""); setSuccess(""); setCreateOpen(true); }}><Plus size={17} aria-hidden="true" />Cadastrar instrutor</button>
        </> : undefined} />
      {error && !createOpen && !profileOpen && <Notice message={error} onClose={() => setError("")} />}
      {success && !profileOpen && <Notice type="success" message={success} onClose={() => setSuccess("")} />}
      {admin && <section aria-label="Resumo dos instrutores" className="sg-stats sg-stats-4">
        <StatCard label="Instrutores cadastrados" value={data.teachers.length} detail="contas retornadas pela API" />
        <StatCard tone="gray" label="Docentes exibidos" value={shown.length} detail="resultado da busca atual" />
        <StatCard tone="green" label="Com atribuição" value={assigned} detail="instrutores com turma ativa" />
        <StatCard tone="amber" label="Sem atribuição" value={data.teachers.length - assigned} detail="sem turma ativa no momento" />
      </section>}
      <section className="card sg-panel" aria-label="Instrutores">
        <div className="sg-toolbar">
          {admin && <div className="sg-search"><Field label="Buscar docente"><input className="field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nome ou e-mail" /></Field><Search size={16} aria-hidden="true" /></div>}
          <span className="sg-help" onMouseEnter={() => setHelpOpen(true)} onMouseLeave={() => setHelpOpen(false)}>
            <button type="button" aria-label="Informações sobre os instrutores" aria-describedby={helpOpen ? helpId : undefined} className="sg-icon-button"
              onFocus={() => setHelpOpen(true)} onBlur={() => setHelpOpen(false)} onClick={() => setHelpOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setHelpOpen(false); } }}><Info size={17} aria-hidden="true" /></button>
            {helpOpen && <span id={helpId} role="tooltip">Selecione um instrutor para consultar o perfil e a disponibilidade.</span>}
          </span>
          {!loading && <span className="sg-count" role="status">{shown.length} de {admin ? data.teachers.length : shown.length} instrutor(es)</span>}
        </div>
        {loading ? <Busy /> : data.teachers.length === 0 ? <div className="sg-panel-body"><p className="sg-empty">Ainda não existem instrutores cadastrados.</p></div> : shown.length === 0 ?
          <div className="sg-panel-body"><p className="sg-empty">Nenhum docente encontrado. Tente outro termo de busca.</p></div> : <>
            <div role="region" aria-label="Lista de instrutores cadastrados" tabIndex={0} className="sg-list-scroll hidden md:block">
              <table className="sg-table sg-teachers-table"><thead><tr>
                <th scope="col">Nome</th>{admin && <th scope="col">E-mail institucional</th>}<th scope="col">Turmas</th><th scope="col">Atribuições ativas</th><th scope="col" className="sg-col-actions">Ações</th>
              </tr></thead><tbody>{shown.map((item) => <tr key={item.id} onClick={(event) => openFromRow(event, item.id)} className="cursor-pointer">
                <td>{teacherName(item)}</td>{admin && <td className="break-all">{item.email || "Não informado"}</td>}
                <td>{classCount(item.id)}</td><td>{assignmentsOf(item.id).length}</td>
                <td><div className="sg-row-actions">{detailsButton(item)}</div></td>
              </tr>)}</tbody></table>
            </div>
            <div role="region" aria-label="Lista de instrutores cadastrados" tabIndex={0} className="sg-list-scroll sg-cards md:hidden">{shown.map((item) => <article key={item.id} onClick={(event) => openFromRow(event, item.id)}>
              <h3>{teacherName(item)}</h3>{admin && item.email && <p className="sg-note break-all">{item.email}</p>}
              <p className="sg-note">{classCount(item.id)} turma(s) · {assignmentsOf(item.id).length} atribuição(ões) ativa(s)</p>
              <div className="sg-row-actions">{detailsButton(item)}</div>
            </article>)}</div>
          </>}
      </section>
    </SenaiScope>
    <SenaiScope modals>
      {profileOpen && teacherId && (selected || !admin) && <Modal title={`Perfil · ${profileName}`} width="max-w-4xl" onClose={() => { if (!busy) setProfileOpen(false); }}><div className="sg-stack">
        {error && <Notice message={error} />}
        {success && <Notice type="success" message={success} />}
        <TeacherProfile key={teacherId} teacherId={teacherId} admin={admin} tab={profileTab} onTab={setProfileTab}
          information={[["Nome completo", profileName], ...(admin ? [["E-mail institucional", selected?.email || "Não informado"]] : [])] as [string, string][]}
          availability={{ count: availabilityLoading ? undefined : available.length, content: availabilityPanel }}
          assignments={{ count: teacherAssignments.length, active: assignmentsOf(teacherId).length, content: assignmentsPanel }} />
      </div></Modal>}
      {admin && createOpen && <Modal title="Cadastrar instrutor" width="max-w-xl" onClose={() => { if (!busy) { setCreateOpen(false); setPassword(""); setError(""); } }}>
        {error && <div className="mb-3"><Notice message={error} /></div>}
        <form onSubmit={(event) => void create(event)}><fieldset disabled={busy} className="grid gap-4">
          <Field label="Nome"><input className="field" required maxLength={120} autoComplete="name" placeholder="Nome do instrutor" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="E-mail"><input type="email" className="field" required autoComplete="email" placeholder="nome@instituicao.exemplo" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <Field label="Senha inicial"><input type="password" minLength={8} required autoComplete="new-password" className="field" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
          <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => { setCreateOpen(false); setPassword(""); setError(""); }}>Cancelar</button><SubmitButton busy={busy}>Criar instrutor</SubmitButton></div>
        </fieldset></form>
      </Modal>}
    </SenaiScope>
  </>;
}
