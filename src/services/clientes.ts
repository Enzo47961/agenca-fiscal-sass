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

/**
 * Paginação (item A8).
 *
 * A versão anterior trazia TODOS os clientes do tenant numa consulta só. Isso
 * funciona no beta, com dezenas de linhas, e degrada em silêncio depois: a
 * página fica mais lenta a cada cadastro, sem nenhum momento em que alguém seja
 * avisado. E há um desfecho pior que lentidão — se houver limite de linhas
 * configurado no PostgREST (`db-max-rows`, que o Supabase expõe como ajuste), a
 * lista passa a ser truncada SEM erro, e o usuário simplesmente deixa de ver
 * parte dos próprios clientes.
 *
 * O teto é aplicado aqui, e não confiado a quem chama, para que não exista
 * caminho que devolva "tudo".
 */
export const CLIENTES_POR_PAGINA_PADRAO = 50;
export const CLIENTES_POR_PAGINA_MAX = 200;

export interface PaginaDeClientes {
  itens: ClienteResumo[];
  /** Total no banco — não o tamanho de `itens`. */
  total: number;
  pagina: number;
  porPagina: number;
  temMais: boolean;
}

export async function listarClientes(
  db: SupabaseClient<Database>,
  params: { empresaId: string; pagina?: number; porPagina?: number; busca?: string },
): Promise<PaginaDeClientes> {
  const porPagina = Math.min(
    Math.max(1, Math.trunc(params.porPagina ?? CLIENTES_POR_PAGINA_PADRAO)),
    CLIENTES_POR_PAGINA_MAX,
  );
  const pagina = Math.max(1, Math.trunc(params.pagina ?? 1));
  const de = (pagina - 1) * porPagina;

  let consulta = db
    .from("clientes")
    // `count: "exact"` traz o total do banco junto com a página. Sem ele a UI
    // não teria como dizer "50 de 1.240" nem saber se há próxima página.
    .select("id, nome, cpf_cnpj, email, telefone, ativo", { count: "exact" })
    .eq("empresa_id", params.empresaId);

  const busca = params.busca?.trim();
  if (busca) {
    // Escapa os curingas do LIKE: um "%" digitado pelo usuário deve ser buscado
    // como caractere, não virar "casa com qualquer coisa".
    const alvo = busca.replace(/[%_\\]/g, (c) => `\\${c}`);
    consulta = consulta.ilike("nome", `%${alvo}%`);
  }

  const { data, error, count } = await consulta.order("nome").range(de, de + porPagina - 1);

  if (error) throw new Error(`Falha ao listar clientes: ${error.message}`);

  const itens = (data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    cpfCnpj: c.cpf_cnpj,
    email: c.email,
    telefone: c.telefone,
    ativo: c.ativo,
  }));

  const total = count ?? itens.length;
  return { itens, total, pagina, porPagina, temMais: de + itens.length < total };
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
