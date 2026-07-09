"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2, Mail, MailCheck } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviarLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    setCarregando(false);
    if (error) {
      setErro("Não foi possível enviar o e-mail agora. Tente novamente em instantes.");
      return;
    }
    // Sempre mostra sucesso — não revelamos se o e-mail existe ou não (segurança)
    setEnviado(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar para o login
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          {enviado ? (
            <div className="text-center">
              <div className="mx-auto mb-4 inline-flex rounded-full bg-green-50 p-3">
                <MailCheck className="h-8 w-8 text-green-600" aria-hidden />
              </div>
              <h1 className="text-xl font-semibold">Verifique seu e-mail</h1>
              <p className="mt-2 text-sm text-slate-600">
                Se existir uma conta para <strong>{email}</strong>, você receberá um link para
                criar uma nova senha. O link expira em 1 hora — confira também o spam.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 inline-flex rounded-xl bg-brand-50 p-3">
                <KeyRound className="h-6 w-6 text-brand-600" aria-hidden />
              </div>
              <h1 className="text-xl font-semibold">Esqueceu a senha?</h1>
              <p className="mt-1 text-sm text-slate-500">
                Sem problema. Digite o e-mail da sua conta e enviaremos um link para você criar uma
                senha nova.
              </p>

              <form onSubmit={enviarLink} className="mt-6 space-y-4">
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
                      className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                  {carregando ? "Enviando…" : "Enviar link de recuperação"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
