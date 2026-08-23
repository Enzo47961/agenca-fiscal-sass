import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { FormularioConfiguracoes } from "./formulario";
import { providersDisponiveis } from "@/lib/fiscal/providers";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") redirect("/login");
  if (estado.tipo === "sem_empresa") redirect("/onboarding");
  const sessao = { empresaId: estado.empresaId };

  const { data: empresa } = await db
    .from("empresas")
    .select(
      "razao_social, nome_fantasia, cnpj, inscricao_municipal, codigo_municipio_ibge, regime_tributario, email_contato, cnae, situacao_simples_nacional, regime_apuracao_ibscbs_sn, data_opcao_regime_regular, regime_apuracao_confirmado_em, certificado_valido_ate, provider_fiscal",
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

      {/*
        Este aviso JA DESCREVEU a arquitetura antiga — "criptografado (AES-256-GCM)
        antes de ser armazenado". Isso deixou de ser verdade em 12/08/2026, quando o
        .pfx passou a ser repassado ao provider em vez de guardado (ver
        `enviarCertificadoA1` em services/empresas.ts). O texto sobreviveu à mudança e
        contradizia o bloco do formulário, que estava certo.

        A promessa nova é mais forte que a antiga, e é por isso que ela fica no topo:
        "ciframos a nossa cópia" protege um risco que "não temos cópia" elimina. Para
        quem entrega certificado de TERCEIROS — o escritório de contabilidade — essa
        diferença é a decisão de compra.
      */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
        <p>
          <strong>Não guardamos o seu certificado A1.</strong> Ele é enviado direto ao provedor
          fiscal, que já precisa dele para assinar as NFS-e. Aqui ficam apenas a data de validade,
          para avisar antes do vencimento, e o vínculo com o provedor — nem o arquivo, nem a senha.
        </p>
      </div>

      <FormularioConfiguracoes
        providers={providersDisponiveis()}
        dadosIniciais={{
          razaoSocial: empresa?.razao_social ?? "",
          nomeFantasia: empresa?.nome_fantasia ?? "",
          cnpj: empresa?.cnpj ?? "",
          inscricaoMunicipal: empresa?.inscricao_municipal ?? "",
          codigoMunicipioIbge: empresa?.codigo_municipio_ibge ?? "",
          regimeTributario: empresa?.regime_tributario ?? "simples_nacional",
          emailContato: empresa?.email_contato ?? "",
          cnae: empresa?.cnae ?? "",
          situacaoSimplesNacional: empresa?.situacao_simples_nacional ?? "nao_optante",
          regimeApuracaoSN: empresa?.regime_apuracao_ibscbs_sn ?? null,
          dataOpcaoRegimeRegular: empresa?.data_opcao_regime_regular ?? null,
          regimeApuracaoConfirmadoEm: empresa?.regime_apuracao_confirmado_em ?? null,
          certificadoValidoAte: empresa?.certificado_valido_ate ?? null,
          providerFiscal: empresa?.provider_fiscal ?? "mock",
        }}
      />
    </main>
  );
}
