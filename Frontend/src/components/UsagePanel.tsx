import { useEffect, useState } from "react";
import { read } from "../lib/api";
import { useData } from "../lib/data";
import { dateBR, localDate, resultMessage } from "../lib/utils";
import { Card, Field, Notice } from "./UI";
import type { Usage } from "../types";

export function UsagePanel() {
  const { data } = useData();
  const today = localDate(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`),
    [to, setTo] = useState(today);
  const [shift, setShift] = useState(""),
    [turma, setTurma] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!from || !to || from > to) return;
    const ctl = new AbortController();
    read<Usage>(
      `/dashboard/usage?from=${from}&to=${to}${shift ? `&shiftId=${shift}` : ""}${turma ? `&classGroupId=${turma}` : ""}`,
    )
      .then((x) => {
        if (!ctl.signal.aborted) {
          setUsage(x);
          setError("");
        }
      })
      .catch((e) => {
        if (!ctl.signal.aborted) setError(resultMessage(e));
      });
    return () => ctl.abort();
  }, [from, to, shift, turma]);
  const max = Math.max(1, ...(usage?.days.map((x) => x.occupiedRooms) || [1]));
  return (
    <Card className="p-5 mt-5 space-y-4">
      <div>
        <h3 className="section-title">Utilização dos ambientes</h3>
        <p className="text-xs text-slate-500 mt-1">
          Quanto mais verde, mais salas tiveram aula presencial no dia. Dados
          reais da API.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Field label="Início">
          <input
            className="field"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Fim">
          <input
            className="field"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label="Turno">
          <select
            className="field"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
          >
            <option value="">Todos</option>
            {data.shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Turma">
          <select
            className="field"
            value={turma}
            onChange={(e) => setTurma(e.target.value)}
          >
            <option value="">Todas</option>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && <Notice message={error} />}
      {usage && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {usage.days.map((d) => (
              <div
                key={d.date}
                title={`${dateBR(d.date)}: ${d.occupiedRooms} sala(s) com aula`}
                className="w-11 h-12 rounded-lg flex flex-col justify-center items-center border border-emerald-900/5"
                style={{
                  backgroundColor: `rgba(16,142,81,${0.08 + (0.8 * d.occupiedRooms) / max})`,
                }}
              >
                <span className="text-[10px] text-slate-800">
                  {d.date.slice(8)}
                </span>
                <b className="text-xs text-slate-900">{d.occupiedRooms}</b>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Os valores indicam salas distintas em uso por dia, não o número de
            professores ou alunos.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <b className="text-sm">Salas mais utilizadas</b>
              {usage.rooms
                .filter((r) => r.occurrences > 0)
                .slice(0, 5)
                .map((r) => (
                  <p className="text-xs text-slate-600 mt-2" key={r.roomId}>
                    {data.rooms.find((x) => x.id === r.roomId)?.name ||
                      `Sala ${r.roomId}`}{" "}
                    · {r.hours}h ({r.occurrences} turnos)
                  </p>
                ))}
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <b className="text-sm">Salas menos utilizadas</b>
              {[...usage.rooms]
                .sort((a, b) => a.hours - b.hours)
                .slice(0, 5)
                .map((r) => (
                  <p className="text-xs text-slate-600 mt-2" key={r.roomId}>
                    {data.rooms.find((x) => x.id === r.roomId)?.name ||
                      `Sala ${r.roomId}`}{" "}
                    · {r.hours}h
                  </p>
                ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
