import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type Database } from "@/types/database";

/**
 * Faturas de excedente da PRÓPRIA plataforma (a agência cobra o cliente pelas
 * notas além do limite). Diferente da cobrança que gera NFS-e: aqui o pagamento
 * NÃO deve criar nota nenhuma — só dá baixa na fatura agregada.
 *
 * O `externalReference` da cobrança Asaas carrega este schema; o webhook usa a
 * tag `tipo` para distinguir do contrato de nota (referenciaNfseSchema).
 */
export const faturaExcedenteRefSchema = z.object({
  tipo: z.literal("fatura_excedente"),
  faturaId: z.string().uuid(),
  empresaId: z.string().uuid(),
  competencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type FaturaExcedenteRef = z.infer<typeof faturaExcedenteRefSchema>;

/**
 * Dá baixa numa fatura de excedente quando o pagamento é confirmado.
 * Idempotente: se já estava `paga`, não faz nada e retorna atualizada=false.
 */
export async function marcarFaturaExcedentePaga(
  db: SupabaseClient<Database>,
  params: { faturaId: string; empresaId: string },
): Promise<{ atualizada: boolean }> {
  const { data, error } = await db
    .from("faturas_excedente")
    .update({ status: "paga" })
    .eq("id", params.faturaId)
    .eq("empresa_id", params.empresaId)
    .neq("status", "paga")
    .select("id");

  if (error) {
    throw new Error(`Falha ao dar baixa na fatura de excedente: ${error.message}`);
  }
  return { atualizada: (data ?? []).length > 0 };
}
