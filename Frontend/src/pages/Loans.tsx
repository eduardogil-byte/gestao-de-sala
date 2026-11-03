import { useEffect, useState } from "react";
import { Check, Handshake, X } from "lucide-react";
import { useData } from "../lib/data";
import { post, read } from "../lib/api";
import { dateTimeBR, localDate, nextDate, resultMessage } from "../lib/utils";
import { Badge, Card, Empty, Field, Notice, Title, useConfirmation } from "../components/UI";
import { NeedFields, defaultNeed } from "../components/NeedFields";
import { AuditHistory } from "../components/AuditHistory";
import type { Need, Occupation, Loan, User } from "../types";

export function Loans({
  user,
  reloadAgenda,
  focusId,
}: {
  user: User;
  reloadAgenda: () => Promise<void>;
  focusId?: number | null;
}) {
  const { data, reload } = useData();
  const ask = useConfirmation();
  const [from, setFrom] = useState(localDate(new Date())),
    [occupations, setOccupations] = useState<Occupation[]>([]);
  const [chosen, setChosen] = useState<number[]>([]),
    [chosenDetails, setChosenDetails] = useState<Occupation[]>([]),
    [borrower, setBorrower] = useState(""),
    [reason, setReason] = useState("");
  const [direction, setDirection] = useState<"all" | "received" | "sent">("all");
  const [acceptId, setAcceptId] = useState<number | null>(null),
    [students, setStudents] = useState(25),
    [perComputer, setPerComputer] = useState(1),
    [classId, setClassId] = useState(""),
    [need, setNeed] = useState<Need>(defaultNeed);
  const [finishId, setFinishId] = useState<number | null>(null),
    [disposition, setDisposition] = useState("Ead"),
    [newRoom, setNewRoom] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [historyLoanId, setHistoryLoanId] = useState<number | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const timer = window.setTimeout(() => document.getElementById("loan-" + focusId)?.scrollIntoView({ block: "center" }), 0);
    return () => window.clearTimeout(timer);
  }, [focusId, data.loans]);
  const teacher = (id: string) =>
    (id === user.id ? user.displayName : data.teachers.find((t) => t.id === id)?.displayName) || "Professor não identificado";
  async function load() {
    try {
      setOccupations(
        await read<Occupation[]>(
          `/agenda?from=${from}T00:00:00&to=${nextDate(from, 28)}T00:00:00`,
        ),
      );
    } catch (e) {
      setError(resultMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, [from]);
  async function action(
    path: string,
    body?: unknown,
    message = "Operação concluída.",
  ) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await post(path, body);
      await reload();
      await reloadAgenda();
      await load();
      setSuccess(message);
      return true;
    } catch (e) {
      setError(resultMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function offer() {
    if (!chosen.length || !borrower || !reason.trim()) return;
    const preview = [...chosenDetails].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const dates = preview.slice(0, 5).map((o) => `${dateTimeBR(o.startsAt)} · ${data.rooms.find((r) => r.id === o.roomId)?.name ?? `Sala ${o.roomId}`}`).join("; ");
    if (
      !await ask({ title: "Oferecer empréstimo", message: `Oferecer ${chosen.length} data(s) para ${teacher(borrower)}: ${dates}${preview.length > 5 ? `; e mais ${preview.length - 5} data(s) listada(s) no formulário` : ""}. O destinatário precisará aceitar; depois você definirá a situação da sua turma.`, confirmLabel: "Enviar oferta" })
    )
      return;
    if (
      await action(
        "/loans/offer",
        { roomOccupationIds: chosen, borrowerId: borrower, reason },
        "Ofertas enviadas para aceite do destinatário.",
      )
    ) {
      setChosen([]);
      setChosenDetails([]);
      setBorrower("");
      setReason("");
    }
  }
  async function accept(l: Loan) {
    if (!await ask({ title: "Aceitar empréstimo", message: `Aceitar ${data.rooms.find((r) => r.id === l.roomId)?.name ?? `Sala ${l.roomId}`} em ${dateTimeBR(l.startsAt)}? O titular ainda precisará definir a situação da turma antes da efetivação.`, confirmLabel: "Aceitar oferta" })) return;
    const done = await action(
      `/loans/${l.id}/accept`,
      {
        classGroupId: classId ? Number(classId) : null,
        students,
        studentsPerComputer: perComputer,
        ...need,
      },
      "Aceite registrado. O titular deve decidir a situação de sua turma.",
    );
    if (done) setAcceptId(null);
  }
  async function finalize(l: Loan) {
    if (!await ask({ title: "Finalizar empréstimo", message: `Confirmar o empréstimo de ${data.rooms.find((r) => r.id === l.roomId)?.name ?? `Sala ${l.roomId}`} em ${dateTimeBR(l.startsAt)}? Sua turma ficará em ${disposition === "Ead" ? "EAD" : disposition === "NaoLetivo" ? "dia não letivo" : "outra sala"}. A alocação original permanecerá no histórico.`, confirmLabel: "Finalizar empréstimo" })) return;
    const done = await action(
      `/loans/${l.id}/finalize`,
      {
        disposition,
        replacementRoomId: disposition === "OutraSala" ? Number(newRoom) : null,
      },
      "Empréstimo efetivado; alocação original preservada.",
    );
    if (done) setFinishId(null);
  }
  const own = occupations.filter(
    (o) =>
      o.originalTeacherId === user.id &&
      o.kind !== "Bloqueio" &&
      !o.isBorrowed &&
      new Date(o.startsAt).getTime() >= Date.now(),
  );
  return (
    <>
      <Title
        title="Empréstimos de salas"
        subtitle="O titular oferece as datas, o destinatário aceita e o titular decide o destino da própria turma."
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
      <div className="grid xl:grid-cols-2 gap-5">
        <Card className="p-5 self-start space-y-4">
          <div className="flex items-center gap-2">
            <Handshake size={20} className="text-sky-600" />
            <h3 className="section-title">Oferecer minhas datas</h3>
          </div>
          <p className="text-xs text-slate-500">
            Selecione ocorrências da sua própria reserva, com data e turno
            corretos. Para períodos longos, avance pelas semanas e mantenha as
            datas selecionadas.
          </p>
          <Field label="Exibir 28 dias a partir de">
            <input
              type="date"
              className="field"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <button
              className="btn-secondary !py-1.5"
              type="button"
              onClick={() => setFrom(nextDate(from, -28))}
            >
              4 semanas antes
            </button>
            <button
              className="btn-secondary !py-1.5"
              type="button"
              onClick={() => setFrom(nextDate(from, 28))}
            >
              4 semanas depois
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-2 border rounded-xl p-3">
            {own.length === 0 ? (
              <p className="text-sm text-slate-500">
                Sem ocupações próprias disponíveis neste período.
              </p>
            ) : (
              own.map((o) => (
                <label key={o.id} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.includes(o.id)}
                    onChange={(e) => {
                      setChosen((old) => e.target.checked ? [...old, o.id] : old.filter((id) => id !== o.id));
                      setChosenDetails((old) => e.target.checked ? [...old, o] : old.filter((item) => item.id !== o.id));
                    }}
                  />
                  <span>
                    {dateTimeBR(o.startsAt)} ·{" "}
                    {data.rooms.find((r) => r.id === o.roomId)?.name} ·{" "}
                    {o.endsAt.slice(11, 16)}
                    {o.originalClassGroupId && <> · {data.classes.find((c) => c.id === o.originalClassGroupId)?.name ?? "Turma não identificada"}</>}
                  </span>
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-sky-700">
            {chosen.length} ocorrência(s) selecionada(s). Limite de 150 por
            oferta.
          </p>
          {chosenDetails.length > 0 && <div className="rounded-xl bg-sky-50 p-3 text-xs text-slate-700" role="status">
            <p className="font-semibold mb-1">Datas que serão oferecidas:</p>
            <ul className="max-h-28 overflow-y-auto space-y-1">{[...chosenDetails].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((o) =>
              <li key={o.id}>{dateTimeBR(o.startsAt)} · {data.rooms.find((r) => r.id === o.roomId)?.name ?? `Sala ${o.roomId}`}{o.originalClassGroupId && <> · {data.classes.find((c) => c.id === o.originalClassGroupId)?.name ?? "Turma não identificada"}</>}</li>)}</ul>
          </div>}
          <Field label="Professor destinatário">
            <select
              className="field"
              value={borrower}
              onChange={(e) => setBorrower(e.target.value)}
            >
              <option value="">Selecione</option>
              {data.teachers
                .filter((t) => t.id !== user.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Motivo">
            <textarea
              className="field"
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button
            className="btn-primary w-full"
            disabled={
              busy ||
              !chosen.length ||
              chosen.length > 150 ||
              !borrower ||
              !reason.trim()
            }
            onClick={() => void offer()}
          >
            <Handshake size={16} />
            Enviar oferta(s)
          </button>
        </Card>
        <Card className="overflow-hidden">
          <div className="p-5 border-b">
            <h3 className="section-title">Ofertas e acompanhamento</h3>
            <p className="text-xs text-slate-500 mt-1">
              Cada ocorrência possui aceite e finalização próprios.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 p-4 border-b" aria-label="Filtrar empréstimos">
            {(["all", "received", "sent"] as const).map((value) => <button key={value} type="button" aria-pressed={direction === value}
              className={direction === value ? "btn-primary" : "btn-secondary"} onClick={() => setDirection(value)}>
              {value === "all" ? "Todos" : value === "received" ? "Recebidos" : "Enviados"}
            </button>)}
          </div>
          {data.loans.filter((l) => direction === "all" || (direction === "received" ? l.borrowerId === user.id : l.ownerTeacherId === user.id)).length === 0 ? (
            <Empty title="Nenhum empréstimo ainda" />
          ) : (
            <div className="divide-y divide-slate-100 max-h-[780px] overflow-y-auto">
              {data.loans.filter((l) => direction === "all" || (direction === "received" ? l.borrowerId === user.id : l.ownerTeacherId === user.id)).map((l) => (
                <div key={l.id} id={"loan-" + l.id} className={"p-4 space-y-3 " + (focusId === l.id ? "ring-2 ring-inset ring-sky-500" : "")}>
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">
                        {data.rooms.find((r) => r.id === l.roomId)?.name ||
                          `Sala ${l.roomId}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {dateTimeBR(l.startsAt)}–{l.endsAt.slice(11, 16)}
                      </p>
                    </div>
                    <Badge status={l.status} />
                  </div>
                  <p className="text-xs text-slate-600">
                    {l.ownerTeacherId === user.id ? "Enviado" : l.borrowerId === user.id ? "Recebido" : "Entre professores"} · Titular: {teacher(l.ownerTeacherId)} · Destinatário: {teacher(l.borrowerId)}
                  </p>
                  {l.classGroupId && <p className="text-xs text-slate-600">Turma destinatária: {data.classes.find((c) => c.id === l.classGroupId)?.name ?? "Não identificada"}</p>}
                  {l.reason && <p className="text-xs text-slate-600">Motivo: {l.reason}</p>}
                  <button type="button" className="text-xs font-semibold text-sky-700 underline" onClick={() => setHistoryLoanId(historyLoanId === l.id ? null : l.id)}>Histórico do empréstimo</button>
                  {historyLoanId === l.id && <AuditHistory type="Loan" id={l.id} />}
                  {l.status === "AguardandoDestinatario" &&
                    l.borrowerId === user.id && (
                      <button
                        disabled={busy}
                        className="btn-secondary !py-2"
                        onClick={() => {
                          setAcceptId(acceptId === l.id ? null : l.id);
                          setFinishId(null);
                        }}
                      >
                        <Check size={15} />
                        Responder à oferta
                      </button>
                    )}
                  {l.status === "AguardandoSituacaoTitular" &&
                    l.ownerTeacherId === user.id && (
                      <button
                        disabled={busy}
                        className="btn-secondary !py-2"
                        onClick={() => {
                          setFinishId(finishId === l.id ? null : l.id);
                          setAcceptId(null);
                        }}
                      >
                        <Check size={15} />
                        Definir destino da turma
                      </button>
                    )}
                  {[
                    "AguardandoDestinatario",
                    "AguardandoSituacaoTitular",
                  ].includes(l.status) &&
                    (l.ownerTeacherId === user.id ||
                      l.borrowerId === user.id ||
                      user.roles.includes("Admin")) && (
                      <button
                        disabled={busy}
                        className="btn-quiet !py-2 text-red-700"
                        onClick={() => {
                          void ask({ title: l.ownerTeacherId === user.id ? "Cancelar oferta" : "Recusar oferta", message: `A oferta de ${data.rooms.find((r) => r.id === l.roomId)?.name ?? `Sala ${l.roomId}`} em ${dateTimeBR(l.startsAt)} será encerrada. A sala permanecerá com o titular.`, confirmLabel: l.ownerTeacherId === user.id ? "Cancelar oferta" : "Recusar oferta", danger: true }).then((confirmed) => {
                            if (confirmed) {
                              void action(
                                `/loans/${l.id}/reject`,
                                undefined,
                                "Oferta rejeitada.",
                              );
                            }
                          });
                        }}
                      >
                        <X size={15} />
                        {l.ownerTeacherId === user.id ? "Cancelar" : "Recusar"}
                      </button>
                    )}
                  {acceptId === l.id && (
                    <div className="bg-slate-50 rounded-xl p-3 space-y-3">
                      <Field label="Turma que receberá a sala">
                        <select
                          className="field"
                          value={classId}
                          onChange={(e) => {
                            setClassId(e.target.value);
                            const c = data.classes.find(
                              (c) => String(c.id) === e.target.value,
                            );
                            if (c) setStudents(c.students);
                          }}
                        >
                          <option value="">Sem turma vinculada</option>
                          {data.classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Quantidade de alunos">
                        <input
                          type="number"
                          min="1"
                          max="500"
                          className="field"
                          value={students}
                          onChange={(e) => setStudents(Number(e.target.value))}
                        />
                      </Field>
                      <NeedFields
                        value={need}
                        onChange={setNeed}
                        software={data.software}
                      />
                      <Field label="Alunos por computador">
                        <input
                          type="number"
                          className="field"
                          min="1"
                          max="20"
                          value={perComputer}
                          onChange={(e) =>
                            setPerComputer(Number(e.target.value))
                          }
                        />
                      </Field>
                      <button
                        disabled={busy}
                        className="btn-primary"
                        onClick={() => void accept(l)}
                      >
                        Aceitar e validar compatibilidade
                      </button>
                    </div>
                  )}
                  {finishId === l.id && (
                    <div className="bg-slate-50 rounded-xl p-3 space-y-3">
                      <Field label="Situação da minha turma">
                        <select
                          className="field"
                          value={disposition}
                          onChange={(e) => setDisposition(e.target.value)}
                        >
                          <option value="Ead">EAD</option>
                          <option value="NaoLetivo">Não letivo</option>
                          <option value="OutraSala">Outra sala</option>
                        </select>
                      </Field>
                      {disposition === "OutraSala" && (
                        <Field label="Sala substituta">
                          <select
                            className="field"
                            value={newRoom}
                            onChange={(e) => setNewRoom(e.target.value)}
                          >
                            <option value="">Selecione</option>
                            {data.rooms
                              .filter((r) => r.id !== l.roomId && r.active)
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} · {r.seats} lugares
                                </option>
                              ))}
                          </select>
                        </Field>
                      )}
                      <p className="text-xs text-slate-500">
                        O backend confere os requisitos e conflitos antes de
                        finalizar.
                      </p>
                      <button
                        className="btn-primary"
                        disabled={
                          busy || (disposition === "OutraSala" && !newRoom)
                        }
                        onClick={() => void finalize(l)}
                      >
                        Finalizar empréstimo
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
