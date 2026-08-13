import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { avaliarFranquia, resumoFranquia, type NivelFranquia } from "@/lib/franquia";
import { emailConfigurado, emailFranquia, enviarEmail } from "@/lib/email/resend";
import { serverEnv } from "@/lib/env";
import { formatarCentavos } from "@/types/domain";

/**
 * VIGIA DA FRANQUIA GLOBAL (13/08/2026)
 *
 * Protege a margem contra o "risco silencioso": vendemos ao escritório um pool
 * de `CNPJs x 100` notas e compramos da Focus uma franquia GLOBAL de 4.000.
 * Dois escritórios, cada um dentro do próprio pool, podem somados estourar a
 * nossa — e aí pagamos excedente sem ter o que faturar de ninguém. O prejuízo
 * aparece na fatura do provider e em lugar nenhum do sistema.
 *
 * DIÁRIO, e não mensal, porque o valor do aviso é inversamente proporcional ao
 * quanto do mês já passou: saber no dia 8 que o ritmo leva ao estouro permite
 * negociar plano; saber no dia 30 só permite pagar.
 *
 * UM AVISO POR NÍVEL POR MÊS. A PK de `franquia_alertas` (competencia, nivel) é
 * o mecanismo — o INSERT falha por conflito quando aquele nível já foi avisado,
 * e o vigia entende isso como "já avisei". Sem isso ele mandaria o mesmo e-mail
 * todo dia e, do terceiro em diante, ninguém abriria.
 *
 * NÃO BLOQUEIA NADA. Nota fiscal não deixa de sair porque a nossa margem
 * apertou — o custo de uma nota não emitida é do cliente, e é maior.
 */
export const vigiarFranquia = inngest.createFunction(
  { id: "vigiar-franquia-provider", retries: 2 },
  { cron: "0 11 * * *" }, // todo dia, 11:00 UTC (~08:00 BRT)
  async ({ step, logger }) => {
    const db = createAdminClient();

    const consumo = await step.run("medir-consumo", async () => {
      const { data, error } = await db.rpc("consumo_franquia_mes").single();
      if (error) throw new Error(`Falha ao medir franquia: ${error.message}`);
      return data;
    });

    const estado = avaliarFranquia({
      notasEmitidas: Number(consumo.notas_emitidas),
      franquia: consumo.franquia,
      custoExcedenteCentavos: consumo.custo_excedente_centavos,
      diaDoMes: consumo.dia_do_mes,
      diasNoMes: consumo.dias_no_mes,
    });

    if (estado.nivel === "ok") {
      return { nivel: estado.nivel, notas: estado.notasEmitidas, avisado: false };
    }

    // Reserva o aviso ANTES de mandar o e-mail. Na ordem inversa, uma falha de
    // envio depois do registro perderia o alerta para sempre; e um envio sem
    // registro repetiria todo dia. Reservando primeiro, o pior caso é um alerta
    // não enviado que o log denuncia — melhor que os dois outros.
    const reservado = await step.run(`reservar-aviso-${estado.nivel}`, async () => {
      const { error } = await db.from("franquia_alertas").insert({
        competencia: consumo.competencia,
        nivel: estado.nivel as NivelFranquia,
        notas_emitidas: estado.notasEmitidas,
        projecao: estado.projecao,
      });
      if (error) {
        // 23505 = unique_violation: este nível já foi avisado neste mês.
        if (error.code === "23505") return false;
        throw new Error(`Falha ao registrar alerta de franquia: ${error.message}`);
      }
      return true;
    });

    if (!reservado) {
      return { nivel: estado.nivel, notas: estado.notasEmitidas, avisado: false };
    }

    const maiores = await step.run("listar-maiores-emissores", async () => {
      const { data, error } = await db.rpc("consumo_franquia_por_empresa", { p_limite: 10 });
      if (error) {
        // Não-fatal: o alerta sem a lista ainda é útil; sem o alerta, não.
        logger.warn("Falha ao listar maiores emissores (não-fatal)", { erro: error.message });
        return [];
      }
      return data ?? [];
    });

    await step.run("enviar-alerta", async () => {
      const destino = serverEnv().EMAIL_ALERTAS;
      if (!destino) {
        logger.warn("EMAIL_ALERTAS não configurado — alerta de franquia só no log", {
          nivel: estado.nivel,
          resumo: resumoFranquia(estado),
        });
        return { enviado: false as const, motivo: "sem-destinatario" };
      }
      if (!emailConfigurado()) {
        logger.warn("RESEND_API_KEY ausente — alerta de franquia só no log", {
          resumo: resumoFranquia(estado),
        });
        return { enviado: false as const, motivo: "email-nao-configurado" };
      }

      const template = emailFranquia({
        nivel: estado.nivel,
        resumo: resumoFranquia(estado),
        notasEmitidas: estado.notasEmitidas,
        franquia: estado.franquia,
        projecao: estado.projecao,
        custoProjetadoReais: formatarCentavos(estado.custoProjetadoCentavos),
        diaDoMes: estado.diaDoMes,
        diasNoMes: estado.diasNoMes,
        maiores: (maiores as Array<{ razao_social: string; notas_emitidas: number }>).map((m) => ({
          nome: m.razao_social,
          notas: Number(m.notas_emitidas),
        })),
      });

      const { emailId } = await enviarEmail({
        para: destino,
        assunto: template.assunto,
        html: template.html,
      });
      return { enviado: true as const, emailId };
    });

    logger.warn(`Franquia: ${resumoFranquia(estado)}`);
    return { nivel: estado.nivel, notas: estado.notasEmitidas, avisado: true };
  },
);
