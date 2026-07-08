import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { createSessionClient, empresaDaSessao } from "@/lib/supabase/server";
import { FormularioConfiguracoes } from "./formulario";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const db = createSessionClient();
  const sessao = await empresaDaSessao(db);
  if (!sessao) redirect("/login");

  const { data: empresa } = await db
    .from("empresas")
    .select(
      "razao_social, nome_fantasia, cnpj, inscricao_municipal, codigo_municipio_ibge, regime_tributario, email_contato",
    )
    .eq("id", sessao.empresaId)
    .single();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar ao painel
        </Link>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-50 p-2">
            <Building2 className="h-6 w-6 text-brand-600" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Onboarding fiscal</h1>
            <p className="text-sm text-slate-500">
              Dados do CNPJ, regime tributário (IBS/CBS 2026) e certificado digital A1
            </p>
          </div>
        </div>
      </header>

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
        <p>
          Seu certificado A1 é <strong>criptografado (AES-256-GCM) antes de ser armazenado</strong> e
          nunca fica acessível em claro. Ele é usado exclusivamente para assinar as NFS-e junto à
          prefeitura.
        </p>
      </div>

      <FormularioConfiguracoes
        dadosIniciais={{
          razaoSocial: empresa?.razao_social ?? "",
          nomeFantasia: empresa?.nome_fantasia ?? "",
          cnpj: empresa?.cnpj ?? "",
          inscricaoMunicipal: empresa?.inscricao_municipal ?? "",
          codigoMunicipioIbge: empresa?.codigo_municipio_ibge ?? "",
          regimeTributario: empresa?.regime_tributario ?? "simples_nacional",
          emailContato: empresa?.email_contato ?? "",
        }}
      />
    </main>
  );
}
