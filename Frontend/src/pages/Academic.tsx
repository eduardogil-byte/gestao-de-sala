import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Plus,
  Users,
  AlertTriangle,
  Search,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { useData } from "../lib/data";
import { post, put, read } from "../lib/api";
import { dateBR, resultMessage } from "../lib/utils";
import { NeedFields, defaultNeed } from "../components/NeedFields";
import { semesterDates } from "../lib/semesterDates";
import {
  Card,
  Badge,
  Empty,
  Field,
  Notice,
  SubmitButton,
  Title,
  Modal,
  useConfirmation,
} from "../components/UI";
import type { Course, CourseModule, CurricularUnit, Need, User } from "../types";

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
type UnitResource = { resourceCatalogItemId: number; name: string; category: string; quantity: number };
type UnitOffer = { curricularUnitId: number; deliveryMode: "Presencial" | "Ead";
  eadScheduleMode: "SemHorarioFixo" | "HorarioDefinido" | null };
type ClassUnits = { legacyWithoutModule: boolean; presentialHours: number; eadHours: number;
  links?: { assignments: number; bookings: number; occupations: number; plans: number } | null;
  previousUnits?: { curricularUnitId: number; code: string; name: string }[];
  unitsWithoutHours: number; units: (UnitOffer & { code: string; name: string; plannedHours: number | null;
    resources: UnitResource[]; teacherId: string | null })[] };
type EligibleTeacher = { teacherId: string; displayName: string };
type ShiftPreview = { classId: number; currentShiftId: number | null; currentShiftName: string | null;
  shiftId: number; shiftName: string; links: { label: string; count: number }[]; previewToken: string };

export function Academic({ user, onPlanning }: { user: User; onPlanning?: () => void }) {
  const admin = user.roles.includes("Admin");
  const confirm = useConfirmation();
  const createBaseline = useRef("");
  const { data, reload } = useData();
  const [tab, setTab] = useState<"classes" | "semesters">("classes");
  const [query, setQuery] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    filtersRef.current?.querySelector("select")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!filtersRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setFiltersOpen(false); filtersButtonRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [filtersOpen]);
  const [createModal, setCreateModal] = useState<"class" | "semester" | null>(null);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [term, setTerm] = useState(new Date().getMonth() < 6 ? 1 : 2);
  const [semester, setSemester] = useState(() => semesterDates(year, term));
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
  const [classModuleName, setClassModuleName] = useState("");
  const [unitSuccess, setUnitSuccess] = useState<{ id: number; message: string } | null>(null);
  const [assignmentClassId, setAssignmentClassId] = useState("");
  const [assignmentUnitId, setAssignmentUnitId] = useState("");
  const [assignmentTeacherId, setAssignmentTeacherId] = useState("");
  const [offeredUnits, setOfferedUnits] = useState<ClassUnits | null>(null);
  const [eligibleTeachers, setEligibleTeachers] = useState<EligibleTeacher[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [offeringError, setOfferingError] = useState("");
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicError, setAcademicError] = useState("");
  const [editingClass, setEditingClass] = useState<{ id: number; code: string; name: string; shiftId: string; courseId: string; courseModuleId: string } | null>(null);
  const editingOriginal = data.classes.find((item) => item.id === editingClass?.id);
  const editingCurriculumChanged = !!editingClass && (
    editingClass.courseId !== String(editingOriginal?.courseId ?? "") ||
    editingClass.courseModuleId !== String(editingOriginal?.courseModuleId ?? ""));
  const [editModules, setEditModules] = useState<CourseModule[]>([]);
  const [editModulesBusy, setEditModulesBusy] = useState(false);
  const [editModulesError, setEditModulesError] = useState("");
  useEffect(() => {
    setEditModules([]); setEditModulesError(""); setEditModulesBusy(false);
    if (!editingClass?.courseId) return;
    let active = true;
    setEditModulesBusy(true);
    read<CourseModule[]>(`/courses/${editingClass.courseId}/modules`)
      .then((items) => { if (active) setEditModules(items); })
      .catch((reason) => { if (active) setEditModulesError(resultMessage(reason)); })
      .finally(() => { if (active) setEditModulesBusy(false); });
    return () => { active = false; };
  }, [editingClass?.id, editingClass?.courseId]);
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
  const [shiftPreview, setShiftPreview] = useState<ShiftPreview | null>(null);
  const [shiftError, setShiftError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    let active = true;
    read<Course[]>("/courses").then((items) => { if (active) setCourses(items); })
      .catch((cause) => { if (active) setAcademicError(resultMessage(cause)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    setClassUnits(null); setClassUnitsError("");
    setUnitSuccess(null);
    setClassModuleName("");
    if (expandedClassId === null) return;
    let active = true;
    const group = data.classes.find((item) => item.id === expandedClassId);
    if (group?.courseId && group.courseModuleId) {
      setClassModuleName("Carregando…");
      read<CourseModule[]>(`/courses/${group.courseId}/modules`)
        .then((items) => { if (active) setClassModuleName(items.find((item) => item.id === group.courseModuleId)?.name ?? "Não encontrado"); })
        .catch(() => { if (active) setClassModuleName("Não foi possível carregar"); });
    }
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
    setEligibleLoading(false);
    if (!assignmentClassId || !assignmentUnitId || !admin) return;
    let active = true;
    setEligibleLoading(true);
    read<EligibleTeacher[]>(`/classes/${assignmentClassId}/units/${assignmentUnitId}/eligible-teachers`)
      .then((value) => { if (active) setEligibleTeachers(value); })
      .catch((cause) => { if (active) setOfferingError(resultMessage(cause)); })
      .finally(() => { if (active) setEligibleLoading(false); });
    return () => { active = false; };
  }, [assignmentClassId, assignmentUnitId, admin]);
  async function assignOfferedUnit() {
    if (!assignmentClassId || !assignmentUnitId || !assignmentTeacherId || action) return;
    setAction("offered-unit"); setOfferingError(""); setSuccess(""); setUnitSuccess(null);
    try {
      await put(`/classes/${assignmentClassId}/units/${assignmentUnitId}/teacher`, { teacherId: assignmentTeacherId });
      const updated = await read<ClassUnits>(`/classes/${assignmentClassId}/units`);
      setOfferedUnits(updated);
      if (expandedClassId === Number(assignmentClassId)) setClassUnits(updated);
      const teacherName = eligibleTeachers.find((item) => item.teacherId === assignmentTeacherId)?.displayName ?? "Instrutor";
      setUnitSuccess({ id: Number(assignmentUnitId), message: `${teacherName} definido como responsável.` });
      setAssignmentTeacherId("");
      setAssignmentUnitId("");
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
  async function saveClassEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingClass || action) return;
    const original = data.classes.find((item) => item.id === editingClass.id);
    const curriculumChanged = editingClass.courseId !== String(original?.courseId ?? "") ||
      editingClass.courseModuleId !== String(original?.courseModuleId ?? "");
    if (curriculumChanged && editingClass.shiftId !== String(original?.shiftId ?? "")) {
      setError("Altere o turno separadamente do curso e módulo."); return;
    }
    if (curriculumChanged && !await confirm({ title: "Confirmar mudança de curso ou módulo?",
      message: `${classUnits?.links ? `Esta turma possui ${classUnits.links.bookings} reserva(s), ${classUnits.links.assignments} atribuição(ões), ${classUnits.links.occupations} ocupação(ões) e ${classUnits.links.plans} planejamento(s). ` : "A turma pode possuir reservas e atribuições. "}Todos esses registros e as UCs anteriores serão preservados. A lista atual passará a usar as UCs e capacidades do novo módulo. Novas UCs entram como presenciais e precisam de instrutor responsável. Deseja continuar?`,
      confirmLabel: "Confirmar alteração" })) return;
    setAction("edit-class"); setError(""); setSuccess("");
    try {
      const target = editingClass.shiftId ? Number(editingClass.shiftId) : null;
      if (target !== null && target !== original?.shiftId) {
        const preview = await read<ShiftPreview>(`/classes/${editingClass.id}/shift-change?shiftId=${target}`);
        setShiftError(""); setShiftPreview(preview);
      } else {
        await put(`/classes/${editingClass.id}`, { name: editingClass.name, code: editingClass.code, shiftId: target,
          ...(curriculumChanged ? { courseId: Number(editingClass.courseId), courseModuleId: Number(editingClass.courseModuleId), curriculumChangeConfirmed: true } : {}) });
        await reload();
        if (curriculumChanged) {
          setUnitSuccess(null); setAssignmentUnitId(""); setAssignmentTeacherId("");
          const updated = await read<ClassUnits>(`/classes/${editingClass.id}/units`);
          setClassUnits(updated); setOfferedUnits(updated);
          setClassModuleName(editModules.find((item) => item.id === Number(editingClass.courseModuleId))?.name ?? "Não vinculado");
        }
        setEditingClass(null); setSuccess("Turma atualizada.");
      }
    } catch (reason) { setError(resultMessage(reason)); }
    finally { setAction(""); }
  }
  async function confirmShiftChange() {
    if (!shiftPreview || action) return;
    setAction("change-shift"); setShiftError("");
    try {
      await put(`/classes/${shiftPreview.classId}/shift-change`, {
        shiftId: shiftPreview.shiftId, confirmed: true, previewToken: shiftPreview.previewToken,
      });
      await reload(); setShiftPreview(null); setEditingClass(null);
      setSuccess("Turno oficial atualizado. Os registros vinculados foram preservados.");
    } catch (reason) { setShiftError(resultMessage(reason)); }
    finally { setAction(""); }
  }
  const discardChanges = (dirty: boolean) => !dirty ? Promise.resolve(true) : confirm({
    title: "Descartar alterações?", message: "As alterações não salvas serão perdidas.", confirmLabel: "Descartar", danger: true,
  });
  const openCreate = (kind: "class" | "semester") => {
    setError("");
    if (kind === "class") {
      const next = { ...cls, semesterId: semesterFilter || cls.semesterId };
      setCls(next); createBaseline.current = JSON.stringify({ cls: next, unitOfferings });
    } else {
      const next = semesterDates(year, term);
      setSemester(next); createBaseline.current = JSON.stringify({ semester: next, year, term });
    }
    setCreateModal(kind);
  };
  const closeCreate = async () => {
    if (action || !createModal) return;
    const current = createModal === "class" ? { cls, unitOfferings } : { semester, year, term };
    if (!await discardChanges(JSON.stringify(current) !== createBaseline.current)) return;
    const initial = JSON.parse(createBaseline.current);
    if (createModal === "class") { setCls(initial.cls); setUnitOfferings(initial.unitOfferings); }
    else { setSemester(initial.semester); setYear(initial.year); setTerm(initial.term); }
    setCreateModal(null); setError("");
  };
  const editingDirty = () => {
    const original = data.classes.find((item) => item.id === editingClass?.id);
    return !!editingClass && !!original && (editingClass.name !== original.name || editingClass.code !== (original.code || "") || editingClass.shiftId !== (original.shiftId == null ? "" : String(original.shiftId)) ||
      editingClass.courseId !== String(original.courseId ?? "") || editingClass.courseModuleId !== String(original.courseModuleId ?? ""));
  };
  const cancelEditing = async () => { if (!action && await discardChanges(editingDirty())) { setEditingClass(null); setError(""); } };
  const closeClass = async () => {
    if (action || !await discardChanges(editingDirty() || !!assignmentTeacherId)) return false;
    setExpandedClassId(null); setAssignmentClassId(""); setEditingClass(null); return true;
  };
  const semesterForm = (<div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handle("/semesters", semester, "semester", () =>
                  { setSemester((s) => ({ ...s, name: "" })); setCreateModal(null); },
                );
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ano"><input className="field" type="number" required min={1900} max={9998} value={year}
                  onChange={(event) => { const value = Number(event.target.value); setYear(value);
                    if (value >= 1900 && value <= 9998) setSemester(semesterDates(value, term)); }} /></Field>
                <Field label="Semestre"><select className="field" value={term} onChange={(event) => {
                  const value = Number(event.target.value); setTerm(value);
                  if (year >= 1900 && year <= 9998) setSemester(semesterDates(year, value));
                }}><option value={1}>1º semestre</option><option value={2}>2º semestre</option></select></Field>
              </div>
              <p className="text-sm text-ink">{semester.name} · {dateBR(semester.startDate)} a {dateBR(semester.endDate)}</p>
              <details className="rounded-lg border border-line p-3" onInvalidCapture={(event) => { event.currentTarget.open = true; }}>
              <summary className="cursor-pointer font-medium text-ink">Ajustar dados sugeridos</summary>
              <div className="space-y-3 mt-3">
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
              </div></details>
              <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => void closeCreate()}>Cancelar</button>
              <SubmitButton busy={action === "semester"}>
                <Plus size={16} />
                Adicionar semestre
              </SubmitButton>
              </div>
            </form>
          </div>);
  const classForm = (<div>
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
                  () => { setCls({ ...cls, name: "" }); setCreateModal(null); },
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
              {cls.courseModuleId && !academicLoading && !academicError && <section aria-label="UCs do módulo" className="space-y-3">
                <h4 className="font-semibold text-ink">UCs do módulo</h4>
                {units.length === 0 && <p className="muted">Este módulo ainda não possui UCs cadastradas.</p>}
                {units.map((unit) => {
                  const offer = unitOfferings.find((item) => item.curricularUnitId === unit.id);
                  return <details key={unit.id} className="rounded-panel border border-line p-3 space-y-2">
                    <summary className="cursor-pointer font-medium text-ink">{unit.code} · {unit.name}</summary>
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
                  </details>;
                })}
              </section>}
              <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => void closeCreate()}>Cancelar</button>
              <SubmitButton busy={action === "class"} disabled={academicLoading || Boolean(academicError) ||
                !cls.courseId || !cls.courseModuleId || unitOfferings.length !== units.length}>
                <Plus size={16} />
                Adicionar turma
              </SubmitButton>
              </div>
            </form>
          </div>);
  const assignmentForm = (<form className="border-t border-line pt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); void assignOfferedUnit(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Instrutor responsável"><select className="field" value={assignmentTeacherId} disabled={eligibleLoading || !!action}
              onChange={(event) => setAssignmentTeacherId(event.target.value)}>
              <option value="">Selecione o instrutor</option>{eligibleTeachers.map((item) =>
                <option key={item.teacherId} value={item.teacherId}>{item.displayName}</option>)}</select></Field>
          </div>
          <p className="text-sm text-muted-ink">Selecione quem ministrará esta UC nesta turma. A habilitação é cadastrada no perfil do instrutor.</p>
          {offeredUnits?.legacyWithoutModule && <Notice type="info" message="Turma anterior sem módulo vinculado; suas atribuições existentes permanecem disponíveis abaixo." />}
          {eligibleLoading && <p role="status" className="muted">Carregando instrutores…</p>}
          {assignmentUnitId && !eligibleLoading && eligibleTeachers.length === 0 && !offeringError && <p className="muted">Nenhum instrutor habilitado. Cadastre a habilitação para este curso e esta UC no perfil do instrutor.</p>}
          {assignmentUnitId && offeredUnits?.units.find((item) => item.curricularUnitId === Number(assignmentUnitId))?.teacherId &&
            <p className="muted">Responsável atual: {data.teachers.find((teacher) => teacher.id === offeredUnits.units.find((item) =>
              item.curricularUnitId === Number(assignmentUnitId))?.teacherId)?.displayName ?? "Instrutor cadastrado"}</p>}
          {offeringError && <Notice message={offeringError} />}
          <div className="flex flex-wrap gap-2">
            <SubmitButton busy={action === "offered-unit"} disabled={!assignmentTeacherId || eligibleLoading}>Salvar</SubmitButton>
            <button type="button" className="btn-secondary" disabled={!!action} onClick={async () => {
              if (await discardChanges(!!assignmentTeacherId)) { setAssignmentUnitId(""); setAssignmentTeacherId(""); setOfferingError(""); }
            }}>Cancelar</button>
          </div>
        </form>);
  const legacyForm = (<Card className="p-5 mb-6">
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
        </Card>);
  const legacyHistory = (<Card className="overflow-hidden">
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
        </Card>);
  const selectedClass = data.classes.find((item) => item.id === expandedClassId);
  const filterCount = Number(!!semesterFilter) + Number(!!shiftFilter) + Number(!!courseFilter);
  const visibleClasses = data.classes.filter((item) => (!semesterFilter || item.semesterId === Number(semesterFilter)) &&
    (!shiftFilter || item.shiftId === Number(shiftFilter)) && (!courseFilter || item.courseId === Number(courseFilter)) &&
    `${item.code ?? ""} ${item.name}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));
  const openClass = (id: number) => { setExpandedClassId(id); setAssignmentClassId(String(id)); setAssignmentUnitId(""); setEditingClass(null); setOfferingError(""); setError(""); };
  const tabs = [{ key: "classes", label: "Turmas" }, { key: "semesters", label: "Semestres" }] as const;
  return <div className="space-y-5">
    <Title title="Turmas e semestres" />
    {success && !selectedClass && <Notice type="success" message={success} onClose={() => setSuccess("")} />}
    {error && !createModal && !selectedClass && <Notice message={error} onClose={() => setError("")} />}
    <div role="tablist" aria-label="Turmas e semestres" className="flex gap-2 border-b border-line pb-3">
      {tabs.map((item, index) => <button type="button" role="tab" id={`academic-tab-${item.key}`} aria-controls={`academic-panel-${item.key}`} aria-selected={tab === item.key} tabIndex={tab === item.key ? 0 : -1} key={item.key}
        className={tab === item.key ? "btn-primary" : "btn-secondary"} onClick={() => setTab(item.key)} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
          setTab(tabs[next].key); document.getElementById(`academic-tab-${tabs[next].key}`)?.focus();
        }}>{item.label}</button>)}
    </div>
    <section role="tabpanel" id="academic-panel-classes" aria-labelledby="academic-tab-classes" hidden={tab !== "classes"}>
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Turmas cadastradas</h2>
          {admin && <button type="button" className="btn-primary" onClick={() => openCreate("class")}>Nova turma</button>}
        </div>
        <section aria-label="Filtros de turmas" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="relative min-w-0 flex-1"><span className="field-label">Buscar turma</span>
            <Search size={17} aria-hidden="true" className="absolute left-3 bottom-3 text-muted-ink" />
            <input className="field !pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou código" />
          </label>
          <div ref={filtersRef} className="relative sm:shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFiltersOpen(false); }}>
            <button ref={filtersButtonRef} type="button" className="btn-secondary w-full sm:w-auto" aria-expanded={filtersOpen} aria-controls="class-filters-panel" onClick={() => setFiltersOpen(!filtersOpen)}>
              <SlidersHorizontal size={17} aria-hidden="true" />Filtros
              {filterCount > 0 && <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink">{filterCount}<span className="sr-only"> selecionados</span></span>}
              <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </button>
            {filtersOpen && <div id="class-filters-panel" role="region" aria-label="Opções de filtro" className="absolute right-0 top-full z-20 mt-2 w-full space-y-4 rounded-panel border border-line bg-surface p-4 shadow-soft sm:w-80">
              <Field label="Filtrar semestre"><select className="field" value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}><option value="">Todos os semestres</option>{data.semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Filtrar turno"><select className="field" value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)}><option value="">Todos os turnos</option>{data.shifts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Filtrar curso"><select className="field" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="">Todos os cursos</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <button type="button" className="btn-quiet" disabled={!filterCount} onClick={() => { setSemesterFilter(""); setShiftFilter(""); setCourseFilter(""); }}>Limpar filtros</button>
                <button type="button" className="btn-primary" onClick={() => { setFiltersOpen(false); filtersButtonRef.current?.focus(); }}>Concluir</button>
              </div>
            </div>}
          </div>
        </section>
        {!visibleClasses.length ? <Empty title="Nenhuma turma encontrada" text="Cadastre uma turma ou ajuste os filtros." /> : <div role="region" aria-label="Lista de turmas cadastradas" tabIndex={0} className="max-h-[min(60dvh,28rem)] overflow-auto overscroll-contain rounded-panel border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead><tr>{["Turma", "Curso", "Semestre", "Turno", "Alunos"].map((label) => <th key={label} scope="col" className={`table-head sticky top-0 z-10 p-3 ${label === "Alunos" ? "text-right" : ""}`}>{label}</th>)}</tr></thead>
            <tbody>{visibleClasses.map((item) => <tr key={item.id} className="cursor-pointer border-t border-line text-ink transition-colors hover:bg-canvas focus-within:bg-canvas" onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) openClass(item.id); }}>
              <td className="p-3"><button type="button" aria-label={`Abrir informações de ${item.name}`} className="rounded text-left font-semibold underline decoration-line underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500" onClick={() => openClass(item.id)}>{item.name}</button><span className="block text-xs text-muted-ink">{item.code || "Código não informado"}</span></td>
              <td className="p-3 text-muted-ink">{courses.find((row) => row.id === item.courseId)?.name ?? "Curso não vinculado"}</td>
              <td className="p-3 text-muted-ink">{data.semesters.find((row) => row.id === item.semesterId)?.name ?? "Semestre não informado"}</td>
              <td className="p-3 text-muted-ink">{data.shifts.find((row) => row.id === item.shiftId)?.name ?? "Turno pendente"}</td>
              <td className="p-3 text-right tabular-nums">{item.students}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Card>
      {selectedClass && <Modal title={selectedClass.name} width="max-w-3xl" onClose={() => void closeClass()}><div className="space-y-6">
        {error && !editingClass && <Notice message={error} />}{success && <Notice type="success" message={success} />}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-ink">Código: {selectedClass.code || "Não informado"}</p>
          <div className="flex flex-wrap gap-2">{admin && <button type="button" className="btn-secondary" disabled={!!action} onClick={() => setEditingClass({ id: selectedClass.id, code: selectedClass.code || "", name: selectedClass.name, shiftId: selectedClass.shiftId == null ? "" : String(selectedClass.shiftId), courseId: String(selectedClass.courseId ?? ""), courseModuleId: String(selectedClass.courseModuleId ?? "") })}>Editar turma</button>}
            {onPlanning && <button type="button" className="btn-secondary" disabled={!!action} onClick={async () => { if (await closeClass()) onPlanning(); }}>Ir para Planejamento</button>}
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-4 rounded-panel border border-line bg-canvas p-4 text-sm sm:grid-cols-3">
          <div className="min-w-0 sm:col-span-3"><dt className="text-muted-ink">Curso</dt><dd className="break-words font-medium text-ink">{courses.find((item) => item.id === selectedClass.courseId)?.name ?? "Não vinculado"}</dd></div>
          <div className="min-w-0 sm:col-span-3"><dt className="text-muted-ink">Módulo</dt><dd className="break-words font-medium text-ink">{classModuleName || "Não vinculado"}</dd></div>
          <div><dt className="text-muted-ink">Semestre</dt><dd className="font-medium text-ink">{data.semesters.find((item) => item.id === selectedClass.semesterId)?.name ?? "Não informado"}</dd></div>
          <div><dt className="text-muted-ink">Turno</dt><dd className="font-medium text-ink">{data.shifts.find((item) => item.id === selectedClass.shiftId)?.name ?? "Não informado"}</dd></div>
          <div><dt className="text-muted-ink">Alunos</dt><dd className="font-medium tabular-nums text-ink">{selectedClass.students}</dd></div>
        </dl>
        <section aria-label="UCs e instrutores" className="space-y-4">
        <div className="space-y-1"><h3 className="font-semibold text-ink">UCs e instrutores</h3>
          {admin && classUnits && !classUnits.legacyWithoutModule && classUnits.units.length > 0 && <p className="text-sm text-muted-ink">
            {classUnits.units.filter((unit) => !unit.teacherId).length > 0
              ? `${classUnits.units.filter((unit) => !unit.teacherId).length} de ${classUnits.units.length} UCs sem instrutor definido.`
              : "Todas as UCs possuem instrutor definido."}
          </p>}
        </div>
        {classUnitsError && <Notice message={classUnitsError} />}
                          {!classUnits && !classUnitsError && <p className="muted">Carregando UCs da turma…</p>}
                          {classUnits?.legacyWithoutModule && <p className="muted">Turma anterior sem módulo vinculado. Atribuições e reservas existentes permanecem válidas.</p>}
                          {classUnits && !classUnits.legacyWithoutModule && <>
                            <p className="text-sm text-muted-ink">Carga horária informada: presencial {classUnits.presentialHours} h · EAD {classUnits.eadHours} h
                              {classUnits.unitsWithoutHours > 0 && ` · ${classUnits.unitsWithoutHours} UC(s) sem CH informada`}</p>
                            {classUnits.units.length === 0 && <p className="text-sm text-muted-ink">Nenhuma UC ofertada para esta turma.</p>}
                            {classUnits.units.map((unit) => <article key={unit.curricularUnitId} className="rounded-panel border border-line p-4 space-y-4">
                              <div className="min-w-0 space-y-1"><h4 className="break-words font-semibold text-ink">{unit.name}</h4>
                              <p className="break-words text-sm text-muted-ink">{unit.code} · {unit.deliveryMode === "Ead" ?
                                `EAD (${unit.eadScheduleMode === "HorarioDefinido" ? "encontros on-line com horário definido" : "sem horário fixo"})` : "Presencial"}
                              · CH {unit.plannedHours == null ? "não informada" : `${unit.plannedHours} h`}
                            </p></div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0"><p className="text-sm text-muted-ink">Instrutor responsável</p><p className="break-words font-medium text-ink">{unit.teacherId
                                ? data.teachers.find((teacher) => teacher.id === unit.teacherId)?.displayName ?? "Responsável registrado"
                                : admin ? "Sem instrutor definido" : "Não informado"}</p></div>
                            {admin && assignmentUnitId !== String(unit.curricularUnitId) && <button type="button" className="btn-secondary shrink-0" disabled={!!action} onClick={async () => { if (!await discardChanges(!!assignmentTeacherId)) return; setOfferingError(""); setAssignmentUnitId(String(unit.curricularUnitId)); }}>{unit.teacherId ? "Alterar instrutor" : "Definir instrutor"}</button>}
                            </div>
                            {unitSuccess?.id === unit.curricularUnitId && <p role="status" className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink">{unitSuccess.message}</p>}
                            {admin && assignmentUnitId === String(unit.curricularUnitId) && <section aria-label={`Definir instrutor de ${unit.name}`}>{assignmentForm}</section>}
                            {unit.resources.length > 0 && <details className="border-t border-line pt-3 text-sm">
                              <summary className="min-h-11 cursor-pointer rounded py-3 font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500">Ver recursos ({unit.resources.length})</summary>
                              <ul className="space-y-2 pt-2 text-muted-ink">{unit.resources.map((resource) => <li key={resource.resourceCatalogItemId} className="break-words">{resource.name} · Quantidade: {resource.quantity}</li>)}</ul>
                            </details>}
                            </article>)}
                          </>}
        {(classUnits?.previousUnits?.length ?? 0) > 0 && <details className="rounded-panel border border-line p-4 text-sm">
          <summary className="cursor-pointer font-medium text-ink">UCs anteriores preservadas ({classUnits!.previousUnits!.length})</summary>
          <p className="mt-3 text-muted-ink">Estas UCs e suas capacidades continuam cadastradas. Reservas, atribuições e planejamentos anteriores mantêm seus vínculos originais.</p>
          <ul className="mt-3 space-y-2 text-ink">{classUnits!.previousUnits!.map((unit) => <li key={unit.curricularUnitId} className="break-words">{unit.code} · {unit.name}</li>)}</ul>
        </details>}
        </section>
      </div></Modal>}
      <details className="mt-5 rounded-panel border border-line bg-surface p-4" onToggle={(event) => setLegacyOpen(event.currentTarget.open)}><summary className="cursor-pointer font-semibold text-ink">Registros anteriores</summary>{legacyOpen && <div className="mt-4 space-y-4">{admin && legacyForm}{legacyHistory}</div>}</details>
    </section>
    <section role="tabpanel" id="academic-panel-semesters" aria-labelledby="academic-tab-semesters" hidden={tab !== "semesters"}>
      <Card className="p-4 sm:p-5 space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="section-title">Semestres cadastrados</h2>{admin && <button type="button" className="btn-primary" onClick={() => openCreate("semester")}>Novo semestre</button>}</div>
        {!data.semesters.length ? <Empty text="Comece cadastrando um semestre." /> : <ul className="space-y-3">{data.semesters.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4"><div><strong className="text-ink">{item.name}</strong><p className="muted">{dateBR(item.startDate)} a {dateBR(item.endDate)} · {data.classes.filter((row) => row.semesterId === item.id).length} turmas</p></div>
        </li>)}</ul>}
      </Card>
    </section>
        {admin && editingClass && <Modal title="Editar turma" onClose={() => void cancelEditing()} width="max-w-2xl">
          {error && <Notice message={error} />}
          <form className="space-y-4" onSubmit={(event) => void saveClassEdit(event)}>
                    <fieldset disabled={!!action} className="space-y-3">

                    <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome da turma" className="sm:col-span-2"><input className="field" aria-label="Nome da turma" required maxLength={100}
                      value={editingClass.name} onChange={(event) => setEditingClass({ ...editingClass, name: event.target.value })} /></Field>
                    <Field label="Código da turma"><input className="field" aria-label="Código da turma" maxLength={30}
                      value={editingClass.code} onChange={(event) => setEditingClass({ ...editingClass, code: event.target.value })} /></Field>
                    <Field label="Turno da turma"><select className="field" aria-label="Turno da turma" required value={editingClass.shiftId} onChange={(event) => setEditingClass({ ...editingClass, shiftId: event.target.value })}>
                      <option value="">Selecione o turno</option>
                      {data.shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}
                    </select></Field>
                    <Field label="Curso" className="sm:col-span-2"><select className="field" value={editingClass.courseId}
                      onChange={(event) => setEditingClass({ ...editingClass, courseId: event.target.value, courseModuleId: "" })}>
                      <option value="" disabled={!!data.classes.find((item) => item.id === editingClass.id)?.courseId}>Selecione um curso</option>
                      {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                    </select></Field>
                    <Field label="Módulo" className="sm:col-span-2"><select className="field" value={editingClass.courseModuleId}
                      disabled={!editingClass.courseId || editModulesBusy || !!editModulesError} required={editingCurriculumChanged && !!editingClass.courseId}
                      onChange={(event) => setEditingClass({ ...editingClass, courseModuleId: event.target.value })}>
                      <option value="">{editModulesBusy ? "Carregando módulos…" : "Selecione um módulo"}</option>
                      {editModules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                    </select></Field></div>
                    {editModulesError && <Notice message={editModulesError} />}
                    {editingClass.courseId && !editModulesBusy && !editModulesError && editModules.length === 0 && <p role="status" className="text-sm text-muted-ink">Este curso não possui módulos cadastrados.</p>}
                    {editingCurriculumChanged &&
                      <div role="status" className="rounded-panel border border-line bg-canvas p-4 text-sm text-ink">
                        <p className="font-semibold">Atenção à mudança de curso ou módulo</p>
                        <p>As UCs e capacidades exibidas passarão a ser as do novo módulo. As UCs anteriores, seus instrutores e todo o histórico serão preservados. Novas UCs entram como presenciais e precisam de instrutor responsável.</p>
                        <p className="mt-2 font-medium">{classUnits?.links
                          ? `Vínculos existentes: ${classUnits.links.bookings} reserva(s), ${classUnits.links.assignments} atribuição(ões), ${classUnits.links.occupations} ocupação(ões) e ${classUnits.links.plans} planejamento(s).`
                          : "Reservas, atribuições e planejamentos existentes continuarão com seus dados atuais."}</p>
                        <p>A alteração não remaneja nem cancela aulas ou reservas.</p>
                      </div>}
                    <div className="flex flex-wrap justify-end gap-2">
                    <button className="btn-secondary" type="button" onClick={() => void cancelEditing()}>Cancelar</button>
                    <SubmitButton busy={action === "edit-class"} disabled={editModulesBusy || !!editModulesError}>Salvar</SubmitButton>
                    </div>
                    </fieldset>
                  </form>
        </Modal>}

    {admin && shiftPreview && <Modal title="Confirmar mudança de turno" width="max-w-xl" descriptionId="class-shift-warning" onClose={() => { if (!action) setShiftPreview(null); }}>
      <div className="space-y-4">
        {shiftError && <Notice message={shiftError} />}
        <div className="flex items-start gap-3"><AlertTriangle size={24} className="shrink-0 text-[var(--color-remove-ink)]" aria-hidden="true" /><p id="class-shift-warning" className="text-sm text-ink">A mudança será de <strong>{shiftPreview.currentShiftName ?? "Não definido"}</strong> para <strong>{shiftPreview.shiftName}</strong>.</p></div>
        {shiftPreview.links.length ? <div className="rounded-panel border border-line p-4 space-y-2"><h3 className="font-semibold text-ink">Vínculos que impediam a alteração direta</h3><ul className="space-y-2 text-sm">{shiftPreview.links.map((link) => <li key={link.label} className="flex justify-between gap-3 text-ink"><span>{link.label}</span><strong>{link.count}</strong></li>)}</ul><p className="text-xs text-muted-ink">A contagem inclui registros históricos, encerrados ou cancelados.</p></div> : <p className="text-sm text-muted-ink">Nenhum vínculo impeditivo encontrado.</p>}
        <div className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink space-y-2"><p><strong>Somente o turno oficial da turma será alterado.</strong> Nome e código não serão alterados nesta confirmação.</p><p>As atribuições, reservas, ocupações e planejamentos continuarão com seus dados e horários atuais. A troca não remaneja aulas nem reserva ambientes no novo turno.</p></div>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" disabled={!!action} onClick={() => setShiftPreview(null)}>Cancelar</button><button type="button" className="btn-primary" disabled={!!action} onClick={() => void confirmShiftChange()}>{action === "change-shift" ? "Alterando…" : "Confirmar turno"}</button></div>
      </div>
    </Modal>}
    {admin && createModal && <Modal title={createModal === "class" ? "Nova turma" : "Novo semestre"} width="max-w-2xl" onClose={() => void closeCreate()}>
      {error && <div className="mb-3"><Notice message={error} /></div>}
      <fieldset disabled={!!action}>{createModal === "class" ? classForm : semesterForm}</fieldset>
    </Modal>}
  </div>;
}
