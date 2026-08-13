import { inngest } from "../client";
import { EVENTO_EMISSAO_SOLICITADA } from "../events";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * VIGIA DE NOTAS PRESAS (item B3 da auditoria de 12/08/2026)
 *
 * O PROBLEMA QUE ELE RESOLVE. `emitir-nfse` roda com `retries: 0` — correto,
 * porque o backoff é nosso (regra 13). O efeito colateral é que qualquer step
 * que lance DEPOIS da transição inicial mata a função e deixa a nota parada em
 * `reprocessando`: queda do Inngest, deploy no meio da execução, falha do banco
 * dentro de `registrarTentativa`, erro em `gravar-emissao`.
 *
 * Até esta função existir, essa nota ficava presa PARA SEMPRE. Não havia vigia,
 * e o botão "reprocessar" do usuário era recusado pelo banco, porque
 * `reprocessando -> pendente` não era transição válida. A única saída era
 * intervenção manual com service_role.
 *
 * Isso contradizia a promessa central do produto. O sistema sabia reprocessar
 * quando a PREFEITURA caía, e não sabia reprocessar quando ELE mesmo caía.
 *
 * DESENHO. De hora em hora, pede ao banco a lista de notas abandonadas e
 * devolve cada uma para `pendente`, redisparando o evento de emissão. Quem
 * define "abandonada" é o banco (`notas_abandonadas`), não este arquivo — o
 * mesmo critério que a máquina de estados usa para AUTORIZAR o resgate. Se o
 * critério vivesse nos dois lugares, divergiriam no primeiro ajuste de limiar e
 * o vigia passaria a pedir resgates que a função recusa, falhando em silêncio a
 * cada hora.
 *
 * SEGURANÇA CONTRA DUPLICATA, em três camadas independentes:
 *  1. o critério temporal (2h sem atualização e sem retry agendado à frente);
 *  2. `concurrency: { key: notaId, limit: 1 }` em `emitir-nfse`, que serializa
 *     dois eventos para a mesma nota em vez de paralelizá-los;
 *  3. `referencia_externa` + `consultarPorReferencia()` antes de reemitir, que
 *     é o que impede nota duplicada NA PREFEITURA — a única duplicata que
 *     realmente custa caro (regra 7).
 *
 * Aqui o retry automático do Inngest é bem-vindo: cada passo é idempotente e
 * uma nota não resgatada agora é resgatada na próxima hora.
 */

/** Teto por execução: evita uma rodada gigante depois de um incidente longo. */
const MAX_POR_RODADA = 50;

export const resgatarNotasPresas = inngest.createFunction(
  { id: "resgatar-notas-presas", retries: 2 },
  { cron: "15 * * * *" }, // toda hora, aos 15 — fora do minuto cheio dos outros jobs
  async ({ step, logger }) => {
    const db = createAdminClient();

    const presas = await step.run("listar-notas-abandonadas", async () => {
      const { data, error } = await db.rpc("notas_abandonadas", { p_limite: MAX_POR_RODADA });
      if (error) throw new Error(`Falha ao listar notas abandonadas: ${error.message}`);
      return data ?? [];
    });

    if (presas.length === 0) {
      return { resgatadas: 0, falhas: 0 };
    }

    logger.warn(`Vigia encontrou ${presas.length} nota(s) presa(s) em reprocessando.`);

    let resgatadas = 0;
    let falhas = 0;

    for (const presa of presas) {
      // Um step por nota, com nome estável derivado do id: replay do Inngest
      // não repete o resgate de quem já voltou para a fila.
      const ok = await step.run(`resgatar-${presa.nota_id}`, async () => {
        const { error } = await db.rpc("transicionar_status_nota", {
          p_nota_id: presa.nota_id,
          p_novo_status: "pendente",
          p_erro_msg:
            "Reprocessamento automático: a execução anterior foi interrompida antes de concluir.",
        });
        if (error) {
          // NÃO relança: uma nota que o motor retomou sozinho entre a listagem e
          // agora faz a função recusar o resgate, e isso é o sistema funcionando
          // — não um erro que deva derrubar o resgate das outras.
          logger.warn("Resgate recusado (nota provavelmente retomada)", {
            notaId: presa.nota_id,
            erro: error.message,
          });
          return false;
        }
        return true;
      });

      if (!ok) {
        falhas += 1;
        continue;
      }

      await step.sendEvent(`reemitir-${presa.nota_id}`, {
        name: EVENTO_EMISSAO_SOLICITADA,
        data: { notaId: presa.nota_id, empresaId: presa.empresa_id },
      });
      resgatadas += 1;
    }

    logger.info(`Vigia: ${resgatadas} nota(s) devolvida(s) à fila, ${falhas} recusada(s).`);
    return { resgatadas, falhas };
  },
);
