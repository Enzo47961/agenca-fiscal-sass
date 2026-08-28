import { randomUUID } from "node:crypto";
import { NonRetriableError, RetryAfterError } from "inngest";
import { inngest } from "../client";
import { EVENTO_TESTE_EMISSAO_SOLICITADO, testeEmissaoSolicitadoSchema } from "../events";
import { createAdminClient } from "@/lib/supabase/admin";
import { FocusNfeProvider } from "@/lib/fiscal/providers/focusnfe";
import { focusNfeHomologacaoEnv } from "@/lib/env";
import { FiscalErrorTransient, isFiscalError } from "@/lib/fiscal/provider";
import { dataCivilBr } from "@/lib/data-br";
import {
  TesteNaoAplicavel,
  montarNotaDeTeste,
  resultadoDoTeste,
} from "@/services/teste-de-emissao";

/**
 * TESTE DE EMISSÃO EM HOMOLOGAÇÃO
 *
 * A Focus não tem endpoint que diga o que falta na configuração de uma empresa.
 * A recomendação oficial é *"efetuar um teste de emissão e conferir o retorno
 * da API"* — e é isso que esta função automatiza, uma empresa por execução.
 *
 * SÓ CHEGA AQUI QUEM PASSOU NA VALIDAÇÃO LOCAL. O mapa de municípios já
 * descartou, de graça, quem está em município sem NFS-e, fora do ar, sem
 * ambiente de homologação ou com dado faltando. Este job é a última camada, e a
 * única que gasta crédito.
 *
 * O PROVIDER É INSTANCIADO À MÃO, e não pelo `resolverProvider`. O registry
 * resolve o provider do TENANT, com o ambiente configurado para operar — que em
 * produção é produção. Aqui precisamos deliberadamente do outro ambiente, com
 * outro token: a documentação da Focus diz que entre eles "muda apenas a URL
 * base do servidor e o token".
 *
 * NÃO usa `transicionar_status_nota` nem cria linha em `notas_fiscais`: a nota
 * de teste não é do tenant, não entra em relatório e não deve poluir o
 * faturamento. O que fica é o veredito, em coluna própria da empresa.
 */
export const testarEmissaoEmpresa = inngest.createFunction(
  {
    id: "testar-emissao-empresa",
    retries: 2,
    // Mesmo orçamento compartilhado com o cadastro em lote e com a emissão
    // real. Testar carteira inteira não pode atrasar quem está faturando.
    throttle: { limit: 30, period: "1m" },
    concurrency: { key: "event.data.empresaId", limit: 1 },
  },
  { event: EVENTO_TESTE_EMISSAO_SOLICITADO },
  async ({ event, step, logger }) => {
    const { empresaId } = testeEmissaoSolicitadoSchema.parse(event.data);
    const db = createAdminClient();

    const empresa = await step.run("carregar-empresa", async () => {
      const { data, error } = await db
        .from("empresas")
        .select(
          "id, cnpj, razao_social, inscricao_municipal, codigo_municipio_ibge, email_contato, codigo_servico_teste, provider_status",
        )
        .eq("id", empresaId)
        .single();
      if (error || !data) {
        throw new NonRetriableError(`Empresa ${empresaId} não encontrada: ${error?.message}`);
      }
      return data;
    });

    // Testar quem nem existe no provedor devolveria "empresa não cadastrada" —
    // que a gente já sabe, e que custaria um crédito para reaprender.
    if (empresa.provider_status !== "cadastrada") {
      return { resultado: "nao-aplicavel" as const, motivo: "empresa ainda não cadastrada" };
    }

    const desfecho = await step.run("emitir-em-homologacao", async () => {
      const credencial = focusNfeHomologacaoEnv();
      if (!credencial) {
        throw new NonRetriableError(
          "FOCUSNFE_TOKEN_HOMOLOGACAO não configurado. O teste de emissão usa o ambiente " +
            "de homologação, que tem token próprio — o de produção não autentica lá.",
        );
      }

      let nota;
      try {
        nota = montarNotaDeTeste(
          {
            cnpj: empresa.cnpj,
            razaoSocial: empresa.razao_social,
            inscricaoMunicipal: empresa.inscricao_municipal,
            codigoMunicipioIbge: empresa.codigo_municipio_ibge,
            emailContato: empresa.email_contato,
            codigoServicoTeste: empresa.codigo_servico_teste,
          },
          // Referência nova a cada teste: reaproveitar cairia na idempotência do
          // provider e devolveria o resultado ANTIGO, escondendo a correção que
          // acabou de ser feita.
          `teste-${randomUUID()}`,
          dataCivilBr(),
        );
      } catch (e) {
        // Falta de dado nosso não é recusa da prefeitura: vira pendência
        // legível, sem gastar requisição.
        if (e instanceof TesteNaoAplicavel) {
          return { tipo: "pendente" as const, mensagem: e.message };
        }
        throw e;
      }

      const provider = new FocusNfeProvider({
        token: credencial.token,
        ambiente: "homologacao",
      });

      try {
        await provider.emitir(nota);
        return { tipo: "emitida" as const };
      } catch (e) {
        if (!isFiscalError(e)) {
          logger.error("Erro NÃO classificado no teste de emissão", { empresaId, erro: String(e) });
          throw e;
        }
        if (e instanceof FiscalErrorTransient) {
          const bruto = e.payloadBruto as { resetSegundos?: number | null } | null;
          const espera = bruto?.resetSegundos;
          if (typeof espera === "number" && espera > 0) {
            throw new RetryAfterError(e.message, espera * 1000);
          }
          throw e;
        }
        // Recusa permanente é EXATAMENTE o que o teste veio buscar: é o
        // diagnóstico, não a falha do job.
        return { tipo: "recusada" as const, mensagem: e.message };
      }
    });

    if (desfecho.tipo === "pendente") {
      await step.run("gravar-pendencia", async () => {
        const { error } = await db
          .from("empresas")
          .update({
            teste_emissao_em: new Date().toISOString(),
            teste_emissao_ok: false,
            teste_emissao_erro: desfecho.mensagem,
          })
          .eq("id", empresaId);
        if (error) throw new Error(error.message);
        return true;
      });
      return { resultado: "pendente" as const };
    }

    const veredito = resultadoDoTeste(desfecho);

    await step.run("gravar-veredito", async () => {
      const { error } = await db
        .from("empresas")
        .update({
          teste_emissao_em: new Date().toISOString(),
          teste_emissao_ok: veredito.ok,
          teste_emissao_erro: veredito.erro,
        })
        .eq("id", empresaId);
      if (error) throw new Error(`Teste feito mas não gravado: ${error.message}`);
      return true;
    });

    logger.info("Teste de emissão concluído", { empresaId, ok: veredito.ok });
    return { resultado: veredito.ok ? ("aprovada" as const) : ("recusada" as const) };
  },
);
