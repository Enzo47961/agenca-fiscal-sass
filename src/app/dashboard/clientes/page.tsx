import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { listarClientes } from "@/services/clientes";
import { ListaClientes } from "./lista";
import { Paginacao } from "./paginacao";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clientes — Agência Fiscal" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { pagina?: string; busca?: string };
}) {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") redirect("/login");
  if (estado.tipo === "sem_empresa") redirect("/onboarding");

  const pagina = await listarClientes(db, {
    empresaId: estado.empresaId,
    pagina: Number(searchParams.pagina) || 1,
    busca: searchParams.busca,
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar ao painel
      </Link>

      <header className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-brand-50 p-2">
          <Users className="h-6 w-6 text-brand-600" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-slate-500">
            Quem recebe suas notas fiscais. Cadastre antes de criar a primeira cobrança.
          </p>
        </div>
      </header>

      {/*
        Busca em <form method="get">, sem JavaScript: o termo vira query string,
        a URL fica compartilhável e a paginação sabe preservá-la. É o que dá ao
        usuário como achar um cliente que não está na primeira página.
      */}
      <form method="get" className="mb-4 flex gap-2">
        <input
          type="search"
          name="busca"
          defaultValue={searchParams.busca ?? ""}
          placeholder="Buscar por nome"
          aria-label="Buscar clientes por nome"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Buscar
        </button>
      </form>

      {searchParams.busca ? (
        <p className="mb-3 text-sm text-slate-500">
          {pagina.total} resultado{pagina.total === 1 ? "" : "s"} para{" "}
          <strong>{searchParams.busca}</strong> ·{" "}
          <Link href="/dashboard/clientes" className="text-brand-600 hover:underline">
            limpar
          </Link>
        </p>
      ) : null}

      <ListaClientes clientes={pagina.itens} />

      <Paginacao pagina={pagina} busca={searchParams.busca} />
    </main>
  );
}
