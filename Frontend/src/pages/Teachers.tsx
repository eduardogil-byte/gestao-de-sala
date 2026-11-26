import { useId, useState, type FormEvent } from "react";
import { Info, Plus, Search } from "lucide-react";
import { useData } from "../lib/data";
import { register } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { TeacherProfile } from "../components/TeacherProfile";
import { Busy, Card, Empty, Field, MetricCard, Modal, Notice, SectionHeading, SubmitButton, Title, useConfirmation } from "../components/UI";
import type { User } from "../types";

export function Teachers({ user, onImport }: { user: User; onImport?: () => void }) {
  const admin = user.roles.includes("Admin");
  const { data, reload, loading } = useData();
  const [teacherId, setTeacherId] = useState(admin ? "" : user.id);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileState, setProfileState] = useState({ busy: false, dirty: false });
  const confirm = useConfirmation();
  async function closeProfile() {
    if (profileState.busy) return;
    if (profileState.dirty && !await confirm({ title: "Descartar alterações?", message: "As alterações das informações profissionais ainda não foram salvas.", confirmLabel: "Descartar alterações", danger: true })) return;
    setProfileOpen(false);
    setProfileState({ busy: false, dirty: false });
  }
  const [createOpen, setCreateOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
  const shown = data.teachers.filter((item) => (admin || item.id === user.id) && `${item.displayName} ${admin ? item.email ?? "" : ""}`
    .toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));
  const selected = data.teachers.find((item) => item.id === teacherId);
  const showProfile = (id: string) => { setTeacherId(id); setProfileOpen(true); setError(""); setSuccess(""); };
  const teacherName = (item: typeof data.teachers[number]) => <button type="button" aria-label={`Abrir perfil de ${item.displayName}`} onClick={() => showProfile(item.id)}
    className="rounded text-left font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-skybrand-500">{item.displayName}</button>;
  return <div className="space-y-5">
    <Title title="Docentes"
      action={admin && onImport ? <button type="button" className="btn-secondary" onClick={onImport}>Importar docentes</button> : undefined} />
    {error && !createOpen && !profileOpen && <Notice message={error} onClose={() => setError("")} />}
    {success && <Notice type="success" message={success} onClose={() => setSuccess("")} />}
    {admin && <div className="grid gap-3 sm:grid-cols-2"><MetricCard label="Instrutores cadastrados" value={data.teachers.length} detail="Contas de instrutores retornadas pela API" />
      <MetricCard label="Docentes exibidos" value={shown.length} detail="Resultado da busca atual" tone="slate" /></div>}
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><SectionHeading title="Instrutores cadastrados" />
          <span className="relative inline-flex" onMouseEnter={() => setHelpOpen(true)} onMouseLeave={() => setHelpOpen(false)}>
            <button type="button" aria-label="Informações sobre os instrutores" aria-describedby={helpOpen ? helpId : undefined}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-ink hover:bg-canvas hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500"
              onFocus={() => setHelpOpen(true)} onBlur={() => setHelpOpen(false)} onClick={() => setHelpOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setHelpOpen(false); } }}><Info size={17} aria-hidden="true" /></button>
            {helpOpen && <span id={helpId} role="tooltip" className="absolute right-0 top-full z-20 w-64 max-w-[calc(100vw-3rem)] rounded-lg border border-line bg-surface p-3 text-sm text-ink shadow-soft">Selecione um instrutor para consultar o perfil.</span>}
          </span>
        </div>
        {admin && <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <label className="relative min-w-0"><span className="sr-only">Buscar docente</span><Search size={17} aria-hidden="true" className="absolute left-3 top-3.5 text-muted-ink" /><input aria-label="Buscar docente" className="field !pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou e-mail" /></label>
          <button type="button" className="btn-primary shrink-0" onClick={() => { setError(""); setSuccess(""); setCreateOpen(true); }}><Plus size={17} aria-hidden="true" />Cadastrar instrutor</button>
        </div>}
      </div>
      {loading ? <Busy /> : data.teachers.length === 0 ? <Empty text="Ainda não existem instrutores cadastrados." /> : shown.length === 0 ?
        <Empty title="Nenhum docente encontrado" text="Tente outro termo de busca." /> : <>
          <div role="region" aria-label="Lista de instrutores cadastrados" tabIndex={0} className="hidden md:block data-table-wrap max-h-[min(60dvh,28rem)] !overflow-auto overscroll-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500"><table className="w-full text-left text-sm"><thead><tr>
            <th scope="col" className="table-head sticky top-0 z-10 p-3">Docente</th>{admin && <th scope="col" className="table-head sticky top-0 z-10 p-3">E-mail</th>}
          </tr></thead><tbody>{shown.map((item) => <tr key={item.id} onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) showProfile(item.id); }} className="cursor-pointer border-t border-line transition-colors hover:bg-canvas focus-within:bg-canvas">
            <td className="p-3 font-semibold text-ink">{teacherName(item)}</td>{admin && <td className="p-3 text-muted-ink">{item.email || "Não informado"}</td>}
          </tr>)}</tbody></table></div>
          <div role="region" aria-label="Lista de instrutores cadastrados" tabIndex={0} className="md:hidden max-h-[min(60dvh,28rem)] overflow-auto overscroll-contain space-y-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500">{shown.map((item) => <div key={item.id} onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) showProfile(item.id); }} className="cursor-pointer rounded-xl border border-line p-3 space-y-2 transition-colors hover:bg-canvas focus-within:bg-canvas">
            <p className="font-semibold text-ink">{teacherName(item)}</p>{admin && item.email && <p className="text-sm text-muted-ink break-all">{item.email}</p>}
          </div>)}</div>
        </>}
    </Card>
    {profileOpen && teacherId && (selected || !admin) && <Modal title={selected?.displayName ?? user.displayName} width="max-w-2xl" onClose={() => void closeProfile()}><div className="space-y-4">
      {admin && selected?.email && <p className="break-words text-sm text-muted-ink">{selected.email}</p>}
      {error && <Notice message={error} />}
      {success && <Notice type="success" message={success} />}
      <TeacherProfile key={teacherId} teacherId={teacherId} admin={admin} onStateChange={setProfileState} />
      <div className="flex justify-end border-t border-line pt-4"><button type="button" className="btn-secondary" disabled={profileState.busy} onClick={() => void closeProfile()}>Fechar</button></div>
    </div></Modal>}
    {admin && createOpen && <Modal title="Cadastrar instrutor" width="max-w-xl" onClose={() => { if (!busy) { setCreateOpen(false); setPassword(""); setError(""); } }}>
      {error && <div className="mb-3"><Notice message={error} /></div>}
      <form onSubmit={(event) => void create(event)}><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><input className="field" required maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="E-mail"><input type="email" className="field" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <Field label="Senha inicial" className="sm:col-span-2"><input type="password" minLength={8} required autoComplete="new-password" className="field" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
        <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => { setCreateOpen(false); setPassword(""); setError(""); }}>Cancelar</button><SubmitButton busy={busy}>Criar instrutor</SubmitButton></div>
      </fieldset></form>
    </Modal>}
  </div>;
}
