import { useState } from "react";
import {
  BookOpen,
  CalendarPlus,
  GraduationCap,
  Plus,
  Users,
} from "lucide-react";
import { useData } from "../lib/data";
import { post } from "../lib/api";
import { dateBR, resultMessage } from "../lib/utils";
import { NeedFields, defaultNeed } from "../components/NeedFields";
import {
  Card,
  Empty,
  Field,
  Notice,
  SubmitButton,
  Title,
} from "../components/UI";
import type { Need, User } from "../types";

export function Academic({ user }: { user: User }) {
  const admin = user.roles.includes("Admin");
  const { data, reload } = useData();
  const [semester, setSemester] = useState({
    name: "2026/2",
    startDate: "2026-10-12",
    endDate: "2026-12-18",
  });
  const [cls, setCls] = useState({ semesterId: "", name: "", students: 25 });
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
                  { ...cls, semesterId: Number(cls.semesterId) },
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
              <div className="grid grid-cols-2 gap-3">
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
              <SubmitButton busy={action === "class"}>
                <Plus size={16} />
                Adicionar turma
              </SubmitButton>
            </form>
          </Card>
        </div>
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
              <Field label="Professor">
                <select
                  required
                  className="field"
                  value={as.teacherId}
                  onChange={(e) => setAs({ ...as, teacherId: e.target.value })}
                >
                  <option value="">Selecione o professor</option>
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
                      .map((c) => (
                        <span
                          className="pill bg-sky-50 text-sky-700"
                          key={c.id}
                        >
                          {c.name} • {c.students} alunos
                        </span>
                      ))
                  ) : (
                    <span className="text-xs text-slate-400">Sem turmas</span>
                  )}
                </div>
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
                    <p className="text-xs text-slate-500 mt-1">
                      {data.classes.find((c) => c.id === a.classGroupId)?.name}{" "}
                      •{" "}
                      {data.teachers.find((t) => t.id === a.teacherId)
                        ?.displayName || "Professor"}
                    </p>
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
