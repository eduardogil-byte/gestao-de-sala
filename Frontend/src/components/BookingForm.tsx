import { useEffect, useMemo, useState } from "react";
import { post, read } from "../lib/api";
import { localDate, nextDate, resultMessage, dateBR } from "../lib/utils";
import { useData } from "../lib/data";
import { NeedFields, defaultNeed } from "./NeedFields";
import { WeeklyCalendar, RepeatUntilCalendar, recurrenceLimit } from "./BookingCalendars";
import { Checkbox, Field, Notice, SearchableSelect, SubmitButton, useConfirmation } from "./UI";
import type { Need, Shift, User } from "../types";

type PedagogicalOption = {
  classGroupId: number; className: string; students: number;
  curricularUnitId: number; unitName: string; weekday: number;
  preferredShiftId: number; qualificationWarning: boolean;
  capabilities: { id: number; description: string }[];
};

const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const asDay = (d: string) => new Date(`${d}T12:00:00`).getDay();
export function uniqueShift(ids: (number | null | undefined)[]) {
  const found = [...new Set(ids.filter((id): id is number => id != null))];
  return found.length === 1 ? found[0] : null;
}
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
  const confirm = useConfirmation();
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
  const [untilOpen, setUntilOpen] = useState(false);
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
  const [need, setNeed] = useState<Need>({ ...defaultNeed, minRamGb: 8 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const classAssignments = data.assignments.filter((assignment) => assignment.classGroupId === Number(classGroupId) &&
    assignment.teacherId === (admin ? teacherId : user.id) && assignment.endedAtUtc == null &&
    (!pedagogical || !unitId || assignment.curricularUnitId === Number(unitId)));
  const identifiedShift = uniqueShift(classAssignments.map((assignment) => assignment.preferredShiftId)) ??
    uniqueShift(classAssignments.filter((assignment) => assignment.weekday == null || assignment.weekday === asDay(date)).map((assignment) => assignment.preferredShiftId));
  function applyClassShift(groupId: string, curricularUnitId = "") {
    const candidates = data.assignments.filter((assignment) => assignment.classGroupId === Number(groupId) &&
      assignment.teacherId === (admin ? teacherId : user.id) && assignment.endedAtUtc == null &&
      (!curricularUnitId || assignment.curricularUnitId === Number(curricularUnitId)));
    const found = uniqueShift(candidates.map((assignment) => assignment.preferredShiftId)) ??
      uniqueShift(candidates.filter((assignment) => assignment.weekday == null || assignment.weekday === asDay(date)).map((assignment) => assignment.preferredShiftId));
    if (found != null && (!shiftId || !candidates.some((assignment) => assignment.preferredShiftId === Number(shiftId)))) setShiftId(String(found));
  }
  async function chooseShift(next: string) {
    if (next === String(shift?.id)) return;
    if (identifiedShift != null && next !== String(identifiedShift)) {
      const oldName = data.shifts.find((item) => item.id === identifiedShift)?.name?.toLowerCase() ?? "identificado";
      const newName = data.shifts.find((item) => String(item.id) === next)?.name?.toLowerCase() ?? "selecionado";
      const accepted = await confirm({ title: "Alterar turno", message: `Esta turma está vinculada ao turno da ${oldName}. Deseja realmente selecionar o turno da ${newName}?`, confirmLabel: "Confirmar alteração" });
      if (!accepted) return;
      if (pedagogical) { setError("Na reserva pedagógica, o dia e o turno devem corresponder à atribuição ativa. Escolha o turno vinculado à UC."); return; }
    }
    setShiftId(next);
  }
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
  const unitAssignments = classOptions.filter((x) => String(x.curricularUnitId) === unitId);
  const selectedUnitDay = uniqueShift(unitAssignments.map((x) => x.weekday));
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
    if (recurring && (!dates.length || repeatUntil < start || repeatUntil > recurrenceLimit(start))) {
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
        ...(pedagogical ? defaultNeed :
          !need.needsStudentComputers && need.softwareIds.length === 0
            ? { ...need, minRamGb: 0, minTier: "Basico", needsDedicatedGpu: false }
            : need),
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
      <p className="text-xs text-muted-ink">Reserva comum: turma opcional e requisitos informados aqui. Planejamento pedagógico: exige atribuição ativa, turma, UC e capacidade; os requisitos técnicos vêm da capacidade.</p>
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
              applyClassShift(value);
              const c = data.classes.find(
                (c) => String(c.id) === value,
              );
              if (c) setStudents(c.students);
            }} options={[{ value: "", label: pedagogical ? "Selecione uma turma" : "Sem turma vinculada" },
              ...(pedagogical ? data.classes.filter((c) => options.some((x) => x.classGroupId === c.id)) : data.classes)
                .map((c) => ({ value: String(c.id), label: [c.code, c.name,
                  data.shifts.find((s) => s.id === uniqueShift(options.filter((x) => x.classGroupId === c.id).map((x) => x.preferredShiftId)))?.name].filter(Boolean).join(" · ") }))]} />
        <Field label="Atividade / justificativa (obrigatória)">
          <input className="field" required maxLength={250} value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Prática de SolidWorks" />
        </Field>
        {pedagogical && <Field label="Unidade curricular">
          <select className="field" required value={unitId} onChange={(e) => {
            setUnitId(e.target.value); setCapabilityId("");
            applyClassShift(classGroupId, e.target.value);
            const assignments = classOptions.filter((x) => String(x.curricularUnitId) === e.target.value);
            const assignedShift = uniqueShift(assignments.map((x) => x.preferredShiftId));
            const assignedDay = uniqueShift(assignments.map((x) => x.weekday));
            if (assignedShift != null && (!shiftId || shiftId === String(identifiedShift))) setShiftId(String(assignedShift));
            if (assignedDay != null) {
              const assignedDate = firstSelected(date, [assignedDay]);
              setDate(assignedDate);
              setWeekdays([assignedDay]);
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
          <p className="text-xs text-muted-ink">{selectedUnitDay == null ? "Há mais de um dia atribuído; selecione a data e o turno correspondentes." : `Dia atribuído: ${names[selectedUnitDay]}; use o turno correspondente.`}</p>}
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
        <Field label="Turno completo">
          <select
            className="field"
            value={shift?.id ?? ""}
            onChange={(e) => void chooseShift(e.target.value)}
            required
          >
            {data.shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.startsAt.slice(0, 5)}–{s.endsAt.slice(0, 5)}
              </option>
            ))}
          </select>
        </Field>
        <WeeklyCalendar date={date} weekdays={weekdays} recurring={recurring} today={today} onSelect={(selected) => {
          if (recurring) {
            const selectedDay = asDay(selected);
            const next = weekdays.includes(selectedDay) ? weekdays.filter((item) => item !== selectedDay) : [...weekdays, selectedDay];
            setWeekdays(next);
            if (!next.includes(asDay(date)) && next.length) setDate(firstSelected(date, next));
            if (selected < date && next.includes(selectedDay)) setDate(selected);
            if (eadDay === String(selectedDay) && !next.includes(selectedDay)) setEadDay("");
          } else { setDate(selected); setWeekdays([asDay(selected)]); }
          if (repeatUntil < selected) setRepeatUntil(selected);
          if (repeatUntil > recurrenceLimit(selected)) setRepeatUntil(recurrenceLimit(selected));
        }} />
      </div>
      <Checkbox
        label="Repetir em outras semanas"
        checked={recurring}
        onChange={setRecurring}
      />
      {recurring && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
          <button type="button" className="field text-left" aria-label="Manter esta alocação até" aria-haspopup="dialog" onClick={() => setUntilOpen(true)}>
            <span className="field-label !mb-0">Manter esta alocação até</span>{dateBR(repeatUntil)}
          </button>
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
      {untilOpen && <RepeatUntilCalendar start={start} value={repeatUntil} weekdays={weekdays} today={today}
        onClose={() => setUntilOpen(false)} onConfirm={(selected) => { setRepeatUntil(selected); setUntilOpen(false); }} />}
      {pedagogical ? <Notice type="info" message="Os requisitos técnicos desta capacidade serão consultados no Catálogo Pedagógico." /> : <div className="border-t pt-4 space-y-3">
        <h3 className="font-semibold text-sm">Recursos necessários</h3>
        <NeedFields value={need} onChange={setNeed} software={data.software} resourcePicker />
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
      <div className="sticky bottom-0 z-10 flex justify-end border-t border-line bg-surface py-3">
        <SubmitButton busy={busy}>Continuar para escolha da sala</SubmitButton>
      </div>
    </form>
  );
}
