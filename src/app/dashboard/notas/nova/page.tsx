import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { CLIENTES_POR_PAGINA_MAX, listarClientes } from "@/services/clientes";
import { FormularioEmissao } from "./formulario";

export const dynamic = "force-dynamic";

export const metadata = { title: "Emitir nota — Agência Fiscal" };

export default async function NovaNotaPage() {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") redirect("/login");
  if (estado.tipo === "sem_empresa") redirect("/onboarding");

  // Este seletor precisa da lista inteira, mas "inteira" não pode ser
  // ilimitada. Pede o teto e, se ainda assim houver mais, AVISA — truncar em
  // silêncio faria o usuário concluir que o cliente sumiu do cadastro.
  const pagina = await listarClientes(db, {
    empresaId: estado.empresaId,
    porPagina: CLIENTES_POR_PAGINA_MAX,
  });
  const clientes = pagina.itens;

  // O regime da empresa decide se o aviso do NBS aparece (A7). Falha aqui não
  // impede emitir: sem o regime, o formulário só deixa de mostrar um aviso.
  const { data: empresa } = await db
    .from("empresas")
    .select("regime_tributario")
    .eq("id", estado.empresaId)
    .single();

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar ao painel
      </Link>

      <header className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-brand-50 p-2">
          <FilePlus2 className="h-6 w-6 text-brand-600" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Emitir nota manualmente</h1>
          <p className="text-sm text-slate-500">
            Para serviços já pagos por fora ou casos especiais — sem passar pela cobrança
            automática. O motor de retry cuida do resto.
          </p>
        </div>
      </header>

      {clientes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Você ainda não tem clientes.{" "}
          <Link href="/dashboard/clientes" className="font-medium text-brand-600 hover:underline">
            Cadastre o primeiro
          </Link>{" "}
          para poder emitir.
        </div>
      ) : (
        <>
          {pagina.temMais ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Mostrando os primeiros {pagina.itens.length} de {pagina.total} clientes. Se o que
              você procura não estiver aqui, use a busca na tela de{" "}
              <Link href="/dashboard/clientes" className="font-medium underline">
                Clientes
              </Link>
              .
            </p>
          ) : null}
          <FormularioEmissao
            clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
            regimeTributario={empresa?.regime_tributario ?? null}
          />
        </>
      )}
    </main>
  );
}
