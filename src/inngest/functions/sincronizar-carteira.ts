import { NonRetriableError } from "inngest";
import { inngest } from "../client";
import {
  EVENTO_CADASTRO_EMPRESA_SOLICITADO,
  EVENTO_SINCRONIZACAO_SOLICITADA,
  sincronizacaoSolicitadaSchema,
} from "../events";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverProvider } from "@/lib/fiscal/providers";
import { planejarSincronizacao, type EmpresaParaSincronizar } from "@/services/sincronizacao-provider";

/**
 * SINCRONIZAÇÃO DA CARTEIRA COM O PROVEDOR FISCAL
 *
 * Esta função faz a parte CARA-MAS-BARATA: uma varredura no provedor para saber
 * o que já existe lá, e só então decidir o que precisa ser criado. Ela não
 * cadastra nada — quem cadastra é `cadastrar-empresa-provider`, uma execução
 * por empresa, disparada no fim daqui.
 *
 * POR QUE DUAS FUNÇÕES E NÃO UMA. Uma função só, varrendo 600 empresas em 600
 * steps, seria uma execução longa em que qualquer falha no meio arrasta o
 * resto: um CNPJ com município não atendido na posição 417 seguraria os 183
 * seguintes. Separando, cada empresa falha, tenta de novo e é reportada por
 * conta própria — o mesmo princípio de "não é tudo ou nada" que já governa a
 * importação de CSV.
 *
 * A separação também é o que permite aplicar controle de taxa só onde ele
 * importa. A varredura custa 12 requisições para uma carteira de 600; o
 * cadastro custa uma por empresa, e é ele que precisa caber nos 100 créditos
 * por minuto do token, disputados com a emissão do dia.
 *
 * AGRUPA POR PROVEDOR de propósito. Em regime todas as empresas de uma carteira
 * estão no mesmo, mas `provider_fiscal` é coluna POR EMPRESA — assumir
 * uniformidade seria correto hoje e silenciosamente errado no dia em que
 * deixasse de ser.
 */
export const sincronizarCarteira = inngest.createFunction(
  { id: "sincronizar-carteira-provider", retries: 2 },
  { event: EVENTO_SINCRONIZACAO_SOLICITADA },
  async ({ event, step, logger }) => {
    const { empresaIds } = sincronizacaoSolicitadaSchema.parse(event.data);
    const db = createAdminClient();

    const empresas = await step.run("carregar-empresas", async () => {
      const { data, error } = await db
        .from("empresas")
        .select("id, cnpj, provider_fiscal, provider_empresa_id")
        .in("id", empresaIds);

      if (error) {
        throw new Error(`Falha ao carregar empresas da carteira: ${error.message}`);
      }
      if (!data || data.length === 0) {
        throw new NonRetriableError("Nenhuma das empresas informadas foi encontrada.");
      }
      return data;
    });

    // Agrupamento por provedor: cada um tem a própria conta e a própria lista.
    const porProvider = new Map<string, EmpresaParaSincronizar[]>();
    for (const e of empresas) {
      const grupo = porProvider.get(e.provider_fiscal) ?? [];
      grupo.push({ id: e.id, cnpj: e.cnpj, providerEmpresaId: e.provider_empresa_id });
      porProvider.set(e.provider_fiscal, grupo);
    }

    const resumo = { adotadas: 0, aCadastrar: 0, emDia: 0, divergentes: 0, semSuporte: 0 };
    const paraCadastrar: string[] = [];

    for (const [nomeProvider, doGrupo] of porProvider) {
      const plano = await step.run(`reconciliar-${nomeProvider}`, async () => {
        const provider = resolverProvider(nomeProvider, {});

        // Provedor sem listagem não pode ser reconciliado com segurança, e
        // cadastrar às cegas arriscaria duplicata. Melhor não fazer nada e
        // dizer que não fez.
        if (!provider.listarEmpresas || !provider.cadastrarEmpresa) {
          return null;
        }

        const noProvider = await provider.listarEmpresas();
        return planejarSincronizacao(doGrupo, noProvider);
      });

      if (!plano) {
        resumo.semSuporte += doGrupo.length;
        logger.warn("Provedor sem suporte a cadastro em lote", {
          provider: nomeProvider,
          empresas: doGrupo.length,
        });
        continue;
      }

      if (plano.adotar.length > 0) {
        await step.run(`adotar-ids-${nomeProvider}`, async () => {
          // Uma a uma: são poucas (só as que divergiram) e um update por linha
          // permite que uma falha isolada não desfaça as demais.
          for (const { empresaId, providerEmpresaId } of plano.adotar) {
            const { error } = await db
              .from("empresas")
              .update({
                provider_empresa_id: providerEmpresaId,
                provider_status: "cadastrada",
                provider_erro: null,
                provider_sincronizado_em: new Date().toISOString(),
              })
              .eq("id", empresaId);
            if (error) throw new Error(`Falha ao adotar id de ${empresaId}: ${error.message}`);
          }
          return plano.adotar.length;
        });
      }

      if (plano.emDia.length > 0) {
        await step.run(`confirmar-em-dia-${nomeProvider}`, async () => {
          const { error } = await db
            .from("empresas")
            .update({
              provider_status: "cadastrada",
              provider_erro: null,
              provider_sincronizado_em: new Date().toISOString(),
            })
            .in("id", plano.emDia);
          if (error) throw new Error(`Falha ao confirmar empresas em dia: ${error.message}`);
          return plano.emDia.length;
        });
      }

      if (plano.divergentes.length > 0) {
        await step.run(`marcar-divergentes-${nomeProvider}`, async () => {
          // NÃO recadastramos: o id sumiu do outro lado, e criar uma empresa
          // nova para um CNPJ que talvez ainda exista lá sob outro id é
          // exatamente a duplicata que a reconciliação existe para evitar.
          for (const d of plano.divergentes) {
            const { error } = await db
              .from("empresas")
              .update({
                provider_status: "falhou",
                provider_erro:
                  `O identificador ${d.providerEmpresaIdAusente} não existe mais no provedor. ` +
                  "Isso exige conferência manual: recadastrar automaticamente poderia " +
                  "duplicar a empresa.",
                provider_sincronizado_em: new Date().toISOString(),
              })
              .eq("id", d.empresaId);
            if (error) throw new Error(`Falha ao marcar divergente: ${error.message}`);
          }
          return plano.divergentes.length;
        });
      }

      resumo.adotadas += plano.adotar.length;
      resumo.emDia += plano.emDia.length;
      resumo.divergentes += plano.divergentes.length;
      resumo.aCadastrar += plano.cadastrar.length;
      paraCadastrar.push(...plano.cadastrar);
    }

    if (paraCadastrar.length > 0) {
      await step.run("marcar-em-andamento", async () => {
        const { error } = await db
          .from("empresas")
          .update({ provider_status: "cadastrando", provider_erro: null })
          .in("id", paraCadastrar);
        if (error) throw new Error(`Falha ao marcar em andamento: ${error.message}`);
        return paraCadastrar.length;
      });

      // Fan-out. O controle de taxa vive na função de destino, não aqui: emitir
      // 600 eventos é barato, executá-los é que precisa caber no orçamento.
      await step.sendEvent(
        "disparar-cadastros",
        paraCadastrar.map((empresaId) => ({
          name: EVENTO_CADASTRO_EMPRESA_SOLICITADO,
          data: { empresaId },
        })),
      );
    }

    logger.info("Carteira reconciliada com o provedor", resumo);
    return resumo;
  },
);
