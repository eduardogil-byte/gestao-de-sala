import type { Need, Software } from "../types";
import { Checkbox, Field } from "./UI";

export const defaultNeed: Need = {
  needsProjector: true,
  needsTeacherComputer: true,
  needsStudentComputers: false,
  minTier: "Basico",
  minRamGb: 0,
  needsDedicatedGpu: false,
  softwareIds: [],
};
export function NeedFields({
  value,
  onChange,
  software,
}: {
  value: Need;
  onChange: (next: Need) => void;
  software: Software[];
}) {
  const set = <K extends keyof Need>(key: K, v: Need[K]) =>
    onChange({ ...value, [key]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Checkbox
          label="Projetor"
          checked={value.needsProjector}
          onChange={(v) => set("needsProjector", v)}
        />
        <Checkbox
          label="Computador do professor"
          checked={value.needsTeacherComputer}
          onChange={(v) => set("needsTeacherComputer", v)}
        />
        <Checkbox
          label="Computadores para alunos"
          checked={value.needsStudentComputers}
          onChange={(v) =>
            onChange(
              v
                ? { ...value, needsStudentComputers: true }
                : {
                    ...value,
                    needsStudentComputers: false,
                    minTier: "Basico",
                    minRamGb: 0,
                    needsDedicatedGpu: false,
                  },
            )
          }
        />
        <Checkbox
          label="GPU dedicada"
          checked={value.needsDedicatedGpu}
          onChange={(v) => set("needsDedicatedGpu", v)}
          disabled={!value.needsStudentComputers}
        />
      </div>
      {value.needsStudentComputers && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Potência mínima">
            <select
              className="field"
              value={value.minTier}
              onChange={(e) => set("minTier", e.target.value)}
            >
              <option value="Basico">Básico</option>
              <option value="Intermediario">Intermediário</option>
              <option value="Alto">Alto</option>
            </select>
          </Field>
          <Field label="RAM mínima (GB)">
            <input
              className="field"
              type="number"
              min="0"
              max="512"
              step="1"
              placeholder="0"
              value={value.minRamGb === 0 ? "" : value.minRamGb}
              onChange={(e) => set("minRamGb", Number(e.target.value))}
            />
          </Field>
        </div>
      )}
      {software.length > 0 && (
        <div>
          <p className="field-label mb-2">Programas necessários</p>
          <div className="grid sm:grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl max-h-36 overflow-y-auto">
            {software.map((s) => (
              <Checkbox
                key={s.id}
                label={s.name}
                checked={value.softwareIds.includes(s.id)}
                onChange={(yes) =>
                  set(
                    "softwareIds",
                    yes
                      ? [...value.softwareIds, s.id]
                      : value.softwareIds.filter((id) => id !== s.id),
                  )
                }
              />
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            A seleção de softwares exige computadores compatíveis para os
            alunos, mesmo se a caixa de computadores não estiver marcada.
          </p>
        </div>
      )}
    </div>
  );
}
