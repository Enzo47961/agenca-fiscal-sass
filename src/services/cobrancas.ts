import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type Database } from "@/types/database";
import {
  criarCobranca,
  obterOuCriarCustomer,
  type AsaasConfig,
  type CobrancaCriada,
} from "@/lib/billing/asaas";

/**
 * Cria uma cobrança no Asaas vinculada a um cliente do tenant.
 *
 * PONTO CRÍTICO: o `externalReference` gravado aqui é o contrato com o
 * webhook /api/webhook/pagamento (referenciaSchema). Quando o pagamento for
 * confirmado, o webhook lê esse JSON e cria a nota automaticamente.
 * Mudou lá? Tem que mudar aqui. Os dois lados importam este schema.
 */
export const referenciaNfseSchema = z.object({
  empresaId: z.string().uuid(),
  clienteId: z.string().uuid(),
  descricaoServico: z.string().min(1),
  codigoServico: z.string().min(1),
  aliquotaIss: z.number().min(0).max(1),
  issRetido: z.boolean().default(false),
});

export type ReferenciaNfse = z.infer<typeof referenciaNfseSchema>;

export const novaCobrancaSchema = z.object({
  clienteId: z.string().uuid(),
  descricaoServico: z.string().min(3, "Descreva o serviço").max(500),
  codigoServico: z
    .string()
    .regex(/^\d{2}\.\d{2}$/, "Código de serviço no formato XX.XX (ex.: 01.05)"),
  valorCentavos: z.number().int().positive("Valor deve ser maior que zero"),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida"),
  aliquotaIss: z.number().min(0).max(1),
  issRetido: z.boolean().default(false),
});

export type NovaCobrancaInput = z.infer<typeof novaCobrancaSchema>;

export async function criarCobrancaParaCliente(
  db: SupabaseClient<Database>,
  asaas: AsaasConfig,
  params: { empresaId: string; dados: NovaCobrancaInput },
): Promise<CobrancaCriada> {
  const d = novaCobrancaSchema.parse(params.dados);

  // Cliente precisa pertencer ao tenant da sessão (regra 3; RLS reforça)
  const { data: cliente, error } = await db
    .from("clientes")
    .select("id, nome, cpf_cnpj, email")
    .eq("id", d.clienteId)
    .eq("empresa_id", params.empresaId)
    .single();

  if (error || !cliente) {
    throw new Error("Cliente não encontrado. Cadastre-o primeiro em Clientes.");
  }

  const customerId = await obterOuCriarCustomer(asaas, {
    nome: cliente.nome,
    cpfCnpj: cliente.cpf_cnpj,
    email: cliente.email,
  });

  const referencia: ReferenciaNfse = referenciaNfseSchema.parse({
    empresaId: params.empresaId,
    clienteId: cliente.id,
    descricaoServico: d.descricaoServico,
    codigoServico: d.codigoServico,
    aliquotaIss: d.aliquotaIss,
    issRetido: d.issRetido,
  });

  return criarCobranca(asaas, {
    customerId,
    valorCentavos: d.valorCentavos,
    vencimento: d.vencimento,
    descricao: d.descricaoServico,
    externalReference: JSON.stringify(referencia),
  });
}
