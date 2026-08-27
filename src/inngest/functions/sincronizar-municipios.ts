import { NonRetriableError } from "inngest";
import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverProvider } from "@/lib/fiscal/providers";
import { nomesDeProvidersDisponiveis } from "@/lib/fiscal/providers";

/**
 * SINCRONIZAÇÃO DO MAPA DE MUNICÍPIOS
 *
 * Roda semanalmente. É a única peça do onboarding que custa créditos sem estar
 * ligada a nenhuma empresa — e é exatamente por isso que ela existe: o que este
 * job baixa uma vez por semana evita uma tentativa de emissão por empresa.
 *
 * A conta que justifica: o país tem ~5.570 municípios, 100 por página, ~56
 * requisições. Uma carteira de 600 CNPJs sem este mapa gastaria até 600
 * tentativas para descobrir coisas que o mapa entrega de graça — quais
 * municípios sequer emitem NFS-e, quais estão fora do ar e quais não têm
 * ambiente de teste.
 *
 * SEMANAL, E NÃO DIÁRIO: `status_nfse` muda quando uma prefeitura cai, mas
 * `possui_ambiente_homologacao_nfse` e as obrigatoriedades mudam em escala de
 * meses. Diário gastaria 56 créditos por dia para capturar quase nada — e o
 * caso urgente (município caiu hoje) é resolvido pela própria tentativa de
 * emissão, que traz o erro do provedor.
 */
export const sincronizarMunicipios = inngest.createFunction(
  { id: "sincronizar-mapa-municipios", retries: 2 },
  { cron: "40 7 * * 1" }, // segunda-feira, 07:40 UTC (~04:40 BRT), longe dos outros jobs
  async ({ step, logger }) => {
    const db = createAdminClient();

    const municipios = await step.run("baixar-mapa", async () => {
      // Qualquer provider real serve: o mapa é do provedor, não do tenant. O
      // mock não tem municípios, então não há o que sincronizar sem credencial.
      const nome = nomesDeProvidersDisponiveis().find((n) => n !== "mock");
      if (!nome) {
        throw new NonRetriableError(
          "Nenhum provedor fiscal real configurado — o mapa de municípios vem dele.",
        );
      }

      const provider = resolverProvider(nome, {});
      if (!provider.listarMunicipios) {
        throw new NonRetriableError(`O provedor "${nome}" não expõe o mapa de municípios.`);
      }
      return provider.listarMunicipios();
    });

    if (municipios.length === 0) {
      // Mapa vazio nunca é resultado legítimo, e gravá-lo apagaria o cache bom
      // que já existe — deixando toda a carteira sem regras conhecidas.
      throw new NonRetriableError(
        "O provedor devolveu um mapa de municípios vazio. Nada foi gravado.",
      );
    }

    const gravados = await step.run("gravar-mapa", async () => {
      const linhas = municipios.map((m) => ({
        codigo_ibge: m.codigoIbge,
        nome: m.nome,
        uf: m.uf,
        nfse_habilitada: m.nfseHabilitada,
        possui_homologacao: m.possuiHomologacao,
        possui_cancelamento: m.possuiCancelamento,
        requer_certificado: m.requerCertificado,
        provedor: m.provedor,
        status: m.status,
        previsao_reimplementacao: m.previsaoReimplementacao,
        ultima_emissao: m.ultimaEmissao,
        endereco_obrigatorio: m.enderecoObrigatorio,
        cpf_cnpj_obrigatorio: m.cpfCnpjObrigatorio,
        cnae_obrigatorio: m.cnaeObrigatorio,
        item_lista_servico_obrigatorio: m.itemListaServicoObrigatorio,
        codigo_tributario_obrigatorio: m.codigoTributarioObrigatorio,
        sincronizado_em: new Date().toISOString(),
      }));

      // Em lotes: 5.570 linhas num upsert só é payload grande demais para uma
      // função serverless, e falhar no fim perderia o trabalho inteiro.
      const LOTE = 500;
      let total = 0;
      for (let i = 0; i < linhas.length; i += LOTE) {
        const { error } = await db
          .from("municipios_nfse")
          .upsert(linhas.slice(i, i + LOTE), { onConflict: "codigo_ibge" });
        if (error) {
          throw new Error(`Falha ao gravar o lote a partir de ${i}: ${error.message}`);
        }
        total += Math.min(LOTE, linhas.length - i);
      }
      return total;
    });

    // Municípios que somem do mapa NÃO são apagados: empresa já cadastrada
    // continua referenciando o código, e apagar a linha faria a validação
    // perder a regra sem avisar ninguém.
    const resumo = {
      recebidos: municipios.length,
      gravados,
      comNfse: municipios.filter((m) => m.nfseHabilitada).length,
      comHomologacao: municipios.filter((m) => m.possuiHomologacao === true).length,
    };
    logger.info("Mapa de municípios sincronizado", resumo);
    return resumo;
  },
);
