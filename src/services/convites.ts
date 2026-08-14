import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";
import {
  DIAS_VALIDADE_CONVITE,
  PAPEIS_CONVITE,
  type ConvitePendente,
} from "@/lib/papeis";

// Reexporta para quem ja importava daqui; a fonte agora e `lib/papeis.ts`,
// que nao toca em node:crypto e por isso pode entrar no bundle do browser.
export * from "@/lib/papeis";

/**
 * CONVITES PARA ENTRAR NUMA EMPRESA
 *
 * O token é uma CREDENCIAL: quem o tem entra na empresa com o papel do convite.
 * Isso governa as três decisões abaixo.
 *
 * 1. 32 BYTES DE ALEATORIEDADE, de `randomBytes` (CSPRNG). `Math.random()` é
 *    previsível e não serve para nada que autentique.
 * 2. GUARDADO COM HASH, nunca em claro — pelo mesmo motivo de senha. Um dump do
 *    banco com tokens em claro entregaria acesso a todas as empresas com
 *    convite pendente. O valor bruto existe só no e-mail e na URL.
 * 3. VALIDADE CURTA (7 dias). Convite esquecido em caixa de entrada é superfície
 *    aberta; o prazo a fecha sozinha.
 */

/** Bytes de entropia do token. 32 é o piso recomendado para credencial. */
const BYTES_TOKEN = 32;

export const criarConviteSchema = z.object({
  empresaId: z.string().uuid(),
  email: z.string().email("E-mail inválido").max(200),
  papel: z.enum(PAPEIS_CONVITE),
});

export type CriarConviteInput = z.infer<typeof criarConviteSchema>;

/**
 * Gera o par (token que vai no e-mail, hash que vai no banco).
 *
 * `base64url` porque o token viaja na URL: `+`, `/` e `=` do base64 comum
 * precisariam de escape e quebrariam ao ser copiados de um e-mail em texto.
 */
export function gerarToken(): { token: string; hash: string } {
  const token = randomBytes(BYTES_TOKEN).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** SHA-256 em hex. O banco guarda só isto. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Comparação de hashes em tempo constante.
 *
 * A comparação de verdade acontece no banco, por índice — mas onde o código
 * comparar token, que compare assim: `===` em string vaza, pelo tempo de
 * resposta, quantos caracteres iniciais bateram.
 */
export function hashesIguais(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** URL de aceite enviada no e-mail. */
export function urlDoConvite(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/convite/${encodeURIComponent(token)}`;
}

export interface MembroDaEmpresa {
  userId: string;
  papel: string;
}

/**
 * Convites em aberto da empresa. Os aceitos e revogados ficam no banco para
 * histórico, mas não interessam à tela de gestão.
 */
export async function listarConvitesPendentes(
  db: SupabaseClient<Database>,
  empresaId: string,
  agora: Date = new Date(),
): Promise<ConvitePendente[]> {
  const { data, error } = await db
    .from("convites")
    .select("id, email, papel, expira_em, criado_em")
    .eq("empresa_id", empresaId)
    .is("aceito_em", null)
    .is("revogado_em", null)
    .order("criado_em", { ascending: false });

  if (error) throw new Error(`Falha ao listar convites: ${error.message}`);

  return (data ?? []).map((c) => ({
    id: c.id,
    email: c.email,
    papel: c.papel,
    expiraEm: c.expira_em,
    criadoEm: c.criado_em,
    expirado: new Date(c.expira_em).getTime() < agora.getTime(),
  }));
}

/** Cria o convite e devolve o token bruto — que o chamador manda por e-mail e descarta. */
export async function criarConvite(
  db: SupabaseClient<Database>,
  dados: CriarConviteInput,
): Promise<{ conviteId: string; token: string }> {
  const { token, hash } = gerarToken();

  const { data, error } = await db
    .rpc("criar_convite", {
      p_empresa_id: dados.empresaId,
      p_email: dados.email,
      p_papel: dados.papel,
      p_token_hash: hash,
      p_dias: DIAS_VALIDADE_CONVITE,
    });

  // Sem `.single()`: a função devolve UMA linha de `convites`, e os tipos
  // gerados já a descrevem como objeto (`isOneToOne: true`). Encadear
  // `.single()` aí faz o tipo colapsar em `never`.
  if (error) throw new Error(error.message);
  return { conviteId: data.id, token };
}

/** Aceita o convite. Recebe o token bruto da URL e manda ao banco só o hash. */
export async function aceitarConvite(
  db: SupabaseClient<Database>,
  token: string,
): Promise<{ empresaId: string }> {
  const { data, error } = await db.rpc("aceitar_convite", { p_token_hash: hashToken(token) });
  if (error) throw new Error(error.message);
  return { empresaId: data as unknown as string };
}

export async function revogarConvite(
  db: SupabaseClient<Database>,
  conviteId: string,
): Promise<void> {
  const { error } = await db.rpc("revogar_convite", { p_convite_id: conviteId });
  if (error) throw new Error(error.message);
}
