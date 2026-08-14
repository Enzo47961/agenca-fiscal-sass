import { redirect } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { listarConvitesPendentes, PAPEL_DESCRICAO, PAPEL_LABEL } from "@/services/convites";
import { FormularioConvite, ListaConvites } from "./formulario";

export const dynamic = "force-dynamic";

/**
 * Gestão de acesso da empresa ativa.
 *
 * A tela só aparece para owner e admin — mas isso é conveniência, não controle:
 * quem decide é a policy do banco. Um operador que digitasse a URL veria a
 * página vazia (a policy de `convites` não devolve linhas) e qualquer tentativa
 * de convidar seria recusada por `criar_convite()`.
 */
export default async function EquipePage() {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo !== "com_empresa") redirect("/login");

  const { data: papelRaw } = await db.rpc("meu_papel", { p_empresa_id: estado.empresaId });
  const papel = (papelRaw as unknown as string | null) ?? "operador";
  const podeGerenciar = papel === "owner" || papel === "admin";

  const convites = podeGerenciar ? await listarConvitesPendentes(db, estado.empresaId) : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Users className="h-6 w-6 text-brand-600" aria-hidden />
        Acesso à empresa
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Convide o cliente ou alguém da sua equipe para operar esta empresa, com o nível de acesso
        que fizer sentido.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />
          Seu nível de acesso aqui: {PAPEL_LABEL[papel] ?? papel}
        </p>
        <ul className="mt-3 space-y-2 text-xs text-slate-600">
          {(["owner", "admin", "operador"] as const).map((p) => (
            <li key={p}>
              <strong className="text-slate-700">{PAPEL_LABEL[p]}:</strong> {PAPEL_DESCRICAO[p]}
            </li>
          ))}
        </ul>
      </section>

      {podeGerenciar ? (
        <>
          <section className="mt-6">
            <FormularioConvite />
          </section>
          <section className="mt-6">
            <ListaConvites convites={convites} />
          </section>
        </>
      ) : (
        <p className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Como <strong>{PAPEL_LABEL[papel] ?? papel}</strong>, você não gerencia o acesso desta
          empresa. Peça a um administrador.
        </p>
      )}
    </main>
  );
}
