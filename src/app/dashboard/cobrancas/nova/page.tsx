import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { listarClientes } from "@/services/clientes";
import { FormularioCobranca } from "./formulario";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nova cobrança — Agência Fiscal" };

export default async function NovaCobrancaPage({
  searchParams,
}: {
  searchParams: { cliente?: string };
}) {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") redirect("/login");
  if (estado.tipo === "sem_empresa") redirect("/onboarding");

  const clientes = await listarClientes(db, { empresaId: estado.empresaId });

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/dashboard/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar para clientes
      </Link>

      <header className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-brand-50 p-2">
          <Receipt className="h-6 w-6 text-brand-600" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Nova cobrança</h1>
          <p className="text-sm text-slate-500">
            O cliente recebe o link para pagar (Pix, boleto ou cartão). Quando o pagamento cair, a
            NFS-e é emitida automaticamente.
          </p>
        </div>
      </header>

      {clientes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Você ainda não tem clientes.{" "}
          <Link href="/dashboard/clientes" className="font-medium text-brand-600 hover:underline">
            Cadastre o primeiro
          </Link>{" "}
          para poder cobrar.
        </div>
      ) : (
        <FormularioCobranca
          clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
          clientePreSelecionado={searchParams.cliente}
        />
      )}
    </main>
  );
}
