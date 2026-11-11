import { PasswordInput } from "../components/PasswordInput";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  DoorOpen,
  LockKeyhole,
  UserRound,
  Layers3,
} from "lucide-react";
import type { User } from "../types";
import { read, signIn } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { Field, Notice } from "../components/UI";

export function Access({ onLogin, initialMessage = "" }: { onLogin: (user: User) => void; initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  useEffect(() => {
    void read<{ enabled: boolean }>("/auth/institutional/config")
      .then((config) => setSsoEnabled(config.enabled === true))
      .catch(() => setSsoEnabled(false));
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      onLogin(await signIn(email, password));
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-canvas text-ink">
      <div className="hidden lg:flex bg-navy-900 p-14 flex-col justify-between relative overflow-hidden text-white">
        <div className="absolute -right-24 top-1/4 rounded-full w-96 h-96 border-[70px] border-white/5" />
        <div className="absolute -left-40 bottom-2 rounded-full w-96 h-96 border-[90px] border-blue-300/5" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-11 h-11 rounded-xl bg-skybrand-500 flex items-center justify-center">
            <Layers3 size={25} />
          </div>
          <span className="font-bold text-2xl tracking-tight">SalaGest</span>
        </div>
        <div className="relative z-10 max-w-lg">
          <div className="text-sky-300 text-sm font-semibold tracking-wide mb-5">
            GESTÃO DE AMBIENTES DE ENSINO
          </div>
          <h1 className="text-5xl leading-[1.18] font-bold tracking-tight">
            Cada aula no <span className="text-sky-300">lugar certo.</span>
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed mt-5">
            Organize a grade da instituição, aloque laboratórios com
            inteligência e facilite reservas e empréstimos entre instrutores.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-3">
            {[
              { icon: CalendarDays, title: "Grades", desc: "sem conflitos" },
              { icon: DoorOpen, title: "Salas", desc: "bem utilizadas" },
              { icon: UserRound, title: "Instrutores", desc: "conectados" },
            ].map((a) => (
              <div
                key={a.title}
                className="bg-white/5 rounded-xl p-4 border border-white/10"
              >
                <a.icon size={21} className="text-sky-300 mb-3" />
                <div className="text-sm font-semibold">{a.title}</div>
                <div className="text-xs text-slate-400 mt-1">{a.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm text-slate-400 relative z-10">
          SalaGest • Plataforma institucional
        </p>
      </div>
      <div className="flex items-center justify-center px-5 py-10 md:px-16">
        <div className="w-full max-w-[440px] rounded-panel border border-line bg-surface p-6 sm:p-8 shadow-soft">
          <div className="lg:hidden flex items-center gap-2 mb-10 text-ink">
            <Layers3 className="text-skybrand-600" />{" "}
            <span className="text-xl font-bold">SalaGest</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-navy-800 flex items-center justify-center text-sky-300 mb-6">
            <LockKeyhole size={23} />
          </div>
          <h2 className="text-[30px] tracking-tight font-bold text-ink">
            Bem-vindo de volta
          </h2>
          <p className="text-muted-ink mt-2 mb-8">
            Entre para acessar a gestão de salas e horários.
          </p>
          <form onSubmit={submit} className="space-y-4">
            {error && <Notice message={error} />}{" "}
            {message && <Notice message={message} type="success" />}
            <Field label="E-mail institucional">
              <input
                type="email"
                autoComplete="email"
                className="field"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="instrutor@instituicao.edu.br"
              />
            </Field>
            <Field label="Senha">
              <PasswordInput
                autoComplete="current-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres e um número"
              />
            </Field>
            <button disabled={busy} className="btn-primary w-full !py-3 mt-2">
              {busy ? "Enviando..." : "Entrar na plataforma"}
              <ArrowRight size={17} />
            </button>
          </form>
          {ssoEnabled && <div className="mt-4">
            <button type="button" disabled={busy} className="btn-secondary w-full !py-3"
              onClick={() => { setBusy(true); window.location.assign("/api/auth/institutional/login"); }}>
              Entrar com conta institucional
            </button>
          </div>}
          <p className="mt-6 text-center text-sm text-muted-ink">
            Precisa de uma conta? Procure a administração da instituição.
          </p>
          <p className="text-center text-xs text-muted-ink mt-10">
            A conta de administrador é criada no backend, por configuração
            segura.
          </p>
        </div>
      </div>
    </div>
  );
}
