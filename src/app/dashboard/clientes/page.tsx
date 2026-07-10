import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { listarClientes } from "@/services/clientes";
import { ListaClientes } from "./lista";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clientes — Agência Fiscal" };

export default async function ClientesPage() {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") redirect("/login");
  if (estado.tipo === "sem_empresa") redirect("/onboarding");

  const clientes = await listarClientes(db, { empresaId: estado.empresaId });

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

      <ListaClientes clientes={clientes} />
    </main>
  );
}
