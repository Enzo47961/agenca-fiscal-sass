"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { FileCheck2, Loader2, LockKeyhole, Mail, MailCheck, ShieldCheck, User } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const inputClasses =
  "w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export default function CadastroPage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);

  async function cadastrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      setErro("As senhas não coincidem. Digite a mesma senha nos dois campos.");
      return;
    }

    setCarregando(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setCarregando(false);
    if (error) {
      setErro(
        error.message.includes("already registered")
          ? "Este e-mail já tem uma conta. Tente entrar ou recuperar a senha."
          : "Não foi possível criar a conta agora. Tente novamente em instantes.",
      );
      return;
    }
    setEmailEnviado(true);
  }

  if (emailEnviado) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-full bg-green-50 p-3">
            <MailCheck className="h-8 w-8 text-green-600" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold">Confira seu e-mail</h1>
          <p className="mt-2 text-sm text-slate-600">
            Enviamos um link de confirmação para <strong>{email}</strong>. Clique nele para ativar
            sua conta — vale checar a caixa de spam também.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Voltar para o login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-brand-700">
          <FileCheck2 className="h-6 w-6" aria-hidden />
          Agência Fiscal
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-600">
            Beta
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-xl font-semibold">Criar conta gratuita</h1>
          <p className="mt-1 text-sm text-slate-500">
            Acesso completo, grátis durante o beta. Sem cartão de crédito.
          </p>

          <form onSubmit={cadastrar} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Seu nome</span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Maria Silva"
                  autoComplete="name"
                  className={inputClasses}
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">E-mail</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@suaempresa.com.br"
                  autoComplete="email"
                  className={inputClasses}
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Senha</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  className={inputClasses}
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Confirmar senha</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  className={inputClasses}
                />
              </div>
            </label>

            {erro && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {carregando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {carregando ? "Criando conta…" : "Criar conta e receber e-mail de confirmação"}
            </button>
          </form>

          <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
            Ao criar a conta você concorda com os{" "}
            <Link href="/termos" className="underline underline-offset-2 hover:text-brand-600">
              Termos do Beta
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="underline underline-offset-2 hover:text-brand-600">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
