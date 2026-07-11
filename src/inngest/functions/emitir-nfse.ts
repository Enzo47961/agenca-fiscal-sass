import { NonRetriableError, type GetStepTools } from "inngest";
import { inngest } from "../client";
import {
  EVENTO_EMISSAO_CONCLUIDA,
  EVENTO_EMISSAO_FALHOU,
  EVENTO_EMISSAO_SOLICITADA,
  emissaoSolicitadaSchema,
} from "../events";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverProvider } from "@/lib/fiscal/providers";
import {
  FiscalErrorPermanent,
  isFiscalError,
  type EmitirNfseResult,
} from "@/lib/fiscal/provider";
import { emailConfigurado, emailNotaEmitida, enviarEmail } from "@/lib/email/resend";

/**
 * MOTOR DE RETRY RESILIENTE (regras 5–13 do CLAUDE.md)
 *
 * Backoff fixo do produto (regra 9): 4 tentativas totais.
 *   tentativa 1 → falhou? espera 5 min
 *   tentativa 2 → falhou? espera 15 min
 *   tentativa 3 → falhou? espera 1 h
 *   tentativa 4 → falhou? status `falhou` (definitivo) + evento nfse/emissao.falhou
 *
 * Erro PERMANENTE em qualquer tentativa → `falhou` imediato, sem retry.
 * Idempotência garantida por `referencia_externa` + steps nomeados do Inngest.
 */
const RETRY_DELAYS = ["5m", "15m", "1h"] as const;
const MAX_TENTATIVAS = RETRY_DELAYS.length + 1; // 4

export const emitirNfse = inngest.createFunction(
  {
    id: "emitir-nfse",
    // Retry automático do Inngest DESLIGADO: o backoff é nosso (regra 13).
    retries: 0,
    // Uma execução por nota por vez — evita corrida em reprocessamento manual.
    concurrency: { key: "event.data.notaId", limit: 1 },
  },
  { event: EVENTO_EMISSAO_SOLICITADA },
  async ({ event, step, logger }) => {
    const { notaId, empresaId } = emissaoSolicitadaSchema.parse(event.data);
    const db = createAdminClient();

    // ------------------------------------------------------------------
    // 1. Carregar nota + empresa + cliente e validar estado inicial
    // ------------------------------------------------------------------
    const contexto = await step.run("carregar-nota", async () => {
      const { data: nota, error } = await db
        .from("notas_fiscais")
        .select("*, empresas(*), clientes(*)")
        .eq("id", notaId)
        .eq("empresa_id", empresaId)
        .single();

      if (error || !nota) {
        throw new NonRetriableError(`Nota ${notaId} não encontrada: ${error?.message}`);
      }
      if (nota.status === "emitida") {
        return null; // já emitida (evento duplicado) — não fazer nada
      }
      if (nota.status !== "pendente") {
        throw new NonRetriableError(
          `Nota ${notaId} em status "${nota.status}" — motor só processa "pendente".`,
        );
      }
      return nota;
    });

    if (!contexto) {
      return { resultado: "ja-emitida" as const };
    }

    // ------------------------------------------------------------------
    // 2. pendente → reprocessando (via máquina de estados, regra 6)
    // ------------------------------------------------------------------
    await step.run("transicionar-para-reprocessando", async () => {
      const { error } = await db.rpc("transicionar_status_nota", {
        p_nota_id: notaId,
        p_novo_status: "reprocessando",
      });
      if (error) throw new NonRetriableError(`Transição falhou: ${error.message}`);
    });

    const empresa = contexto.empresas;
    const cliente = contexto.clientes;

    // ------------------------------------------------------------------
    // 3. Loop de tentativas com backoff exponencial
    // ------------------------------------------------------------------
    let ultimoErro: { codigo: string | null; mensagem: string } | null = null;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      const resultado = await step.run(`emitir-tentativa-${tentativa}`, async () => {
        const inicio = Date.now();
        const provider = resolverProvider(empresa.provider_fiscal);

        try {
          // Timeout defensivo: se a tentativa anterior morreu APÓS o envio,
          // a nota pode existir no provider. Consultar antes de reemitir.
          const existente =
            tentativa > 1
              ? await provider.consultarPorReferencia(contexto.referencia_externa)
              : null;

          const emissao: EmitirNfseResult =
            existente ??
            (await provider.emitir({
              referenciaExterna: contexto.referencia_externa,
              prestador: {
                cnpj: empresa.cnpj,
                inscricaoMunicipal: empresa.inscricao_municipal,
                codigoMunicipioIbge: empresa.codigo_municipio_ibge,
              },
              tomador: {
                cpfCnpj: cliente.cpf_cnpj,
                nome: cliente.nome,
                email: cliente.email,
                endereco: cliente.endereco as Record<string, unknown>,
              },
              servico: {
                descricao: contexto.descricao_servico,
                codigoServico: contexto.codigo_servico,
                valorCentavos: contexto.valor_servico_centavos,
                aliquotaIss: Number(contexto.aliquota_iss),
                issRetido: contexto.iss_retido,
                competencia: contexto.competencia,
              },
            }));

          await registrarTentativa(db, {
            notaId,
            empresaId,
            numero: tentativa,
            resultado: "sucesso",
            duracaoMs: Date.now() - inicio,
          });

          return { ok: true as const, emissao };
        } catch (e) {
          if (!isFiscalError(e)) {
            // Erro não classificado (bug/infra nossa) → tratar como transiente,
            // mas logar como tal para investigação (regra 8: nunca engolir).
            logger.error("Erro NÃO classificado na emissão", { notaId, tentativa, erro: String(e) });
          }
          const codigo = isFiscalError(e) ? e.codigo : null;
          const mensagem = e instanceof Error ? e.message : String(e);
          const permanente = e instanceof FiscalErrorPermanent;

          await registrarTentativa(db, {
            notaId,
            empresaId,
            numero: tentativa,
            resultado: permanente ? "erro_permanente" : "erro_transiente",
            erroCodigo: codigo,
            erroMensagem: mensagem,
            payloadErro: isFiscalError(e) ? e.payloadBruto : null,
            duracaoMs: Date.now() - inicio,
          });

          return { ok: false as const, permanente, codigo, mensagem };
        }
      });

      // ---- Sucesso: gravar resultado e encerrar --------------------------
      if (resultado.ok) {
        await step.run("gravar-emissao", async () => {
          const { error: e1 } = await db
            .from("notas_fiscais")
            .update({
              numero_nfse: resultado.emissao.numeroNfse,
              codigo_verificacao: resultado.emissao.codigoVerificacao,
              provider_id: resultado.emissao.providerId,
              url_pdf: resultado.emissao.urlPdf,
              url_xml: resultado.emissao.urlXml,
              emitida_em: new Date().toISOString(),
              tentativas: tentativa,
              proxima_tentativa_em: null,
            })
            .eq("id", notaId);
          if (e1) throw new Error(`Falha ao gravar emissão: ${e1.message}`);

          const { error: e2 } = await db.rpc("transicionar_status_nota", {
            p_nota_id: notaId,
            p_novo_status: "emitida",
          });
          if (e2) throw new Error(`Transição para emitida falhou: ${e2.message}`);
        });

        // E-mail para o cliente final — NÃO-FATAL: a nota já foi emitida com
        // sucesso; falha de e-mail é logada e persistida no retorno do step,
        // nunca relançada (não pode reverter nem reprocessar a emissão).
        await step.run("enviar-email-cliente", async () => {
          if (!cliente.email) {
            return { enviado: false as const, motivo: "cliente-sem-email" };
          }
          if (!emailConfigurado()) {
            logger.warn("RESEND_API_KEY ausente — e-mail da nota não enviado", { notaId });
            return { enviado: false as const, motivo: "email-nao-configurado" };
          }
          try {
            const template = emailNotaEmitida({
              nomeCliente: cliente.nome,
              nomeEmpresa: empresa.nome_fantasia ?? empresa.razao_social,
              numeroNfse: resultado.emissao.numeroNfse,
              urlPdf: resultado.emissao.urlPdf,
            });
            const { emailId } = await enviarEmail({
              para: cliente.email,
              assunto: template.assunto,
              html: template.html,
            });
            return { enviado: true as const, emailId };
          } catch (e) {
            logger.error("Falha ao enviar e-mail da nota (não-fatal)", {
              notaId,
              erro: e instanceof Error ? e.message : String(e),
            });
            return { enviado: false as const, motivo: "erro-envio" };
          }
        });

        await step.sendEvent("evento-concluida", {
          name: EVENTO_EMISSAO_CONCLUIDA,
          data: { notaId, empresaId, numeroNfse: resultado.emissao.numeroNfse },
        });

        return { resultado: "emitida" as const, tentativas: tentativa };
      }

      ultimoErro = { codigo: resultado.codigo, mensagem: resultado.mensagem };

      // ---- Erro permanente: falha imediata, sem queimar retries ---------
      if (resultado.permanente) {
        await falharDefinitivamente(step, db, {
          notaId,
          empresaId,
          tentativas: tentativa,
          erro: ultimoErro,
        });
        return { resultado: "falhou-permanente" as const, tentativas: tentativa };
      }

      // ---- Erro transiente: agendar retry se ainda há tentativas --------
      if (tentativa < MAX_TENTATIVAS) {
        const delay = delayParaTentativa(tentativa);

        await step.run(`atualizar-contador-${tentativa}`, async () => {
          await db
            .from("notas_fiscais")
            .update({
              tentativas: tentativa,
              ultimo_erro: ultimoErro?.mensagem ?? null,
              ultimo_erro_codigo: ultimoErro?.codigo ?? null,
              proxima_tentativa_em: proximaTentativaIso(delay),
            })
            .eq("id", notaId);
        });

        logger.warn(`Nota ${notaId}: tentativa ${tentativa} falhou (transiente). Retry em ${delay}.`);
        // Nome único por iteração — obrigatório (ver "Armadilhas" no CLAUDE.md)
        await step.sleep(`aguardar-retry-${tentativa}`, delay);
      }
    }

    // ------------------------------------------------------------------
    // 4. Tentativas esgotadas → falha definitiva
    // ------------------------------------------------------------------
    await falharDefinitivamente(step, db, {
      notaId,
      empresaId,
      tentativas: MAX_TENTATIVAS,
      erro: ultimoErro ?? { codigo: null, mensagem: "Tentativas esgotadas" },
    });
    return { resultado: "falhou-esgotado" as const, tentativas: MAX_TENTATIVAS };
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof createAdminClient>;
type StepTools = GetStepTools<typeof inngest>;

async function registrarTentativa(
  db: Db,
  t: {
    notaId: string;
    empresaId: string;
    numero: number;
    resultado: "sucesso" | "erro_transiente" | "erro_permanente";
    erroCodigo?: string | null;
    erroMensagem?: string | null;
    payloadErro?: unknown;
    duracaoMs: number;
  },
): Promise<void> {
  // upsert pela UNIQUE(nota_id, numero_tentativa): replay do Inngest não duplica log
  const { error } = await db.from("notas_fiscais_tentativas").upsert(
    {
      nota_id: t.notaId,
      empresa_id: t.empresaId,
      numero_tentativa: t.numero,
      resultado: t.resultado,
      erro_codigo: t.erroCodigo ?? null,
      erro_mensagem: t.erroMensagem ?? null,
      payload_erro: (t.payloadErro as never) ?? null,
      duracao_ms: t.duracaoMs,
    },
    { onConflict: "nota_id,numero_tentativa" },
  );
  if (error) throw new Error(`Falha ao registrar tentativa: ${error.message}`);
}

async function falharDefinitivamente(
  step: StepTools,
  db: Db,
  p: {
    notaId: string;
    empresaId: string;
    tentativas: number;
    erro: { codigo: string | null; mensagem: string };
  },
): Promise<void> {
  await step.run("transicionar-para-falhou", async () => {
    await db
      .from("notas_fiscais")
      .update({ tentativas: p.tentativas, proxima_tentativa_em: null })
      .eq("id", p.notaId);

    const { error } = await db.rpc("transicionar_status_nota", {
      p_nota_id: p.notaId,
      p_novo_status: "falhou",
      p_erro_codigo: p.erro.codigo ?? undefined,
      p_erro_msg: p.erro.mensagem,
    });
    if (error) throw new Error(`Transição para falhou falhou: ${error.message}`);
  });

  await step.sendEvent("evento-falhou", {
    name: EVENTO_EMISSAO_FALHOU,
    data: {
      notaId: p.notaId,
      empresaId: p.empresaId,
      erroCodigo: p.erro.codigo,
      erroMensagem: p.erro.mensagem,
      tentativas: p.tentativas,
    },
  });
}

function proximaTentativaIso(delay: (typeof RETRY_DELAYS)[number]): string {
  const ms = { "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": 60 * 60_000 }[delay];
  return new Date(Date.now() + ms).toISOString();
}

/**
 * Acesso seguro a RETRY_DELAYS por tentativa (1-indexado).
 * Só é chamado quando `tentativa < MAX_TENTATIVAS`, então sempre está dentro
 * do intervalo — o erro abaixo é defensivo (nunca deve disparar em produção).
 */
function delayParaTentativa(tentativa: number): (typeof RETRY_DELAYS)[number] {
  const delay = RETRY_DELAYS[tentativa - 1];
  if (delay === undefined) {
    throw new Error(`Tentativa ${tentativa} fora do intervalo de RETRY_DELAYS (bug no motor de retry).`);
  }
  return delay;
}
