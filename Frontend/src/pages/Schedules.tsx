import { useEffect, useState } from "react";
import { CalendarCheck2, Sparkles, Send, AlertTriangle } from "lucide-react";
import { useData } from "../lib/data";
import { post, read } from "../lib/api";
import { dayNames, hour, resultMessage } from "../lib/utils";
import { Badge, Card, Empty, Field, Notice, Title } from "../components/UI";
import type { ScheduleDetails, User } from "../types";

export function Schedules({
  user,
  reloadAgenda,
}: {
  user: User;
  reloadAgenda: () => Promise<void>;
}) {
  const admin = user.roles.includes("Admin");
  const { data, reload } = useData();
  const [semesterId, setSemesterId] = useState("");
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState<ScheduleDetails | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const schedules = data.schedules.filter(
    (s) => !semesterId || String(s.semesterId) === semesterId,
  );
  useEffect(() => {
    if (selected)
      read<ScheduleDetails>(`/schedules/${selected}`)
        .then(setDetails)
        .catch((e) => setError(resultMessage(e)));
    else setDetails(null);
  }, [selected]);
  async function generate() {
    if (!semesterId) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const r = await post<{ id: number; unallocatedMeetings: number }>(
        `/schedules/generate/${semesterId}`,
      );
      await reload();
      setSelected(String(r.id));
      setSuccess(
        r.unallocatedMeetings
          ? `Grade gerada com ${r.unallocatedMeetings} aula(s) não alocada(s). Revise os cadastros antes de publicar.`
          : "Rascunho gerado. Revise antes de publicar.",
      );
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (
      !selected ||
      !window.confirm(
        "Publicar esta grade? A versão atual do backend não substitui uma grade já publicada.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await post(`/schedules/${selected}/publish`);
      await reload();
      setDetails(await read(`/schedules/${selected}`));
      await reloadAgenda();
      setSuccess("Grade publicada! As aulas foram adicionadas à agenda.");
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title="Geração de grade"
        subtitle="Organize professores, turmas e salas sem conflitos de turno."
      />
      {error && (
        <div className="mb-4">
          <Notice message={error} onClose={() => setError("")} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <Notice
            message={success}
            type="success"
            onClose={() => setSuccess("")}
          />
        </div>
      )}
      <Card className="p-5 mb-5">
        <div className="flex flex-wrap gap-4 items-end">
          <Field className="flex-1" label="Semestre">
            <select
              className="field"
              value={semesterId}
              onChange={(e) => {
                setSemesterId(e.target.value);
                setSelected("");
              }}
            >
              <option value="">Selecione um semestre</option>
              {data.semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {admin && (
            <button
              onClick={() => void generate()}
              disabled={!semesterId || busy}
              className="btn-primary"
            >
              <Sparkles size={16} />
              {busy ? "Processando..." : "Gerar nova grade"}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          O algoritmo atual é heurístico: gera aulas semanais completas conforme
          disponibilidade e salas compatíveis. Ainda não realiza otimização
          global.
        </p>
      </Card>
      <div className="grid lg:grid-cols-[300px_1fr] gap-5">
        <Card className="overflow-hidden self-start">
          <div className="p-4 border-b border-slate-100">
            <h3 className="section-title">Versões da grade</h3>
          </div>
          {schedules.length === 0 ? (
            <Empty
              title="Nenhuma grade gerada"
              text="Selecione um semestre e gere o primeiro rascunho."
            />
          ) : (
            schedules.map((s) => (
              <button
                className={`p-4 border-b border-slate-100 last:border-0 w-full text-left hover:bg-slate-50 ${selected === String(s.id) ? "bg-sky-50" : ""}`}
                onClick={() => setSelected(String(s.id))}
                key={s.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm">Grade #{s.id}</p>
                  <Badge status={s.status} />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {data.semesters.find((x) => x.id === s.semesterId)?.name} •{" "}
                  {s.allocatedMeetings} aulas
                </p>
                {s.unallocatedMeetings > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    {s.unallocatedMeetings} pendentes
                  </p>
                )}
              </button>
            ))
          )}
        </Card>
        <Card className="overflow-hidden min-h-[280px]">
          {!details ? (
            <Empty
              title="Selecione uma versão da grade"
              text="As disciplinas, salas e horários aparecerão aqui."
            />
          ) : (
            <>
              <div className="p-5 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <h3 className="section-title">Grade #{details.id}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge status={details.status} />
                    <span className="text-xs text-slate-500">
                      {details.lessons.length} aulas alocadas
                    </span>
                  </div>
                </div>
                {admin && details.status === "Rascunho" && (
                  <button
                    className="btn-primary"
                    disabled={
                      busy ||
                      details.unallocatedMeetings > 0 ||
                      details.lessons.length === 0
                    }
                    onClick={() => void publish()}
                  >
                    <Send size={15} />
                    Publicar grade
                  </button>
                )}
              </div>
              {details.unallocatedMeetings > 0 && (
                <div className="p-4 mx-5 my-4 rounded-xl bg-amber-50 text-amber-800 text-sm flex gap-2">
                  <AlertTriangle size={18} className="shrink-0" />
                  Faltam {details.unallocatedMeetings} aula(s). Ajuste
                  disponibilidades, turmas, turnos ou salas, depois gere outra
                  versão.
                </div>
              )}
              {details.lessons.length === 0 ? (
                <Empty text="Não foi possível alocar aulas neste rascunho." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="table-head">
                        <th className="px-4 py-3 text-left">Dia</th>
                        <th className="px-4 py-3 text-left">Turno</th>
                        <th className="px-4 py-3 text-left">
                          Disciplina e turma
                        </th>
                        <th className="px-4 py-3 text-left">Sala</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...details.lessons]
                        .sort(
                          (a, b) =>
                            a.weekday - b.weekday ||
                            a.start.localeCompare(b.start),
                        )
                        .map((l) => (
                          <tr key={l.id}>
                            <td className="table-cell whitespace-nowrap font-medium">
                              {dayNames[l.weekday - 1]}
                            </td>
                            <td className="table-cell whitespace-nowrap">
                              <span>{l.shiftName}</span>
                              <span className="block text-xs text-slate-400">
                                {hour(l.start)}–{hour(l.end)}
                              </span>
                            </td>
                            <td className="table-cell">
                              <p className="font-semibold">
                                {l.disciplineName}
                              </p>
                              <span className="text-xs text-slate-400">
                                {
                                  data.classes.find(
                                    (c) => c.id === l.classGroupId,
                                  )?.name
                                }{" "}
                                •{" "}
                                {data.teachers.find((t) => t.id === l.teacherId)
                                  ?.displayName || "Professor"}
                              </span>
                            </td>
                            <td className="table-cell font-medium">{l.room}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
      <Card className="p-4 mt-5 flex items-start gap-3">
        <CalendarCheck2 size={20} className="text-skybrand-600 shrink-0" />
        <p className="text-sm text-slate-600">
          Ao publicar, o backend registra todas as ocorrências do semestre.
          Reservas avulsas aprovadas e empréstimos aparecem na agenda. Só é
          possível publicar uma grade completa.
        </p>
      </Card>
    </>
  );
}
