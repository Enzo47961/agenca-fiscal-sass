"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, LockKeyhole, ShieldAlert } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Estado = "verificando" | "pronto" | "link_invalido" | "sucesso";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // O link do e-mail traz um `code` — o client troca por sessão temporária.
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const code = new URLSearchParams(window.location.search).get("code");

    async function preparar() {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        setEstado(error ? "link_invalido" : "pronto");
        return;
      }
      // Sem code na URL: só é válido se já houver sessão de recuperação ativa
      const { data } = await supabase.auth.getSession();
      setEstado(data.session ? "pronto" : "link_invalido");
    }
    void preparar();
  }, []);

  async function salvarNovaSenha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    setCarregando(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);

    if (error) {
      setErro(
        error.message.includes("different from the old")
          ? "A nova senha precisa ser diferente da anterior."
          : "Não foi possível salvar a senha. O link pode ter expirado — peça um novo.",
      );
      return;
    }

    setEstado("sucesso");
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 2000);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8">
        {estado === "verificando" && (
          <div className="flex flex-col items-center gap-3 py-8 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <p className="text-sm">Validando seu link…</p>
          </div>
        )}

        {estado === "link_invalido" && (
          <div className="text-center">
            <div className="mx-auto mb-4 inline-flex rounded-full bg-red-50 p-3">
              <ShieldAlert className="h-8 w-8 text-red-600" aria-hidden />
            </div>
            <h1 className="text-xl font-semibold">Link inválido ou expirado</h1>
            <p className="mt-2 text-sm text-slate-600">
              Por segurança, o link de recuperação vale por 1 hora e só pode ser usado uma vez.
            </p>
            <Link
              href="/recuperar-senha"
              className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Pedir um novo link
            </Link>
          </div>
        )}

        {estado === "sucesso" && (
          <div className="text-center">
            <div className="mx-auto mb-4 inline-flex rounded-full bg-green-50 p-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden />
            </div>
            <h1 className="text-xl font-semibold">Senha alterada!</h1>
            <p className="mt-2 text-sm text-slate-600">Entrando no seu painel…</p>
          </div>
        )}

        {estado === "pronto" && (
          <>
            <h1 className="text-xl font-semibold">Criar nova senha</h1>
            <p className="mt-1 text-sm text-slate-500">
              Escolha uma senha forte com pelo menos 8 caracteres.
            </p>

            <form onSubmit={salvarNovaSenha} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Nova senha</span>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Confirmar nova senha
                </span>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    autoComplete="new-password"
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
                {carregando ? "Salvando…" : "Salvar nova senha"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
