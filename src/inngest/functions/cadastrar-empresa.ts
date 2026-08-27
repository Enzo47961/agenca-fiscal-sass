import { NonRetriableError, RetryAfterError } from "inngest";
import { inngest } from "../client";
import { EVENTO_CADASTRO_EMPRESA_SOLICITADO, cadastroEmpresaSolicitadoSchema } from "../events";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverProvider } from "@/lib/fiscal/providers";
import { FiscalErrorPermanent, FiscalErrorTransient, isFiscalError } from "@/lib/fiscal/provider";

/**
 * CADASTRO DE UMA EMPRESA NO PROVEDOR FISCAL
 *
 * Uma execução por empresa. Quem decide quais empresas entram é
 * `sincronizar-carteira-provider`, que reconcilia antes e só manda para cá o
 * que comprovadamente ainda não existe do outro lado.
 *
 * O CONTROLE DE TAXA É CONFIGURAÇÃO, NÃO CÓDIGO. A API da Focus concede 100
 * créditos por minuto por token, e cada requisição gasta um. `throttle` deixa
 * essa regra declarada no lugar onde ela é verdadeira — vale entre execuções,
 * o que nenhum `sleep` escrito à mão conseguiria.
 *
 * O LIMITE É 60, E NÃO 100, DE PROPÓSITO. Os 40 créditos restantes ficam
 * reservados para a emissão. Migrar uma carteira é operação de fundo; deixar
 * que ela consuma o orçamento inteiro faria a nota de um cliente que está
 * faturando AGORA esperar por um cadastro em massa — trocar urgência real por
 * conveniência de implantação é a inversão errada.
 *
 * `retries` do Inngest, e não backoff nosso (regra 13): aqui não há máquina de
 * estados a preservar entre tentativas, então misturar os dois só criaria duas
 * fontes de verdade sobre quando tentar de novo.
 */
export const cadastrarEmpresaProvider = inngest.createFunction(
  {
    id: "cadastrar-empresa-provider",
    retries: 3,
    throttle: { limit: 60, period: "1m" },
    // Dois eventos para a mesma empresa não podem correr juntos: os dois
    // veriam provider_empresa_id nulo e criariam duas empresas no provedor.
    concurrency: { key: "event.data.empresaId", limit: 1 },
  },
  { event: EVENTO_CADASTRO_EMPRESA_SOLICITADO },
  async ({ event, step, logger }) => {
    const { empresaId } = cadastroEmpresaSolicitadoSchema.parse(event.data);
    const db = createAdminClient();

    const empresa = await step.run("carregar-empresa", async () => {
      const { data, error } = await db
        .from("empresas")
        .select(
          "id, cnpj, razao_social, inscricao_municipal, codigo_municipio_ibge, email_contato, regime_tributario, provider_fiscal, provider_empresa_id",
        )
        .eq("id", empresaId)
        .single();

      if (error || !data) {
        throw new NonRetriableError(`Empresa ${empresaId} não encontrada: ${error?.message}`);
      }
      return data;
    });

    // Já cadastrada: evento duplicado, ou a sincronização adotou o id no
    // intervalo. Sair aqui é o que impede a duplicata.
    if (empresa.provider_empresa_id) {
      await step.run("confirmar-ja-cadastrada", async () => {
        const { error } = await db
          .from("empresas")
          .update({
            provider_status: "cadastrada",
            provider_erro: null,
            provider_sincronizado_em: new Date().toISOString(),
          })
          .eq("id", empresaId);
        if (error) throw new Error(error.message);
        return true;
      });
      return { resultado: "ja-cadastrada" as const };
    }

    const resultado = await step.run("cadastrar-no-provider", async () => {
      const provider = resolverProvider(empresa.provider_fiscal, {});

      if (!provider.cadastrarEmpresa) {
        throw new NonRetriableError(
          `O provedor "${empresa.provider_fiscal}" não suporta cadastro de empresa pela API.`,
        );
      }

      try {
        const r = await provider.cadastrarEmpresa({
          empresa: {
            cnpj: empresa.cnpj,
            razaoSocial: empresa.razao_social,
            // Inscrição municipal ausente NÃO barra o cadastro: ela é exigida
            // na emissão, e travar a carteira inteira por um campo que o
            // escritório preenche depois seria falha fechada no lugar errado.
            inscricaoMunicipal: empresa.inscricao_municipal,
            codigoMunicipioIbge: empresa.codigo_municipio_ibge,
            emailContato: empresa.email_contato,
            regimeTributario: empresa.regime_tributario,
          },
        });
        return { ok: true as const, providerEmpresaId: r.providerEmpresaId };
      } catch (e) {
        if (!isFiscalError(e)) {
          logger.error("Erro NÃO classificado no cadastro de empresa", { empresaId, erro: String(e) });
          throw e;
        }

        // 429 e afins trazem, quando a Focus informa, quantos segundos faltam
        // para o contador de créditos zerar. Esperar exatamente isso é melhor
        // que qualquer palpite: o backoff genérico dormiria minutos onde a
        // própria API está dizendo que faltam segundos.
        if (e instanceof FiscalErrorTransient) {
          const bruto = e.payloadBruto as { resetSegundos?: number | null } | null;
          const espera = bruto?.resetSegundos;
          if (typeof espera === "number" && espera > 0) {
            throw new RetryAfterError(e.message, espera * 1000);
          }
          throw e; // transiente sem dica: backoff padrão do Inngest
        }

        return { ok: false as const, erro: (e as FiscalErrorPermanent).message };
      }
    });

    if (resultado.ok) {
      await step.run("gravar-cadastro", async () => {
        const { error } = await db
          .from("empresas")
          .update({
            provider_empresa_id: resultado.providerEmpresaId,
            provider_status: "cadastrada",
            provider_erro: null,
            provider_sincronizado_em: new Date().toISOString(),
          })
          .eq("id", empresaId);
        if (error) throw new Error(`Cadastro feito no provedor mas não gravado: ${error.message}`);
        return true;
      });
      return { resultado: "cadastrada" as const, providerEmpresaId: resultado.providerEmpresaId };
    }

    // Recusa permanente: quase sempre dado cadastral (município não atendido,
    // IM em formato inválido). A mensagem do provedor é gravada COMO VEIO —
    // ela é a única explicação confiável do que precisa ser corrigido.
    await step.run("gravar-falha", async () => {
      const { error } = await db
        .from("empresas")
        .update({
          provider_status: "falhou",
          provider_erro: resultado.erro,
          provider_sincronizado_em: new Date().toISOString(),
        })
        .eq("id", empresaId);
      if (error) throw new Error(error.message);
      return true;
    });

    return { resultado: "falhou" as const, erro: resultado.erro };
  },
);
