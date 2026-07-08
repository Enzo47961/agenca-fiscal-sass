import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";
import { solicitarEmissao } from "./notas";
import { type Centavos } from "@/types/domain";

/**
 * Pagamento confirmado (Pix/Asaas) → nota fiscal `pendente` + evento Inngest.
 * Idempotente por pagamento: usa a descrição da nota para detectar duplicata
 * de webhook (Asaas reenvia eventos) antes de criar nota nova.
 */
export async function processarPagamentoConfirmado(
  db: SupabaseClient<Database>,
  input: {
    pagamentoId: string;
    valorCentavos: Centavos;
    empresaId: string;
    clienteId: string;
    descricaoServico: string;
    codigoServico: string;
    aliquotaIss: number;
    issRetido: boolean;
  },
): Promise<{ notaId: string; duplicado: boolean }> {
  const marcadorPagamento = `[pgto:${input.pagamentoId}]`;

  // Webhook duplicado? (Asaas faz retry de entrega) — não criar segunda nota
  const { data: existente } = await db
    .from("notas_fiscais")
    .select("id")
    .eq("empresa_id", input.empresaId)
    .like("descricao_servico", `%${marcadorPagamento}%`)
    .limit(1)
    .maybeSingle();

  if (existente) {
    return { notaId: existente.id, duplicado: true };
  }

  const { notaId } = await solicitarEmissao(db, {
    empresaId: input.empresaId,
    clienteId: input.clienteId,
    descricaoServico: `${input.descricaoServico} ${marcadorPagamento}`,
    codigoServico: input.codigoServico,
    valorServicoCentavos: input.valorCentavos,
    aliquotaIss: input.aliquotaIss,
    issRetido: input.issRetido,
    competencia: new Date().toISOString().slice(0, 10),
  });

  return { notaId, duplicado: false };
}
