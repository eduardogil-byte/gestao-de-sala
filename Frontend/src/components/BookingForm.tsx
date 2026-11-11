import { useEffect, useMemo, useState } from "react";
import { post, read } from "../lib/api";
import { localDate, nextDate, resultMessage, dateBR } from "../lib/utils";
import { useData } from "../lib/data";
import { NeedFields, defaultNeed } from "./NeedFields";
import { Checkbox, Field, Notice, SearchableSelect, SubmitButton } from "./UI";
import type { Need, Shift, User } from "../types";

type PedagogicalOption = {
  classGroupId: number; className: string; students: number;
  curricularUnitId: number; unitName: string; weekday: number;
  preferredShiftId: number; qualificationWarning: boolean;
  capabilities: { id: number; description: string }[];
};

const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const asDay = (d: string) => new Date(`${d}T12:00:00`).getDay();
export function firstSelected(date: string, days: number[]) {
  for (let i = 0; i < 7; i++) {
    const candidate = nextDate(date, i);
    if (days.includes(asDay(candidate))) return candidate;
  }
  return date;
}
export function actualDates(from: string, to: string, days: number[]) {
  const found: string[] = [];
  for (let d = from, i = 0; d <= to && i < 367; d = nextDate(d, 1), i++)
    if (days.includes(asDay(d))) found.push(d);
  return found;
}
export function BookingForm({ onCreated, user }: { onCreated: (id: number, qualificationWarning: boolean) => void; user: User }) {
  const { data, reload } = useData();
  const admin = user.roles.includes("Admin");
  const [teacherId, setTeacherId] = useState("");
  const today = localDate(new Date());
  const [date, setDate] = useState(today);
  const [shiftId, setShiftId] = useState("");
  const [reason, setReason] = useState("");
  const [students, setStudents] = useState(25);
  const [recurring, setRecurring] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([asDay(today)]);
  const [repeatUntil, setRepeatUntil] = useState(nextDate(today, 28));
  const [eadDay, setEadDay] = useState("");
  const [perComputer, setPerComputer] = useState(1);
  const [classGroupId, setClassGroupId] = useState("");
  const [pedagogical, setPedagogical] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [capabilityId, setCapabilityId] = useState("");
  const [options, setOptions] = useState<PedagogicalOption[]>([]);
  const [optionsError, setOptionsError] = useState("");
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [lessonPlanLink, setLessonPlanLink] = useState("");
  const [need, setNeed] = useState<Need>(defaultNeed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!pedagogical || (admin && !teacherId)) { setOptions([]); return; }
    setOptionsError("");
    setOptionsBusy(true);
    void read<PedagogicalOption[]>(`/bookings/pedagogical-options${admin ? `?teacherId=${encodeURIComponent(teacherId)}` : ""}`)
      .then(setOptions).catch((e) => setOptionsError(resultMessage(e)))
      .finally(() => setOptionsBusy(false));
  }, [pedagogical, admin, teacherId]);
  const classOptions = options.filter((x) => String(x.classGroupId) === classGroupId);
  const units = classOptions.filter((x, i, all) =>
    all.findIndex((a) => a.curricularUnitId === x.curricularUnitId) === i);
  const selectedUnit = classOptions.find((x) => String(x.curricularUnitId) === unitId);
  const start =
    recurring && weekdays.length ? firstSelected(date, weekdays) : date;
  const dates = useMemo(
    () => (recurring ? actualDates(start, repeatUntil, weekdays) : [date]),
    [recurring, start, repeatUntil, weekdays, date],
  );
  const shift: Shift | undefined =
    data.shifts.find((s) => String(s.id) === shiftId) || data.shifts[0];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!shift) {
      setError("Cadastre ao menos um turno para criar reservas.");
      return;
    }
    if (admin && !teacherId) { setError("Selecione o instrutor responsável."); return; }
    if (recurring && (!dates.length || repeatUntil < start)) {
      setError("Selecione dias e um término válido para a recorrência.");
      return;
    }
    if (pedagogical && (!classGroupId || !unitId || !capabilityId)) {
      setError("Selecione turma, UC e capacidade para a reserva pedagógica.");
      return;
    }
    setBusy(true);
    try {
      const created = await post<{ id: number; qualificationWarning: boolean }>("/bookings", {
        teacherId: admin ? teacherId : null,
        classGroupId: classGroupId ? Number(classGroupId) : null,
        curricularUnitId: pedagogical ? Number(unitId) : null,
        curricularCapabilityId: pedagogical ? Number(capabilityId) : null,
        startsAt: `${start}T${shift.startsAt.slice(0, 8)}`,
        endsAt: `${start}T${shift.endsAt.slice(0, 8)}`,
        students,
        recurrence: recurring ? "Semanal" : "Nenhuma",
        weekdaysMask: recurring
          ? weekdays.reduce((n, d) => n | (1 << d), 0)
          : 0,
        repeatUntil: recurring ? repeatUntil : null,
        recurringEadWeekday: recurring && eadDay !== "" ? Number(eadDay) : null,
        studentsPerComputer: perComputer,
        reason,
        lessonPlanLink: lessonPlanLink || null,
        ...need,
      });
      await reload();
      onCreated(created.id, created.qualificationWarning);
    } catch (err) {
      setError(resultMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Notice message={error} />}
      {admin && <Field label="Instrutor responsável">
        <select className="field" required value={teacherId} onChange={(e) => {
          setTeacherId(e.target.value); setClassGroupId(""); setUnitId(""); setCapabilityId("");
        }}>
          <option value="">Selecione um instrutor</option>
          {data.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}
        </select>
      </Field>}
      <Checkbox label="Vincular ao planejamento pedagógico" checked={pedagogical}
        onChange={(value) => { setPedagogical(value); setClassGroupId(""); setUnitId(""); setCapabilityId(""); }} />
      {pedagogical && optionsBusy && <p className="text-sm text-slate-500">Carregando atribuições...</p>}
      {pedagogical && optionsError && <Notice message={optionsError} />}
      {pedagogical && !optionsBusy && options.length === 0 && !optionsError &&
        <Notice type="info" message="Não há turmas e UCs atribuídas ao seu perfil." />}
      <div className="grid sm:grid-cols-2 gap-3">
        <SearchableSelect label={pedagogical ? "Turma obrigatória" : "Turma (opcional)"}
          value={classGroupId} required={pedagogical}
          onChange={(value) => {
              setClassGroupId(value);
              setUnitId(""); setCapabilityId("");
              const c = data.classes.find(
                (c) => String(c.id) === value,
              );
              if (c) setStudents(c.students);
            }} options={[{ value: "", label: pedagogical ? "Selecione uma turma" : "Sem turma vinculada" },
              ...(pedagogical ? data.classes.filter((c) => options.some((x) => x.classGroupId === c.id)) : data.classes)
                .map((c) => ({ value: String(c.id), label: [c.code, c.name,
                  data.shifts.find((s) => s.id === options.find((x) => x.classGroupId === c.id)?.preferredShiftId)?.name].filter(Boolean).join(" · ") }))]} />
        <Field label="Atividade / justificativa (obrigatória)">
          <input className="field" required maxLength={250} value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Prática de SolidWorks" />
        </Field>
        {pedagogical && <Field label="Unidade curricular">
          <select className="field" required value={unitId} onChange={(e) => {
            setUnitId(e.target.value); setCapabilityId("");
            const assignment = classOptions.find((x) => String(x.curricularUnitId) === e.target.value);
            if (assignment?.preferredShiftId) {
              setShiftId(String(assignment.preferredShiftId));
              const assignedDate = firstSelected(date, [assignment.weekday]);
              setDate(assignedDate);
              setWeekdays([assignment.weekday]);
              if (repeatUntil < assignedDate) setRepeatUntil(assignedDate);
            }
          }}>
            <option value="">Selecione uma UC</option>
            {units.map((x) => <option key={x.curricularUnitId} value={x.curricularUnitId}>{x.unitName}</option>)}
          </select>
        </Field>}
        {pedagogical && <Field label="Capacidade">
          <select className="field" required value={capabilityId} onChange={(e) => setCapabilityId(e.target.value)}>
            <option value="">Selecione uma capacidade</option>
            {selectedUnit?.capabilities.map((x) => <option key={x.id} value={x.id}>{x.description}</option>)}
          </select>
        </Field>}
        {pedagogical && selectedUnit?.qualificationWarning &&
          <Notice type="info" message="Habilitação para esta UC não cadastrada no perfil. A reserva pode prosseguir." />}
        {pedagogical && selectedUnit &&
          <p className="text-xs text-slate-500">Dia atribuído: {names[selectedUnit.weekday]}; use o turno correspondente.</p>}
        <Field label="Alunos">
          <input
            className="field"
            type="number"
            required
            min="1"
            max="500"
            value={students}
            onChange={(e) => setStudents(Number(e.target.value))}
          />
        </Field>
        <Field label="Data inicial">
          <input
            type="date"
            className="field"
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (e.target.value) {
                setWeekdays([asDay(e.target.value)]);
                if (repeatUntil < e.target.value) setRepeatUntil(e.target.value);
              }
            }}
          />
        </Field>
        <Field label="Turno completo">
          <select
            className="field"
            value={shift?.id ?? ""}
            onChange={(e) => setShiftId(e.target.value)}
            required
          >
            {data.shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.startsAt.slice(0, 5)}–{s.endsAt.slice(0, 5)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Checkbox
        label="Repetir em outras semanas"
        checked={recurring}
        onChange={setRecurring}
      />
      {recurring && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="field-label">Dias da semana para repetir a partir de {dateBR(date)}</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => {
                  setWeekdays((prev) =>
                    prev.includes(d)
                      ? prev.filter((x) => x !== d)
                      : [...prev, d],
                  );
                  if (eadDay === String(d)) setEadDay("");
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${weekdays.includes(d) ? "border-sky-500 bg-sky-100 text-sky-800" : "border-slate-200 bg-white text-slate-600"}`}
                aria-pressed={weekdays.includes(d)}
              >
                {names[d]}
              </button>
            ))}
          </div>
          <Field label="Manter esta alocação até">
            <input
              type="date"
              className="field"
              min={date}
              value={repeatUntil}
              onChange={(e) => setRepeatUntil(e.target.value)}
            />
          </Field>
          <Field label="Dia com EAD semanal (opcional)">
            <select
              className="field"
              value={eadDay}
              onChange={(e) => setEadDay(e.target.value)}
            >
              <option value="">Todos os dias presenciais</option>
              {weekdays.map((d) => (
                <option key={d} value={d}>
                  {names[d]} — EAD
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-slate-600" role="status">
            {dates.length} data(s) solicitada(s). A disponibilidade será verificada após escolher a sala. {" "}
            {dates.length > 0
              ? `Primeira: ${dateBR(dates[0])}. Última: ${dateBR(dates[dates.length - 1])}.`
              : "Nenhum encontro neste período."}
          </p>
        </div>
      )}
      {pedagogical ? <Notice type="info" message="Os requisitos técnicos desta capacidade serão consultados no Catálogo Pedagógico." /> : <div className="border-t pt-4 space-y-3">
        <h3 className="font-semibold text-sm">Recursos necessários</h3>
        <NeedFields value={need} onChange={setNeed} software={data.software} />
        {(need.needsStudentComputers || need.softwareIds.length > 0) && (
          <Field label="Alunos por computador (1, dupla ou grupo)">
            <input
              type="number"
              className="field"
              min="1"
              max="20"
              value={perComputer}
              onChange={(e) => setPerComputer(Number(e.target.value))}
            />
          </Field>
        )}
      </div>}
      <Field label="Link do plano de ensino (opcional)">
        <input
          type="url"
          className="field"
          placeholder="https://..."
          value={lessonPlanLink}
          onChange={(e) => setLessonPlanLink(e.target.value)}
        />
      </Field>
      <p className="text-xs text-slate-500">Após criar a solicitação, escolha uma sala e confira as datas elegíveis antes de confirmar.</p>
      <div className="flex justify-end">
        <SubmitButton busy={busy}>Continuar para escolha da sala</SubmitButton>
      </div>
    </form>
  );
}
