import { NonRetriableError } from "inngest";
import { inngest } from "../client";
import {
  EVENTO_CANCELAMENTO_CONCLUIDO,
  EVENTO_CANCELAMENTO_RECUSADO,
  EVENTO_CANCELAMENTO_SOLICITADO,
  cancelamentoSolicitadoSchema,
} from "../events";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverProvider } from "@/lib/fiscal/providers";
import { FiscalErrorPermanent, isFiscalError } from "@/lib/fiscal/provider";

/**
 * MOTOR DE CANCELAMENTO
 *
 * Mesmo desenho do motor de emissão, e pelo mesmo motivo: a prefeitura cai, e
 * cancelamento tem PRAZO — falhar por indisponibilidade no último dia do prazo
 * é o pior desfecho possível. Por isso o cancelamento não é feito no request
 * HTTP, mesmo a API do provider sendo síncrona.
 *
 * O QUE MUDA EM RELAÇÃO À EMISSÃO
 *
 * O desfecho negativo é diferente. Emissão que falha vai para `falhou`, e faz
 * sentido: não há nota. Cancelamento que falha devolve a nota para `emitida`,
 * porque ela FOI emitida, vale, e continua valendo. Mandá-la para um estado de
 * erro diria ao usuário que a nota não presta — quando o que não deu certo foi
 * o pedido de cancelar.
 *
 * PRAZO NÃO É VALIDADO AQUI. Ele é municipal (Distrito Federal até o dia 15 do
 * mês seguinte, Recife 60 dias, Jundiaí veda após 180) e não temos como
 * conhecer a regra de cada município. A prefeitura responde; a recusa dela vira
 * erro permanente e sua mensagem é gravada COMO VEIO, porque é a única
 * explicação confiável do motivo.
 */
const RETRY_DELAYS = ["5m", "15m", "1h"] as const;
const MAX_TENTATIVAS = RETRY_DELAYS.length + 1;

export const cancelarNfse = inngest.createFunction(
  {
    id: "cancelar-nfse",
    retries: 0, // backoff é nosso (regra 13)
    concurrency: { key: "event.data.notaId", limit: 1 },
  },
  { event: EVENTO_CANCELAMENTO_SOLICITADO },
  async ({ event, step, logger }) => {
    const { notaId, empresaId } = cancelamentoSolicitadoSchema.parse(event.data);
    const db = createAdminClient();

    const contexto = await step.run("carregar-nota", async () => {
      const { data: nota, error } = await db
        .from("notas_fiscais")
        .select("*, empresas(*)")
        .eq("id", notaId)
        .eq("empresa_id", empresaId)
        .single();

      if (error || !nota) {
        throw new NonRetriableError(`Nota ${notaId} não encontrada: ${error?.message}`);
      }
      // Evento duplicado depois de concluído: nada a fazer.
      if (nota.status === "cancelada") return null;
      if (nota.status !== "cancelando") {
        throw new NonRetriableError(
          `Nota ${notaId} em "${nota.status}" — o motor de cancelamento só processa "cancelando".`,
        );
      }
      if (!nota.cancelamento_justificativa) {
        throw new NonRetriableError(`Nota ${notaId} em cancelamento sem justificativa gravada.`);
      }
      return nota;
    });

    if (!contexto) return { resultado: "ja-cancelada" as const };

    const justificativa = contexto.cancelamento_justificativa as string;
    let ultimoErro: { codigo: string | null; mensagem: string } | null = null;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      const resultado = await step.run(`cancelar-tentativa-${tentativa}`, async () => {
        const provider = resolverProvider(contexto.empresas.provider_fiscal, {});
        try {
          const r = await provider.cancelar({
            referenciaExterna: contexto.referencia_externa,
            justificativa,
          });
          return { ok: true as const, urlXml: r.urlXmlCancelamento };
        } catch (e) {
          if (!isFiscalError(e)) {
            logger.error("Erro NÃO classificado no cancelamento", {
              notaId,
              tentativa,
              erro: String(e),
            });
          }
          return {
            ok: false as const,
            permanente: e instanceof FiscalErrorPermanent,
            codigo: isFiscalError(e) ? e.codigo : null,
            mensagem: e instanceof Error ? e.message : String(e),
          };
        }
      });

      if (resultado.ok) {
        await step.run("gravar-cancelamento", async () => {
          const { error: e1 } = await db
            .from("notas_fiscais")
            .update({ url_xml_cancelamento: resultado.urlXml, cancelamento_recusa: null })
            .eq("id", notaId);
          if (e1) throw new Error(`Falha ao gravar XML do cancelamento: ${e1.message}`);

          const { error: e2 } = await db.rpc("transicionar_status_nota", {
            p_nota_id: notaId,
            p_novo_status: "cancelada",
          });
          if (e2) throw new Error(`Transição para cancelada falhou: ${e2.message}`);
        });

        await step.sendEvent("evento-cancelada", {
          name: EVENTO_CANCELAMENTO_CONCLUIDO,
          data: { notaId, empresaId },
        });
        return { resultado: "cancelada" as const, tentativas: tentativa };
      }

      ultimoErro = { codigo: resultado.codigo, mensagem: resultado.mensagem };

      if (resultado.permanente) {
        await recusar(step, db, { notaId, empresaId, motivo: resultado.mensagem });
        return { resultado: "recusado" as const, tentativas: tentativa };
      }

      if (tentativa < MAX_TENTATIVAS) {
        const delay = RETRY_DELAYS[tentativa - 1];
        if (!delay) throw new Error(`Tentativa ${tentativa} fora do intervalo de RETRY_DELAYS.`);

        await step.run(`atualizar-contador-${tentativa}`, async () => {
          await db
            .from("notas_fiscais")
            .update({
              proxima_tentativa_em: new Date(
                Date.now() + { "5m": 300_000, "15m": 900_000, "1h": 3_600_000 }[delay],
              ).toISOString(),
            })
            .eq("id", notaId);
        });

        logger.warn(`Cancelamento da nota ${notaId}: tentativa ${tentativa} falhou. Retry em ${delay}.`);
        await step.sleep(`aguardar-retry-${tentativa}`, delay);
      }
    }

    await recusar(step, db, {
      notaId,
      empresaId,
      motivo:
        ultimoErro?.mensagem ??
        "A prefeitura não respondeu ao pedido de cancelamento após 4 tentativas.",
    });
    return { resultado: "recusado-esgotado" as const, tentativas: MAX_TENTATIVAS };
  },
);

/**
 * Devolve a nota a `emitida` e grava o motivo.
 *
 * A ordem importa: grava a recusa ANTES de transicionar. Se fosse depois e o
 * processo morresse no meio, a nota voltaria a `emitida` sem explicação — e o
 * usuário veria o pedido sumir sem saber por quê.
 */
async function recusar(
  step: Parameters<Parameters<typeof inngest.createFunction>[2]>[0]["step"],
  db: ReturnType<typeof createAdminClient>,
  p: { notaId: string; empresaId: string; motivo: string },
): Promise<void> {
  await step.run("registrar-recusa", async () => {
    await db
      .from("notas_fiscais")
      .update({ cancelamento_recusa: p.motivo, proxima_tentativa_em: null })
      .eq("id", p.notaId);

    const { error } = await db.rpc("transicionar_status_nota", {
      p_nota_id: p.notaId,
      p_novo_status: "emitida",
      p_erro_msg: p.motivo,
    });
    if (error) throw new Error(`Falha ao devolver a nota a emitida: ${error.message}`);
  });

  await step.sendEvent("evento-recusado", {
    name: EVENTO_CANCELAMENTO_RECUSADO,
    data: { notaId: p.notaId, empresaId: p.empresaId, motivo: p.motivo },
  });
}
