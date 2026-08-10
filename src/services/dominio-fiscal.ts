import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";
import {
  chaveItemLc116,
  classificarCorrelacao,
  type CorrelacaoItem,
  type OpcaoCClassTrib,
} from "@/lib/fiscal/correlacao";
import { type ReducaoOficial } from "@/lib/fiscal/reforma";

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

/**
 * Correlação oficial do item da LC 116 (Anexo VIII), já classificada em A/B/C.
 *
 * Lê a view `item_lc116_cclasstrib_nfse`, que aplica dois filtros no banco em
 * vez de em memória: só códigos válidos para NFS-e (`aplica_nfse`) e só os
 * vigentes hoje (`vigencia_fim`). Oferecer um código de vigência encerrada
 * seria rejeição garantida, e oferecer um exclusivo de NF-e também.
 */
export async function correlacaoDoItem(
  db: SupabaseClient<Database>,
  codigoServico: string,
): Promise<CorrelacaoItem> {
  const item = chaveItemLc116(codigoServico);

  const { data, error } = await db
    .from("item_lc116_cclasstrib_nfse")
    // String literal única, sem concatenar: o supabase-js infere o tipo do
    // retorno a partir do LITERAL passado aqui. Quebrar em duas partes com `+`
    // devolve `string` e o resultado vira `GenericStringError`.
    .select(
      "codigo, cst, descricao_oficial, perc_reducao_ibs, perc_reducao_cbs, ind_trib_regular, ind_cred_pres, artigo_lc214, url_legislacao",
    )
    .eq("item_lc116", item)
    .order("ordem");

  if (error) {
    throw new Error(`Falha ao consultar a correlação oficial do item ${item}: ${error.message}`);
  }

  const opcoes: OpcaoCClassTrib[] = (data ?? []).map((l) => ({
    codigo: l.codigo ?? "",
    cst: l.cst ?? "",
    descricaoOficial: l.descricao_oficial ?? "",
    percReducaoIbs: Number(l.perc_reducao_ibs ?? 0),
    percReducaoCbs: Number(l.perc_reducao_cbs ?? 0),
    exigeTribRegular: Boolean(l.ind_trib_regular),
    permiteCredPres: Boolean(l.ind_cred_pres),
    artigoLc214: l.artigo_lc214,
    urlLegislacao: l.url_legislacao,
  }));

  return classificarCorrelacao(item, opcoes);
}

/**
 * Redução oficial de um cClassTrib, para o cálculo do destaque.
 *
 * É o que faz as RN 104/111/118 do Anexo VI serem respeitadas: o percentual
 * usado no cálculo passa a ser o da tabela, não o derivado do nosso enum. Ver
 * `fatoresReducao()` em lib/fiscal/reforma.ts.
 *
 * Devolve `null` quando o código não existe — quem chama decide, e no caso da
 * criação de nota a validação do grupo já terá recusado antes.
 */
export async function carregarReducaoOficial(
  db: SupabaseClient<Database>,
  cClassTrib: string,
): Promise<ReducaoOficial | null> {
  const { data, error } = await db
    .from("cclasstrib_ibscbs")
    .select("codigo, perc_reducao_ibs, perc_reducao_cbs")
    .eq("codigo", cClassTrib)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar a redução oficial de ${cClassTrib}: ${error.message}`);
  }
  if (!data) return null;

  return {
    cClassTrib: data.codigo,
    ibs: Number(data.perc_reducao_ibs ?? 0),
    cbs: Number(data.perc_reducao_cbs ?? 0),
  };
}
