"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2, LockKeyhole, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { publicEnv } from "@/lib/env";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const whatsapp = publicEnv().NEXT_PUBLIC_WHATSAPP_SUPORTE;
  const linkSuporte = `https://wa.me/${whatsapp}?text=${encodeURIComponent(
    "Olá! Perdi o acesso à minha conta da Agência Fiscal.",
  )}`;

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setCarregando(false);
      setErro(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos. Verifique e tente novamente."
          : "Não foi possível entrar agora. Tente novamente em instantes.",
      );
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen">
      {/* Painel institucional (desktop) */}
      <aside className="hidden w-1/2 flex-col justify-between bg-brand-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <FileCheck2 className="h-6 w-6" aria-hidden />
          Agência Fiscal
        </div>
        <div>
          <h1 className="max-w-md text-3xl font-semibold leading-tight">
            Suas notas fiscais emitidas, mesmo quando a prefeitura está fora do ar.
          </h1>
          <p className="mt-4 max-w-md text-brand-50/90">
            Reprocessamento automático com 4 tentativas inteligentes. Você fatura, a gente insiste
            até emitir.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-brand-50/80">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Certificado A1 criptografado de ponta a ponta
        </div>
      </aside>

      {/* Formulário */}
      <section className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2 text-lg font-semibold text-brand-700">
              <FileCheck2 className="h-6 w-6" aria-hidden />
              Agência Fiscal
            </div>
          </div>

          <h2 className="text-2xl font-semibold">Entrar na sua conta</h2>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhe seu faturamento e a emissão das suas notas.
          </p>

          <form onSubmit={entrar} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">E-mail</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@suaempresa.com.br"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </label>

            <div className="flex justify-end">
              <Link
                href="/recuperar-senha"
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>

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
              {carregando ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Ainda não tem conta?{" "}
            <Link href="/cadastro" className="font-medium text-brand-600 hover:underline">
              Criar conta gratuita no beta
            </Link>
          </p>

          <p className="mt-4 text-center text-xs text-slate-400">
            Perdeu o acesso?{" "}
            <a
              href={linkSuporte}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-500 underline-offset-2 hover:text-brand-600 hover:underline"
            >
              <MessageCircle className="h-3 w-3" aria-hidden />
              Fale com o suporte
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
