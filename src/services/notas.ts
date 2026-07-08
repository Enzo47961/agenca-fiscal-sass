import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { EVENTO_EMISSAO_SOLICITADA } from "@/inngest/events";
import { type Database } from "@/types/database";

/**
 * Ponto de entrada da emissão (regra 5 do CLAUDE.md):
 * cria a nota como `pendente` e delega ao motor Inngest. NUNCA emite síncrono.
 * Recebe o client por parâmetro (regra 20) — em Server Actions, passar o
 * client de sessão do usuário (RLS ativa garante o tenant).
 */

export const solicitarEmissaoSchema = z.object({
  empresaId: z.string().uuid(),
  clienteId: z.string().uuid(),
  descricaoServico: z.string().min(1).max(2000),
  codigoServico: z.string().min(1),
  valorServicoCentavos: z.number().int().positive(),
  aliquotaIss: z.number().min(0).max(1),
  issRetido: z.boolean().default(false),
  competencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type SolicitarEmissaoInput = z.infer<typeof solicitarEmissaoSchema>;

export async function solicitarEmissao(
  db: SupabaseClient<Database>,
  input: SolicitarEmissaoInput,
): Promise<{ notaId: string }> {
  const dados = solicitarEmissaoSchema.parse(input);

  const { data: nota, error } = await db
    .from("notas_fiscais")
    .insert({
      empresa_id: dados.empresaId,
      cliente_id: dados.clienteId,
      descricao_servico: dados.descricaoServico,
      codigo_servico: dados.codigoServico,
      valor_servico_centavos: dados.valorServicoCentavos,
      aliquota_iss: dados.aliquotaIss,
      iss_retido: dados.issRetido,
      competencia: dados.competencia,
      status: "pendente",
    })
    .select("id, empresa_id")
    .single();

  if (error || !nota) {
    throw new Error(`Falha ao criar nota: ${error?.message}`);
  }

  await inngest.send({
    name: EVENTO_EMISSAO_SOLICITADA,
    data: { notaId: nota.id, empresaId: nota.empresa_id },
  });

  return { notaId: nota.id };
}

/**
 * Reprocessamento manual de nota falhada: falhou → pendente (zera ciclo)
 * e dispara novo evento para o motor.
 */
export async function reprocessarNota(
  db: SupabaseClient<Database>,
  params: { notaId: string; empresaId: string },
): Promise<void> {
  const { error } = await db.rpc("transicionar_status_nota", {
    p_nota_id: params.notaId,
    p_novo_status: "pendente",
  });
  if (error) {
    throw new Error(`Não foi possível reprocessar: ${error.message}`);
  }

  await inngest.send({
    name: EVENTO_EMISSAO_SOLICITADA,
    data: { notaId: params.notaId, empresaId: params.empresaId },
  });
}
