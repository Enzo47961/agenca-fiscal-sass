import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { avaliarSaude } from "@/lib/saude";
import { emailConfigurado, emailSaude, enviarEmail } from "@/lib/email/resend";
import { serverEnv } from "@/lib/env";

/**
 * VIGIA DE SAÚDE OPERACIONAL
 *
 * O sistema já se cura sozinho de falha isolada — o motor reprocessa, o resgate
 * desentala nota presa. O que faltava era alguém PERCEBER quando a autocura não
 * está dando conta.
 *
 * DE HORA EM HORA, e não diariamente: prefeitura fora do ar por seis horas com
 * ninguém sabendo é meio dia útil de notas não emitidas. O custo do aviso é
 * baixo; o de descobrir pelo cliente, não.
 *
 * AVISA SÓ QUANDO O NÍVEL MUDA. Alerta repetido de hora em hora vira ruído, e
 * ruído a gente aprende a ignorar — que é o oposto do que um alerta serve. O
 * estado anterior fica em `saude_alertas`, e o registro é o próprio mecanismo.
 */
export const vigiarSaude = inngest.createFunction(
  { id: "vigiar-saude-operacional", retries: 2 },
  { cron: "35 * * * *" }, // aos 35 de cada hora, longe dos outros jobs
  async ({ step, logger }) => {
    const db = createAdminClient();

    const sinais = await step.run("coletar-sinais", async () => {
      const desde = new Date(Date.now() - 24 * 3600_000).toISOString();

      const [falhadas, emitidas, presas] = await Promise.all([
        db
          .from("notas_fiscais")
          .select("id", { count: "exact", head: true })
          .eq("status", "falhou")
          .gte("falha_definitiva_em", desde),
        db
          .from("notas_fiscais")
          .select("id", { count: "exact", head: true })
          .eq("status", "emitida")
          .gte("emitida_em", desde),
        db.rpc("notas_abandonadas", { p_limite: 100 }),
      ]);

      const f = falhadas.count ?? 0;
      const e = emitidas.count ?? 0;
      return { falhadas: f, concluidas: f + e, presas: (presas.data ?? []).length };
    });

    const d = avaliarSaude(sinais);

    // Registra o nível da hora e descobre o anterior na mesma consulta —
    // o alerta só sai quando muda.
    const mudou = await step.run("comparar-com-a-hora-anterior", async () => {
      const { data: anterior } = await db
        .from("saude_alertas")
        .select("nivel")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nivelAnterior = anterior?.nivel ?? "ok";
      if (nivelAnterior === d.nivel) return false;

      const { error } = await db.from("saude_alertas").insert({
        nivel: d.nivel,
        falhadas: d.sinais.falhadas,
        concluidas: d.sinais.concluidas,
        presas: d.sinais.presas,
        motivos: d.motivos,
      });
      if (error) throw new Error(`Falha ao registrar saúde: ${error.message}`);
      return true;
    });

    if (!mudou) return { nivel: d.nivel, avisado: false };

    await step.run("avisar", async () => {
      const destino = serverEnv().EMAIL_ALERTAS;
      if (!destino || !emailConfigurado()) {
        logger.warn(`Saúde mudou para "${d.nivel}" — sem e-mail configurado`, {
          motivos: d.motivos,
        });
        return { enviado: false as const };
      }
      const t = emailSaude({
        nivel: d.nivel,
        motivos: d.motivos,
        falhadas: d.sinais.falhadas,
        concluidas: d.sinais.concluidas,
        presas: d.sinais.presas,
      });
      await enviarEmail({ para: destino, assunto: t.assunto, html: t.html });
      return { enviado: true as const };
    });

    logger.warn(`Saúde operacional: ${d.nivel}`, { motivos: d.motivos });
    return { nivel: d.nivel, avisado: true };
  },
);
