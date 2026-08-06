import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";

/**
 * Acesso às tabelas de domínio nacional do grupo IBSCBS (`cst_ibscbs`,
 * `cclasstrib_ibscbs`, `ccredpres_ibscbs`).
 *
 * POR QUE ESTE MÓDULO EXISTE: `validarDeclaracao()` (src/lib/fiscal/ibscbs.ts)
 * aceita um conjunto de cClassTrib conhecidos e falha fechada quando o código
 * declarado não está nele. Até agora nenhum chamador passava esse conjunto, o
 * que deixava a trava inativa — a tabela estava populada e ninguém a lia.
 * Este é o serviço que a lê.
 *
 * CACHE: são dados de referência NACIONAIS, iguais para todos os tenants e que
 * só mudam quando sai Nota Técnica nova. Buscar 164 linhas a cada tentativa de
 * emissão seria desperdício puro — o motor de retry faz até 4 tentativas por
 * nota. O cache é de processo, com TTL curto o suficiente para que um seed
 * novo entre em vigor sozinho, sem precisar de deploy.
 *
 * Recebe o client por parâmetro (regra 20): quem chama decide se é o client de
 * sessão (RLS libera SELECT para authenticated) ou o admin do motor Inngest.
 */

/** 10 minutos: dado de referência muda por Nota Técnica, não por minuto. */
const TTL_MS = 10 * 60 * 1000;

interface EntradaCache {
  valor: ReadonlySet<string>;
  expiraEm: number;
}

let cache: EntradaCache | null = null;

/** Limpa o cache — usado em teste e após reimportar a tabela de domínio. */
export function limparCacheDominioFiscal(): void {
  cache = null;
}

/**
 * Conjunto dos cClassTrib válidos, direto da tabela de domínio.
 *
 * Lança se a consulta falhar, e lança se a tabela estiver VAZIA. O segundo
 * caso é deliberado: tabela vazia significa que o seed não rodou naquele
 * ambiente, e devolver um conjunto vazio silenciosamente faria toda declaração
 * ser recusada com a mensagem errada ("código não está na tabela"), escondendo
 * a causa real. Melhor falhar com a causa certa.
 */
export async function carregarCClassTribConhecidos(
  db: SupabaseClient<Database>,
  opcoes?: { agora?: number },
): Promise<ReadonlySet<string>> {
  const agora = opcoes?.agora ?? Date.now();

  if (cache && cache.expiraEm > agora) return cache.valor;

  const { data, error } = await db.from("cclasstrib_ibscbs").select("codigo");

  if (error) {
    throw new Error(`Falha ao carregar a tabela de domínio cClassTrib: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      "Tabela de domínio cclasstrib_ibscbs está vazia: rode as migrations de seed " +
        "(20260805200000_ibscbs_seed_tabelas_oficiais.sql) antes de declarar o grupo IBSCBS.",
    );
  }

  const conjunto: ReadonlySet<string> = new Set(data.map((l) => l.codigo));
  cache = { valor: conjunto, expiraEm: agora + TTL_MS };
  return conjunto;
}
