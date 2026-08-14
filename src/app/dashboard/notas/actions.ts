"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { solicitarCancelamento, solicitarCancelamentoSchema } from "@/services/notas";

export type ResultadoCancelamento = { ok: true } | { ok: false; erro: string };

/**
 * Pede o cancelamento de uma nota emitida.
 *
 * Não confere papel nem estado aqui: quem confere é o banco, em
 * `solicitar_cancelamento()`. Repetir a regra na aplicação criaria duas fontes
 * de verdade que divergem no primeiro ajuste — e a da aplicação é a que se
 * contorna. O que a action faz é traduzir a exceção em mensagem de tela.
 */
export async function cancelarNotaAction(
  notaId: string,
  justificativa: string,
): Promise<ResultadoCancelamento> {
  const parse = solicitarCancelamentoSchema.safeParse({ notaId, justificativa });
  if (!parse.success) {
    return { ok: false, erro: parse.error.errors[0]?.message ?? "Dados inválidos." };
  }

  try {
    const db = createSessionClient();
    await solicitarCancelamento(db, parse.data);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : "Não foi possível solicitar o cancelamento.",
    };
  }
}
