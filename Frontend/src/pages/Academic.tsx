import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarPlus,
  GraduationCap,
  Plus,
  Users,
} from "lucide-react";
import { useData } from "../lib/data";
import { post, put, read } from "../lib/api";
import { dateBR, resultMessage } from "../lib/utils";
import { NeedFields, defaultNeed } from "../components/NeedFields";
import {
  Card,
  Badge,
  Empty,
  Field,
  Notice,
  SubmitButton,
  Title,
} from "../components/UI";
import type { Course, CourseModule, CurricularUnit, Need, User } from "../types";

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
type UnitResource = { resourceCatalogItemId: number; name: string; category: string; quantity: number };
type UnitOffer = { curricularUnitId: number; deliveryMode: "Presencial" | "Ead";
  eadScheduleMode: "SemHorarioFixo" | "HorarioDefinido" | null };
type ClassUnits = { legacyWithoutModule: boolean; presentialHours: number; eadHours: number;
  unitsWithoutHours: number; units: (UnitOffer & { code: string; name: string; plannedHours: number | null;
    resources: UnitResource[]; teacherId: string | null })[] };
type EligibleTeacher = { teacherId: string; displayName: string };

export function Academic({ user }: { user: User }) {
  const admin = user.roles.includes("Admin");
  const { data, reload } = useData();
  const [semester, setSemester] = useState({
    name: "2026/2",
    startDate: "2026-10-12",
    endDate: "2026-12-18",
  });
  const [cls, setCls] = useState({ semesterId: "", code: "", name: "", students: 25, shiftId: "",
    courseId: "", courseModuleId: "" });
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [units, setUnits] = useState<CurricularUnit[]>([]);
  const [unitResources, setUnitResources] = useState<Record<number, UnitResource[]>>({});
  const [unitOfferings, setUnitOfferings] = useState<UnitOffer[]>([]);
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null);
  const [classUnits, setClassUnits] = useState<ClassUnits | null>(null);
  const [classUnitsError, setClassUnitsError] = useState("");
  const [assignmentSemesterId, setAssignmentSemesterId] = useState("");
  const [assignmentClassId, setAssignmentClassId] = useState("");
  const [assignmentUnitId, setAssignmentUnitId] = useState("");
  const [assignmentTeacherId, setAssignmentTeacherId] = useState("");
  const [offeredUnits, setOfferedUnits] = useState<ClassUnits | null>(null);
  const [eligibleTeachers, setEligibleTeachers] = useState<EligibleTeacher[]>([]);
  const [offeringError, setOfferingError] = useState("");
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicError, setAcademicError] = useState("");
  const [editingClass, setEditingClass] = useState<{ id: number; code: string; name: string; shiftId: string } | null>(null);
  const [as, setAs] = useState({
    classGroupId: "",
    teacherId: "",
    disciplineName: "",
    meetingsPerWeek: 1,
    preferredShiftId: "",
    lessonPlanLink: "",
  });
  const [need, setNeed] = useState<Need>(defaultNeed);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    let active = true;
    read<Course[]>("/courses").then((items) => { if (active) setCourses(items); })
      .catch((cause) => { if (active) setAcademicError(resultMessage(cause)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    setClassUnits(null); setClassUnitsError("");
    if (expandedClassId === null) return;
    let active = true;
    read<ClassUnits>(`/classes/${expandedClassId}/units`)
      .then((value) => { if (active) setClassUnits(value); })
      .catch((cause) => { if (active) setClassUnitsError(resultMessage(cause)); });
    return () => { active = false; };
  }, [expandedClassId]);
  useEffect(() => {
    setOfferedUnits(null); setAssignmentUnitId(""); setAssignmentTeacherId(""); setEligibleTeachers([]);
    if (!assignmentClassId) return;
    let active = true;
    read<ClassUnits>(`/classes/${assignmentClassId}/units`)
      .then((value) => { if (active) setOfferedUnits(value); })
      .catch((cause) => { if (active) setOfferingError(resultMessage(cause)); });
    return () => { active = false; };
  }, [assignmentClassId]);
  useEffect(() => {
    setEligibleTeachers([]); setAssignmentTeacherId("");
    if (!assignmentClassId || !assignmentUnitId || !admin) return;
    let active = true;
    read<EligibleTeacher[]>(`/classes/${assignmentClassId}/units/${assignmentUnitId}/eligible-teachers`)
      .then((value) => { if (active) setEligibleTeachers(value); })
      .catch((cause) => { if (active) setOfferingError(resultMessage(cause)); });
    return () => { active = false; };
  }, [assignmentClassId, assignmentUnitId, admin]);
  async function assignOfferedUnit() {
    if (!assignmentClassId || !assignmentUnitId || !assignmentTeacherId || action) return;
    setAction("offered-unit"); setOfferingError(""); setSuccess("");
    try {
      await put(`/classes/${assignmentClassId}/units/${assignmentUnitId}/teacher`, { teacherId: assignmentTeacherId });
      const updated = await read<ClassUnits>(`/classes/${assignmentClassId}/units`);
      setOfferedUnits(updated);
      if (expandedClassId === Number(assignmentClassId)) setClassUnits(updated);
      setSuccess("Instrutor responsável registrado para a UC ofertada.");
    } catch (cause) { setOfferingError(resultMessage(cause)); }
    finally { setAction(""); }
  }
  useEffect(() => {
    setModules([]); setUnits([]); setUnitResources({}); setUnitOfferings([]);
    if (!cls.courseId) return;
    let active = true;
    setAcademicLoading(true); setAcademicError("");
    read<CourseModule[]>(`/courses/${cls.courseId}/modules`)
      .then((items) => { if (active) setModules(items); })
      .catch((cause) => { if (active) setAcademicError(resultMessage(cause)); })
      .finally(() => { if (active) setAcademicLoading(false); });
    return () => { active = false; };
  }, [cls.courseId]);
  useEffect(() => {
    setUnits([]); setUnitResources({}); setUnitOfferings([]);
    if (!cls.courseId || !cls.courseModuleId) return;
    let active = true;
    setAcademicLoading(true); setAcademicError("");
    const base = `/courses/${cls.courseId}/modules/${cls.courseModuleId}/curricular-units`;
    read<CurricularUnit[]>(base).then(async (items) => {
      const details = await Promise.all(items.map(async (unit) =>
        [unit.id, await read<UnitResource[]>(`${base}/${unit.id}/resources`)] as const));
      if (active) {
        setUnits(items); setUnitResources(Object.fromEntries(details));
        setUnitOfferings(items.map((unit) => ({ curricularUnitId: unit.id,
          deliveryMode: "Presencial", eadScheduleMode: null })));
      }
    }).catch((cause) => { if (active) setAcademicError(resultMessage(cause)); })
      .finally(() => { if (active) setAcademicLoading(false); });
    return () => { active = false; };
  }, [cls.courseId, cls.courseModuleId]);
  const handle = async (
    path: string,
    body: unknown,
    form: string,
    onSuccess: () => void,
  ) => {
    setAction(form);
    setError("");
    setSuccess("");
    try {
      await post(path, body);
      await reload();
      onSuccess();
      setSuccess("Cadastro realizado.");
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setAction("");
    }
  };
  return (
    <>
      <Title
        title="Estrutura acadêmica"
        subtitle="Cadastre semestres, turmas e disciplinas para a geração automática da grade."
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
      {admin && (
        <div className="grid xl:grid-cols-2 gap-5 mb-6">
          <Card className="p-5">
            <div className="flex gap-2 items-center mb-5">
              <CalendarPlus className="text-skybrand-600" size={19} />
              <h3 className="section-title">Novo semestre</h3>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handle("/semesters", semester, "semester", () =>
                  setSemester((s) => ({ ...s, name: "" })),
                );
              }}
            >
              <Field label="Nome">
                <input
                  required
                  className="field"
                  value={semester.name}
                  onChange={(e) =>
                    setSemester({ ...semester, name: e.target.value })
                  }
                  placeholder="2027/1"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início">
                  <input
                    required
                    type="date"
                    className="field"
                    value={semester.startDate}
                    onChange={(e) =>
                      setSemester({ ...semester, startDate: e.target.value })
                    }
                  />
                </Field>
                <Field label="Fim">
                  <input
                    required
                    type="date"
                    className="field"
                    min={semester.startDate}
                    value={semester.endDate}
                    onChange={(e) =>
                      setSemester({ ...semester, endDate: e.target.value })
                    }
                  />
                </Field>
              </div>
              <SubmitButton busy={action === "semester"}>
                <Plus size={16} />
                Adicionar semestre
              </SubmitButton>
            </form>
          </Card>
          <Card className="p-5">
            <div className="flex gap-2 items-center mb-5">
              <GraduationCap className="text-skybrand-600" size={19} />
              <h3 className="section-title">Nova turma</h3>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handle(
                  "/classes",
                  { ...cls, semesterId: Number(cls.semesterId), shiftId: Number(cls.shiftId),
                    courseId: Number(cls.courseId), courseModuleId: Number(cls.courseModuleId),
                    unitOfferings },
                  "class",
                  () => setCls({ ...cls, name: "" }),
                );
              }}
            >
              <Field label="Semestre">
                <select
                  className="field"
                  required
                  value={cls.semesterId}
                  onChange={(e) =>
                    setCls({ ...cls, semesterId: e.target.value })
                  }
                >
                  <option value="">Selecione um semestre</option>
                  {data.semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Curso do Plano de Curso">
                  <select className="field" required value={cls.courseId} onChange={(e) =>
                    setCls({ ...cls, courseId: e.target.value, courseModuleId: "" })}>
                    <option value="">Selecione o curso</option>
                    {courses.filter((course) => course.active).map((course) =>
                      <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
                  </select>
                </Field>
                <Field label="Módulo do curso">
                  <select className="field" required disabled={!cls.courseId || academicLoading} value={cls.courseModuleId}
                    onChange={(e) => setCls({ ...cls, courseModuleId: e.target.value })}>
                    <option value="">Selecione o módulo</option>
                    {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                  </select>
                </Field>
              </div>
              {academicError && <Notice message={academicError} />}
              {academicLoading && <p className="muted" role="status">Carregando módulos e UCs do Plano de Curso…</p>}
              {cls.courseModuleId && !academicLoading && !academicError && <section aria-label="UCs do módulo" className="space-y-3">
                <h4 className="font-semibold text-ink">UCs do módulo</h4>
                {units.length === 0 && <p className="muted">Este módulo ainda não possui UCs cadastradas.</p>}
                {units.map((unit) => {
                  const offer = unitOfferings.find((item) => item.curricularUnitId === unit.id);
                  return <div key={unit.id} className="rounded-panel border border-line p-3 space-y-2">
                    <p className="font-medium text-ink">{unit.code} · {unit.name} · CH {unit.plannedHours == null ? "não informada" : `${unit.plannedHours} h`}</p>
                    <p className="muted text-sm">Recursos: {(unitResources[unit.id] ?? []).length
                      ? unitResources[unit.id].map((resource) => `${resource.name} (${resource.quantity})`).join(", ") : "nenhum requisito cadastrado"}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label={`Oferta de ${unit.name}`}><select className="field" value={offer?.deliveryMode ?? "Presencial"}
                        onChange={(event) => setUnitOfferings((current) => current.map((item) => item.curricularUnitId === unit.id
                          ? { ...item, deliveryMode: event.target.value as UnitOffer["deliveryMode"],
                            eadScheduleMode: event.target.value === "Ead" ? "SemHorarioFixo" : null } : item))}>
                        <option value="Presencial">Presencial</option><option value="Ead">EAD</option>
                      </select></Field>
                      {offer?.deliveryMode === "Ead" && <Field label={`Horário on-line de ${unit.name}`}><select className="field"
                        value={offer.eadScheduleMode ?? "SemHorarioFixo"}
                        onChange={(event) => setUnitOfferings((current) => current.map((item) => item.curricularUnitId === unit.id
                          ? { ...item, eadScheduleMode: event.target.value as UnitOffer["eadScheduleMode"] } : item))}>
                        <option value="SemHorarioFixo">Sem horário fixo</option>
                        <option value="HorarioDefinido">Encontros on-line com horário definido</option>
                      </select></Field>}
                    </div>
                  </div>;
                })}
              </section>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Código da turma">
                  <input className="field" maxLength={30} value={cls.code}
                    onChange={(e) => setCls({ ...cls, code: e.target.value })} placeholder="001" />
                </Field>
                <Field label="Turma">
                  <input
                    required
                    className="field"
                    value={cls.name}
                    onChange={(e) => setCls({ ...cls, name: e.target.value })}
                    placeholder="Info 3"
                  />
                </Field>
                <Field label="Alunos">
                  <input
                    className="field"
                    type="number"
                    min="1"
                    max="500"
                    value={cls.students}
                    onChange={(e) =>
                      setCls({ ...cls, students: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <Field label="Turno da turma">
                <select className="field" required value={cls.shiftId} onChange={(e) => setCls({ ...cls, shiftId: e.target.value })}>
                  <option value="">Selecione o turno institucional</option>
                  {data.shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startsAt.slice(0, 5)}–{shift.endsAt.slice(0, 5)}</option>)}
                </select>
              </Field>
              <SubmitButton busy={action === "class" || academicLoading || Boolean(academicError) ||
                !cls.courseId || !cls.courseModuleId || unitOfferings.length !== units.length}>
                <Plus size={16} />
                Adicionar turma
              </SubmitButton>
            </form>
          </Card>
        </div>
      )}
      {admin && (
        <Card className="p-5 mb-6 space-y-4">
          <h3 className="section-title">Atribuir instrutor à UC ofertada</h3>
          <p className="muted">Atribuição sem dia, turno ou sala. A programação dos encontros ocorre em etapa posterior.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Semestre da atribuição"><select className="field" value={assignmentSemesterId}
              onChange={(event) => { setAssignmentSemesterId(event.target.value); setAssignmentClassId(""); }}>
              <option value="">Selecione o semestre</option>{data.semesters.map((item) =>
                <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Turma da atribuição"><select className="field" value={assignmentClassId} disabled={!assignmentSemesterId}
              onChange={(event) => { setOfferingError(""); setAssignmentClassId(event.target.value); }}>
              <option value="">Selecione a turma</option>{data.classes.filter((item) => item.semesterId === Number(assignmentSemesterId))
                .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="UC ofertada"><select className="field" value={assignmentUnitId} disabled={!offeredUnits?.units.length}
              onChange={(event) => { setOfferingError(""); setAssignmentUnitId(event.target.value); }}>
              <option value="">Selecione a UC</option>{offeredUnits?.units.map((item) => <option key={item.curricularUnitId}
                value={item.curricularUnitId}>{item.code} · {item.name} · {item.deliveryMode === "Ead" ? "EAD" : "Presencial"}</option>)}</select></Field>
            <Field label="Instrutor habilitado"><select className="field" value={assignmentTeacherId} disabled={!assignmentUnitId}
              onChange={(event) => setAssignmentTeacherId(event.target.value)}>
              <option value="">Selecione o instrutor</option>{eligibleTeachers.map((item) =>
                <option key={item.teacherId} value={item.teacherId}>{item.displayName}</option>)}</select></Field>
          </div>
          {offeredUnits?.legacyWithoutModule && <Notice type="info" message="Turma anterior sem módulo vinculado; suas atribuições existentes permanecem disponíveis abaixo." />}
          {assignmentUnitId && eligibleTeachers.length === 0 && !offeringError && <p className="muted">Nenhum instrutor habilitado para o curso e esta UC.</p>}
          {assignmentUnitId && offeredUnits?.units.find((item) => item.curricularUnitId === Number(assignmentUnitId))?.teacherId &&
            <p className="muted">Responsável atual: {data.teachers.find((teacher) => teacher.id === offeredUnits.units.find((item) =>
              item.curricularUnitId === Number(assignmentUnitId))?.teacherId)?.displayName ?? "Instrutor cadastrado"}</p>}
          {offeringError && <Notice message={offeringError} />}
          <button type="button" className="btn-primary" disabled={!assignmentTeacherId || action === "offered-unit"}
            onClick={() => void assignOfferedUnit()}>Salvar instrutor responsável</button>
        </Card>
      )}
      {admin && (
        <Card className="p-5 mb-6">
          <div className="flex gap-2 items-center mb-5">
            <BookOpen className="text-skybrand-600" size={19} />
            <h3 className="section-title">Atribuir disciplina a uma turma</h3>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handle(
                "/assignments",
                {
                  classGroupId: Number(as.classGroupId),
                  teacherId: as.teacherId,
                  disciplineName: as.disciplineName,
                  meetingsPerWeek: as.meetingsPerWeek,
                  preferredShiftId: as.preferredShiftId
                    ? Number(as.preferredShiftId)
                    : null,
                  lessonPlanLink: as.lessonPlanLink || null,
                  ...need,
                },
                "assignment",
                () => setAs({ ...as, disciplineName: "", lessonPlanLink: "" }),
              );
            }}
          >
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Turma">
                <select
                  required
                  className="field"
                  value={as.classGroupId}
                  onChange={(e) =>
                    setAs({ ...as, classGroupId: e.target.value })
                  }
                >
                  <option value="">Selecione a turma</option>
                  {data.classes.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name} •{" "}
                      {data.semesters.find((s) => s.id === c.semesterId)?.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Instrutor">
                <select
                  required
                  className="field"
                  value={as.teacherId}
                  onChange={(e) => setAs({ ...as, teacherId: e.target.value })}
                >
                  <option value="">Selecione o instrutor</option>
                  {data.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Disciplina">
                <input
                  className="field"
                  required
                  placeholder="Ex.: Informática Aplicada"
                  value={as.disciplineName}
                  onChange={(e) =>
                    setAs({ ...as, disciplineName: e.target.value })
                  }
                />
              </Field>
              <Field label="Aulas por semana (turnos)">
                <input
                  type="number"
                  className="field"
                  min="1"
                  max="5"
                  value={as.meetingsPerWeek}
                  onChange={(e) =>
                    setAs({ ...as, meetingsPerWeek: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Turno preferencial">
                <select
                  className="field"
                  value={as.preferredShiftId}
                  onChange={(e) =>
                    setAs({ ...as, preferredShiftId: e.target.value })
                  }
                >
                  <option value="">Sem preferência</option>
                  {data.shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Plano de ensino (URL opcional)">
                <input
                  type="url"
                  className="field"
                  placeholder="https://..."
                  value={as.lessonPlanLink}
                  onChange={(e) =>
                    setAs({ ...as, lessonPlanLink: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <h4 className="font-semibold text-sm mb-3">
                Requisitos da disciplina
              </h4>
              <NeedFields
                value={need}
                onChange={setNeed}
                software={data.software}
              />
            </div>
            <div className="flex justify-end">
              <SubmitButton busy={action === "assignment"}>
                Salvar atribuição
              </SubmitButton>
            </div>
          </form>
        </Card>
      )}
      <div className="grid xl:grid-cols-2 gap-5">
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between">
            <h3 className="section-title">Semestres e turmas</h3>
            <span className="text-xs text-slate-400">
              {data.classes.length} turmas
            </span>
          </div>
          {data.semesters.length === 0 ? (
            <Empty text="Comece cadastrando um semestre." />
          ) : (
            data.semesters.map((s) => (
              <div
                className="border-b border-slate-100 p-4 last:border-b-0"
                key={s.id}
              >
                <p className="font-semibold text-sm">
                  {s.name}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {dateBR(s.startDate)} a {dateBR(s.endDate)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {data.classes.filter((c) => c.semesterId === s.id).length ? (
                    data.classes
                      .filter((c) => c.semesterId === s.id)
                      .map((c) => (<div key={c.id} className="w-full">
                        <div
                          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                        >
                          <strong>{c.code ? `${c.code} | ` : ""}{c.name}</strong>
                          {(() => {
                            const shiftNames = [...new Set(data.assignments
                              .filter((assignment) => assignment.classGroupId === c.id && !assignment.endedAtUtc)
                              .map((assignment) => data.shifts.find((shift) => shift.id === assignment.preferredShiftId)?.name)
                              .filter((name): name is string => Boolean(name)))];
                            const official = data.shifts.find((shift) => shift.id === c.shiftId)?.name;
                            return <span className="text-muted-ink"> · {c.students} alunos · {official ?? (shiftNames.length === 0 ? "Turno não cadastrado" : shiftNames.length === 1 ? `${shiftNames[0]} (atribuição; turno oficial pendente)` : `Turnos divergentes: ${shiftNames.join(" / ")}`)}</span>;
                          })()}
                          <span className="text-muted-ink"> · {courses.find((course) => course.id === c.courseId)?.name ??
                            (c.courseId ? `Curso #${c.courseId}` : "Curso não vinculado")}</span>
                          {c.courseModuleId && <span className="text-muted-ink"> · Módulo #{c.courseModuleId}</span>}
                          <button type="button" className="ml-2 btn-secondary" onClick={() =>
                            setExpandedClassId((current) => current === c.id ? null : c.id)}>
                            {expandedClassId === c.id ? "Ocultar UCs" : "Ver UCs da turma"}
                          </button>
                          {admin && <button type="button" className="ml-2 text-sky-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                            onClick={() => setEditingClass({ id: c.id, code: c.code || "", name: c.name, shiftId: c.shiftId == null ? "" : String(c.shiftId) })}>Editar</button>}
                        </div>
                        {expandedClassId === c.id && <div className="basis-full rounded-panel border border-line p-3 space-y-2 text-sm" aria-live="polite">
                          {classUnitsError && <Notice message={classUnitsError} />}
                          {!classUnits && !classUnitsError && <p className="muted">Carregando UCs da turma…</p>}
                          {classUnits?.legacyWithoutModule && <p className="muted">Turma anterior sem módulo vinculado. Atribuições e reservas existentes permanecem válidas.</p>}
                          {classUnits && !classUnits.legacyWithoutModule && <>
                            <p className="font-medium text-ink">Carga horária informada: presencial {classUnits.presentialHours} h · EAD {classUnits.eadHours} h
                              {classUnits.unitsWithoutHours > 0 && ` · ${classUnits.unitsWithoutHours} UC(s) sem CH informada`}</p>
                            {classUnits.units.map((unit) => <p key={unit.curricularUnitId} className="text-muted-ink">
                              {unit.code} · {unit.name} · {unit.deliveryMode === "Ead" ?
                                `EAD (${unit.eadScheduleMode === "HorarioDefinido" ? "encontros on-line com horário definido" : "sem horário fixo"})` : "Presencial"}
                              · CH {unit.plannedHours == null ? "não informada" : `${unit.plannedHours} h`}
                              {unit.resources.length > 0 && ` · Recursos: ${unit.resources.map((resource) => resource.name).join(", ")}`}
                              {unit.teacherId && ` · Instrutor: ${data.teachers.find((teacher) => teacher.id === unit.teacherId)?.displayName ?? "Responsável registrado"}`}
                            </p>)}
                          </>}
                        </div>}
                        </div>
                      ))
                  ) : (
                    <span className="text-xs text-slate-400">Sem turmas</span>
                  )}
                </div>
                {editingClass && data.classes.some((c) => c.id === editingClass.id && c.semesterId === s.id) &&
                  <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (event) => {
                    event.preventDefault(); setError("");
                    try {
                      await put(`/classes/${editingClass.id}`, { name: editingClass.name, code: editingClass.code, shiftId: editingClass.shiftId ? Number(editingClass.shiftId) : null });
                      await reload(); setEditingClass(null); setSuccess("Turma atualizada.");
                    } catch (reason) { setError(resultMessage(reason)); }
                  }}>
                    <input className="field !w-28" aria-label="Código da turma" maxLength={30}
                      value={editingClass.code} onChange={(event) => setEditingClass({ ...editingClass, code: event.target.value })} />
                    <input className="field !w-48" aria-label="Nome da turma" required maxLength={100}
                      value={editingClass.name} onChange={(event) => setEditingClass({ ...editingClass, name: event.target.value })} />
                    <select className="field !w-48" aria-label="Turno da turma" required value={editingClass.shiftId} onChange={(event) => setEditingClass({ ...editingClass, shiftId: event.target.value })}>
                      <option value="">Selecione o turno</option>
                      {data.shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}
                    </select>
                    <button className="btn-primary" type="submit">Salvar</button>
                    <button className="btn-secondary" type="button" onClick={() => setEditingClass(null)}>Cancelar</button>
                  </form>}
              </div>
            ))
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between">
            <h3 className="section-title">Disciplinas atribuídas</h3>
            <span className="text-xs text-slate-400">
              {data.assignments.length} atribuições
            </span>
          </div>
          {data.assignments.length === 0 ? (
            <Empty text="Cadastre uma disciplina para gerar a grade." />
          ) : (
            <div>
              {data.assignments.map((a) => (
                <div
                  key={a.id}
                  className="p-4 border-b border-slate-100 last:border-0 flex items-start gap-3"
                >
                  <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
                    <Users size={17} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{a.disciplineName}</p>
                    <p className="text-xs text-slate-600 mt-1">Turma: {data.classes.find((c) => c.id === a.classGroupId)?.name ?? "Não identificada"}</p>
                    <p className="text-xs text-slate-600">Instrutor: {data.teachers.find((t) => t.id === a.teacherId)?.displayName || "Não identificado"}</p>
                    <p className="text-xs text-slate-600">UC: {a.curricularUnitId ? a.disciplineName : "Não vinculada"}</p>
                    <p className="text-xs text-slate-600">Dia: {a.weekday === null ? "Não definido" : weekdays[a.weekday] ?? "Não identificado"} · Turno da atribuição: {data.shifts.find((shift) => shift.id === a.preferredShiftId)?.name ?? "Não definido"}</p>
                    <Badge status={a.endedAtUtc ? "Inativa" : "Ativa"} />
                    <p className="text-xs text-sky-700 mt-1">
                      {a.meetingsPerWeek} turno(s)/semana{" "}
                      {a.lessonPlanLink && (
                        <>
                          •{" "}
                          <a
                            className="underline"
                            href={a.lessonPlanLink}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Plano de ensino
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
