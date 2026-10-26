import { PasswordInput } from "../components/PasswordInput";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  DoorOpen,
  LockKeyhole,
  UserRound,
  Layers3,
} from "lucide-react";
import type { User } from "../types";
import { register, signIn } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { Field, Notice } from "../components/UI";

export function Access({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        await register(name, email, password);
        setMode("login");
        setMessage("Conta de professor criada! Entre com seu e-mail e senha.");
      } else onLogin(await signIn(email, password));
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
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
            inteligência e facilite reservas e empréstimos entre professores.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-3">
            {[
              { icon: CalendarDays, title: "Grades", desc: "sem conflitos" },
              { icon: DoorOpen, title: "Salas", desc: "bem utilizadas" },
              { icon: UserRound, title: "Professores", desc: "conectados" },
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
        <div className="w-full max-w-[410px]">
          <div className="lg:hidden flex items-center gap-2 mb-10 text-navy-900">
            <Layers3 className="text-skybrand-600" />{" "}
            <span className="text-xl font-bold">SalaGest</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-skybrand-50 flex items-center justify-center text-skybrand-600 mb-6">
            <LockKeyhole size={23} />
          </div>
          <h2 className="text-[30px] tracking-tight font-bold text-slate-800">
            {mode === "login"
              ? "Bem-vindo de volta"
              : "Criar conta de professor"}
          </h2>
          <p className="text-slate-500 mt-2 mb-8">
            {mode === "login"
              ? "Entre para acessar a gestão de salas e horários."
              : "Professores podem solicitar reservas e consultar a agenda."}
          </p>
          <form onSubmit={submit} className="space-y-4">
            {error && <Notice message={error} />}{" "}
            {message && <Notice message={message} type="success" />}
            {mode === "register" && (
              <Field label="Nome completo">
                <input
                  className="field"
                  required
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome e sobrenome"
                />
              </Field>
            )}
            <Field label="E-mail institucional">
              <input
                type="email"
                autoComplete="email"
                className="field"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="professor@instituicao.edu.br"
              />
            </Field>
            <Field label="Senha">
              <PasswordInput
                key={mode}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres e um número"
              />
            </Field>
            <button disabled={busy} className="btn-primary w-full !py-3 mt-2">
              {busy
                ? "Enviando..."
                : mode === "login"
                  ? "Entrar na plataforma"
                  : "Criar conta"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="mt-6 text-center text-sm text-slate-500">
            {mode === "login"
              ? "É professor e ainda não tem conta?"
              : "Já possui uma conta?"}{" "}
            <button
              className="text-skybrand-700 font-semibold hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setMessage("");
                setPassword("");
              }}
            >
              {mode === "login" ? "Cadastre-se" : "Fazer login"}
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-10">
            A conta de administrador é criada no backend, por configuração
            segura.
          </p>
        </div>
      </div>
    </div>
  );
}
