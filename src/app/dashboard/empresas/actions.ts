"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_EMPRESA_ATIVA, createSessionClient, estadoDaSessao } from "@/lib/supabase/server";

export interface EmpresaDaCarteira {
  empresaId: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  papel: string;
}

/**
 * Carteira do usuário logado — as empresas que ele gerencia.
 *
 * Vai pela função `minhas_empresas()`, que filtra por `auth.uid()` dentro do
 * banco. Não existe parâmetro de usuário aqui de propósito: aceitar um id por
 * fora seria IDOR na porta de entrada da carteira.
 */
export async function listarMinhasEmpresas(): Promise<EmpresaDaCarteira[]> {
  const db = createSessionClient();
  const { data, error } = await db.rpc("minhas_empresas");
  if (error) throw new Error(`Falha ao carregar suas empresas: ${error.message}`);

  return (data ?? []).map((e) => ({
    empresaId: e.empresa_id,
    razaoSocial: e.razao_social,
    nomeFantasia: e.nome_fantasia,
    cnpj: e.cnpj,
    papel: e.papel,
  }));
}

/**
 * Troca a empresa ativa.
 *
 * A validação aqui é redundante com a de `estadoDaSessao` — e é redundante de
 * propósito. Gravar um cookie sem conferir deixaria o valor inválido circulando
 * até a próxima leitura; recusar na origem mantém o cookie sempre coerente com
 * a carteira, e transforma uma tentativa de troca indevida em erro imediato em
 * vez de silêncio.
 */
export async function trocarEmpresaAtivaAction(
  empresaId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo !== "com_empresa") {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  const { data: vinculo, error } = await db
    .from("empresa_membros")
    .select("empresa_id")
    .eq("user_id", estado.userId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error) return { ok: false, erro: `Falha ao trocar de empresa: ${error.message}` };
  if (!vinculo) {
    // Mensagem deliberadamente igual à de empresa inexistente: distinguir
    // "não é sua" de "não existe" confirmaria a existência do id a quem
    // estivesse sondando.
    return { ok: false, erro: "Empresa não encontrada na sua carteira." };
  }

  cookies().set(COOKIE_EMPRESA_ATIVA, empresaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // O painel inteiro depende do tenant ativo — revalidar só a rota atual
  // deixaria páginas em cache mostrando dados da empresa anterior.
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
