import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type Database } from "@/types/database";

/**
 * CRUD de clientes (tomadores de serviço). Funções puras (regra 20):
 * recebem o client de sessão — RLS garante o isolamento por tenant,
 * e o filtro explícito por empresa_id é a segunda camada (regra 3).
 */

export const clienteSchema = z.object({
  nome: z.string().min(2, "Nome muito curto").max(200),
  cpfCnpj: z
    .string()
    .regex(/^\d{11}$|^\d{14}$/, "CPF (11 dígitos) ou CNPJ (14 dígitos), só números"),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefone: z.string().max(20).optional().or(z.literal("")),
  endereco: z
    .object({
      logradouro: z.string().optional(),
      numero: z.string().optional(),
      bairro: z.string().optional(),
      municipio: z.string().optional(),
      uf: z.string().max(2).optional(),
      cep: z.string().optional(),
    })
    .default({}),
});

export type ClienteInput = z.infer<typeof clienteSchema>;

export interface ClienteResumo {
  id: string;
  nome: string;
  cpfCnpj: string;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
}

export async function listarClientes(
  db: SupabaseClient<Database>,
  params: { empresaId: string },
): Promise<ClienteResumo[]> {
  const { data, error } = await db
    .from("clientes")
    .select("id, nome, cpf_cnpj, email, telefone, ativo")
    .eq("empresa_id", params.empresaId)
    .order("nome");

  if (error) throw new Error(`Falha ao listar clientes: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    cpfCnpj: c.cpf_cnpj,
    email: c.email,
    telefone: c.telefone,
    ativo: c.ativo,
  }));
}

export async function criarCliente(
  db: SupabaseClient<Database>,
  params: { empresaId: string; dados: ClienteInput },
): Promise<{ clienteId: string }> {
  const d = clienteSchema.parse(params.dados);

  const { data, error } = await db
    .from("clientes")
    .insert({
      empresa_id: params.empresaId,
      nome: d.nome,
      cpf_cnpj: d.cpfCnpj,
      email: d.email || null,
      telefone: d.telefone || null,
      endereco: d.endereco,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um cliente com este CPF/CNPJ.");
    }
    throw new Error(`Falha ao criar cliente: ${error.message}`);
  }
  return { clienteId: data.id };
}

export async function atualizarCliente(
  db: SupabaseClient<Database>,
  params: { empresaId: string; clienteId: string; dados: ClienteInput },
): Promise<void> {
  const d = clienteSchema.parse(params.dados);

  const { error } = await db
    .from("clientes")
    .update({
      nome: d.nome,
      cpf_cnpj: d.cpfCnpj,
      email: d.email || null,
      telefone: d.telefone || null,
      endereco: d.endereco,
    })
    .eq("id", params.clienteId)
    .eq("empresa_id", params.empresaId);

  if (error) throw new Error(`Falha ao atualizar cliente: ${error.message}`);
}
