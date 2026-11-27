import { useEffect, useState } from "react";
import { post, read } from "../lib/api";
import { resultMessage } from "../lib/utils";
import type { ClassGroup, ClassSemesterHistory, CourseModule, Semester, Shift } from "../types";
import { Field, Modal, Notice, SubmitButton, useConfirmation } from "./UI";

type UnitOption = { curricularUnitId: number; code: string; name: string;
  teachers: { teacherId: string; displayName: string }[] };

export function ClassContinuationForm({ source, semesters, shifts, history, courseName, onClose, onCreated }: {
  source: ClassGroup; semesters: Semester[]; shifts: Shift[]; history: ClassSemesterHistory[];
  courseName: string; onClose: () => void; onCreated: (id: number) => Promise<void>;
}) {
  const confirm = useConfirmation();
  const [semesterId, setSemesterId] = useState("");
  const [moduleId, setModuleId] = useState(String(source.courseModuleId ?? ""));
  const [shiftId, setShiftId] = useState(String(source.shiftId ?? ""));
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [teachers, setTeachers] = useState<Record<number, string>>({});
  const [modulesBusy, setModulesBusy] = useState(false);
  const [unitsBusy, setUnitsBusy] = useState(false);
  const [modulesError, setModulesError] = useState("");
  const [unitsError, setUnitsError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!source.courseId) return;
    let active = true;
    setModulesBusy(true); setModulesError("");
    read<CourseModule[]>(`/courses/${source.courseId}/modules`)
      .then((rows) => { if (active) setModules(rows); })
      .catch((reason) => { if (active) setModulesError(resultMessage(reason)); })
      .finally(() => { if (active) setModulesBusy(false); });
    return () => { active = false; };
  }, [source.courseId, retry]);
  useEffect(() => {
    setUnits([]); setTeachers({}); setUnitsError(""); setUnitsBusy(false);
    if (!moduleId) return;
    let active = true;
    setUnitsBusy(true);
    read<UnitOption[]>(`/classes/${source.id}/continuation-options?moduleId=${moduleId}`)
      .then((rows) => { if (active) setUnits(rows); })
      .catch((reason) => { if (active) setUnitsError(resultMessage(reason)); })
      .finally(() => { if (active) setUnitsBusy(false); });
    return () => { active = false; };
  }, [source.id, moduleId, retry]);
  const sourceSemester = semesters.find((item) => item.id === source.semesterId);
  const availableSemesters = semesters.filter((item) => item.startDate > (sourceSemester?.startDate ?? "") &&
    !history.some((record) => record.semesterId === item.id)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  async function close() {
    if (busy) return;
    const dirty = semesterId !== "" || moduleId !== String(source.courseModuleId ?? "") ||
      shiftId !== String(source.shiftId ?? "") || Object.values(teachers).some(Boolean);
    if (!createdId && dirty && !await confirm({ title: "Descartar continuação?",
      message: "As opções selecionadas não serão salvas.", confirmLabel: "Descartar", danger: true })) return;
    onClose();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !semesterId || !moduleId || !shiftId || modulesError || unitsError) return;
    setBusy(true); setError("");
    try {
      const created = await post<{ id: number }>(`/classes/${source.id}/continue`, {
        semesterId: Number(semesterId), courseModuleId: Number(moduleId), shiftId: Number(shiftId),
        teachers: Object.entries(teachers).filter(([, id]) => id).map(([id, teacherId]) =>
          ({ curricularUnitId: Number(id), teacherId })),
      });
      setCreatedId(created.id);
      await onCreated(created.id);
    } catch (reason) { setError(resultMessage(reason)); }
    finally { setBusy(false); }
  }
  return <Modal title="Continuar turma" onClose={() => void close()} width="max-w-2xl">
    {createdId ? <div className="space-y-4"><Notice type="success" message="Continuação criada. Não foi possível atualizar a tela; evite criar outro registro." />
      <button className="btn-primary" type="button" disabled={busy} onClick={async () => {
        setBusy(true); try { await onCreated(createdId); } catch (reason) { setError(resultMessage(reason)); } finally { setBusy(false); }
      }}>Abrir turma criada</button>{error && <Notice message={error} />}</div> :
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <div className="rounded-panel border border-line bg-canvas p-4 text-sm space-y-1">
        <p className="break-words font-semibold text-ink">{source.name}{source.code ? ` · ${source.code}` : ""}</p>
        <p className="break-words text-muted-ink">{courseName} · {source.students} alunos</p>
        <p className="text-muted-ink">Origem: {sourceSemester?.name ?? "Semestre não informado"}</p>
      </div>
      <p className="text-sm text-muted-ink">Será criado um registro da mesma turma em outro semestre. O histórico anterior permanece salvo. Reservas, ocupações, atribuições e planejamentos não são copiados.</p>
      {!source.courseId && <Notice message="Vincule um curso à turma antes de continuar." />}
      {error && <Notice message={error} />}
      <fieldset disabled={busy || !source.courseId} className="space-y-4">
        <Field label="Semestre de destino"><select className="field" required value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
          <option value="">Selecione um semestre</option>{availableSemesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></Field>
        {!availableSemesters.length && <p role="status" className="text-sm text-muted-ink">Não há semestre posterior disponível. Cadastre um novo semestre ou consulte o histórico desta turma.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Módulo da continuação"><select className="field" required value={moduleId} disabled={modulesBusy || !!modulesError}
            onChange={(event) => setModuleId(event.target.value)}><option value="">Selecione um módulo</option>
            {modules.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></Field>
          <Field label="Turno da continuação"><select className="field" required value={shiftId} onChange={(event) => setShiftId(event.target.value)}>
            <option value="">Selecione um turno</option>{shifts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></Field>
        </div>
        <p className="text-sm text-muted-ink">Você pode continuar no mesmo módulo. Nesse caso, a modalidade das UCs é mantida; UCs novas entram como presenciais.</p>
        {(modulesBusy || unitsBusy) && <p role="status" className="text-sm text-muted-ink">Carregando módulos e instrutores…</p>}
        {(modulesError || unitsError) && <div className="space-y-2"><Notice message={modulesError || unitsError} />
          <button type="button" className="btn-secondary" onClick={() => setRetry(retry + 1)}>Tentar novamente</button></div>}
        {!unitsBusy && !unitsError && moduleId && <section aria-label="Instrutores da continuação" className="space-y-3">
          <h3 className="font-semibold text-ink">UCs e instrutores</h3>
          <p className="text-sm text-muted-ink">Escolha o responsável por cada UC ou defina depois. Os instrutores anteriores não são atribuídos automaticamente.</p>
          {!units.length && <p className="text-sm text-muted-ink">Este módulo não possui UCs cadastradas.</p>}
          {units.map((unit) => <div key={unit.curricularUnitId} className="rounded-panel border border-line p-3">
            <Field label={`Instrutor de ${unit.name}`}><select className="field" value={teachers[unit.curricularUnitId] ?? ""}
              onChange={(event) => setTeachers({ ...teachers, [unit.curricularUnitId]: event.target.value })}>
              <option value="">Definir depois</option>{unit.teachers.map((teacher) => <option key={teacher.teacherId} value={teacher.teacherId}>{teacher.displayName}</option>)}
            </select></Field>
            {!unit.teachers.length && <p className="mt-2 text-sm text-muted-ink">Nenhum instrutor habilitado para esta UC e curso.</p>}
          </div>)}
        </section>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <button type="button" className="btn-secondary" onClick={() => void close()}>Cancelar</button>
          <SubmitButton busy={busy} disabled={modulesBusy || unitsBusy || !!modulesError || !!unitsError || !availableSemesters.length || !moduleId}>Criar continuação</SubmitButton>
        </div>
      </fieldset>
    </form>}
  </Modal>;
}
