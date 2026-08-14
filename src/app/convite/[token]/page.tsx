import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { aceitarConvite } from "@/services/convites";

export const dynamic = "force-dynamic";

/**
 * Aceite do convite.
 *
 * NÃO ACEITA SOZINHA AO ABRIR. Um GET que altera estado é aceito por
 * pré-carregador de link, antivírus corporativo e scanner de e-mail — e há
 * gateways que abrem todo link recebido para verificação. O convite seria
 * "aceito" antes de a pessoa clicar, e o token queimaria sem ninguém entrar.
 * Por isso a página mostra o que vai acontecer e espera um POST do botão.
 *
 * Quem não está logado é mandado ao login com `next` de volta para cá, para
 * voltar ao mesmo token depois de entrar.
 */
export default async function ConvitePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { erro?: string };
}) {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);

  if (estado.tipo === "deslogado") {
    redirect(`/login?next=${encodeURIComponent(`/convite/${params.token}`)}`);
  }

  async function aceitar() {
    "use server";
    const db = createSessionClient();
    let empresaId: string;
    try {
      ({ empresaId } = await aceitarConvite(db, params.token));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível aceitar o convite.";
      redirect(`/convite/${params.token}?erro=${encodeURIComponent(msg)}`);
    }
    // Entrou: manda direto ao painel da empresa recém-acessada.
    redirect(`/dashboard?empresa=${empresaId}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold">Convite de acesso</h1>
        <p className="mt-2 text-sm text-slate-600">
          Você foi convidado a acessar uma empresa na Agência Fiscal. Ao aceitar, ela passa a
          aparecer no seu painel.
        </p>

        {searchParams.erro && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-800"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {searchParams.erro}
          </p>
        )}

        <form action={aceitar} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Aceitar convite
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          O convite vale só para o e-mail que o recebeu. Se você entrou com outra conta,{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            troque de conta
          </Link>{" "}
          antes de aceitar.
        </p>
      </div>
    </main>
  );
}
