import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";
import { NOTA_STATUS, type Centavos, type NotaStatus } from "@/types/domain";

/**
 * Consultas do dashboard como funções puras (regra 20).
 * Recebem o client por parâmetro — nos handlers/páginas, sempre o client de
 * sessão (RLS ativa); o filtro explícito por empresa_id é defesa em camadas.
 */

export interface ResumoNotas {
  contagemPorStatus: Record<NotaStatus, number>;
  faturamentoMesCentavos: Centavos;
  notasRecentes: Array<{
    id: string;
    status: NotaStatus;
    valorCentavos: Centavos;
    descricao: string;
    numeroNfse: string | null;
    tentativas: number;
    proximaTentativaEm: string | null;
    ultimoErro: string | null;
    urlPdf: string | null;
    urlXml: string | null;
    criadaEm: string;
  }>;
  nota?: {
    id: string;
    status: NotaStatus;
    tentativas: number;
    maxTentativas: number;
    proximaTentativaEm: string | null;
    ultimoErro: string | null;
    numeroNfse: string | null;
    urlPdf: string | null;
  };
}

export async function statusDasNotas(
  db: SupabaseClient<Database>,
  params: { empresaId: string; notaId?: string },
): Promise<ResumoNotas> {
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);

  // ---- Contagem por status: no BANCO, não em memória (item A8) -------------
  //
  // Antes, isto baixava TODA nota do tenant — `select status, valor, emitida_em`
  // sem limite — e contava num laço aqui. Dois problemas, e o segundo é o grave:
  //
  // 1. O volume trafegado cresce para sempre. Um tenant com 50 mil notas
  //    transferia 50 mil linhas a cada carregamento do painel.
  // 2. Se houver limite de linhas no PostgREST (`db-max-rows`, ajuste que o
  //    Supabase expõe), a resposta vem truncada SEM erro — e os totais do painel
  //    passam a estar errados sem que nada indique isso. Número errado com cara
  //    de certo é pior que painel lento.
  //
  // `head: true` + `count: "exact"` faz o Postgres contar e não devolver linha
  // nenhuma. O índice `idx_notas_empresa_status` cobre exatamente este par.
  // Deriva de NOTA_STATUS em vez de repetir a lista: quando o cancelamento
  // acrescentou dois estados, a lista fixa aqui teria deixado de conta-los em
  // silencio — o painel mostraria zero cancelada com notas canceladas no banco.
  const STATUS: readonly NotaStatus[] = NOTA_STATUS;

  const [contagens, { data: faturadas }, { data: recentes }] = await Promise.all([
    Promise.all(
      STATUS.map((status) =>
        db
          .from("notas_fiscais")
          .select("id", { count: "exact", head: true })
          .eq("empresa_id", params.empresaId)
          .eq("status", status),
      ),
    ),
    // Faturamento do mês: filtrado no banco por status e data. Ainda traz
    // linhas, mas limitadas ao MÊS corrente, não a todo o histórico.
    //
    // PENDENTE: o certo é um RPC com SUM() devolvendo um número só. Não foi
    // feito agora porque exigiria migration + `database.ts` regenerado, e o
    // arquivo está fora de sincronia neste momento. Fica registrado para não
    // passar por resolvido.
    db
      .from("notas_fiscais")
      .select("valor_servico_centavos")
      .eq("empresa_id", params.empresaId)
      .eq("status", "emitida")
      .gte("emitida_em", inicioMes.toISOString()),
    db
      .from("notas_fiscais")
      .select(
        "id, status, valor_servico_centavos, descricao_servico, numero_nfse, tentativas, proxima_tentativa_em, ultimo_erro, url_pdf, url_xml, created_at",
      )
      .eq("empresa_id", params.empresaId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const contagemPorStatus: Record<NotaStatus, number> = {
    pendente: 0,
    reprocessando: 0,
    emitida: 0,
    falhou: 0,
    cancelando: 0,
    cancelada: 0,
  };
  STATUS.forEach((status, i) => {
    contagemPorStatus[status] = contagens[i]?.count ?? 0;
  });

  let faturamentoMesCentavos = 0;
  for (const n of faturadas ?? []) {
    faturamentoMesCentavos += n.valor_servico_centavos;
  }

  const resumo: ResumoNotas = {
    contagemPorStatus,
    faturamentoMesCentavos,
    notasRecentes: (recentes ?? []).map((n) => ({
      id: n.id,
      status: n.status,
      valorCentavos: n.valor_servico_centavos,
      descricao: n.descricao_servico,
      numeroNfse: n.numero_nfse,
      tentativas: n.tentativas,
      proximaTentativaEm: n.proxima_tentativa_em,
      ultimoErro: n.ultimo_erro,
      urlPdf: n.url_pdf,
      urlXml: n.url_xml,
      criadaEm: n.created_at,
    })),
  };

  if (params.notaId) {
    const { data: nota } = await db
      .from("notas_fiscais")
      .select(
        "id, status, tentativas, max_tentativas, proxima_tentativa_em, ultimo_erro, numero_nfse, url_pdf",
      )
      .eq("empresa_id", params.empresaId)
      .eq("id", params.notaId)
      .maybeSingle();

    if (nota) {
      resumo.nota = {
        id: nota.id,
        status: nota.status,
        tentativas: nota.tentativas,
        maxTentativas: nota.max_tentativas,
        proximaTentativaEm: nota.proxima_tentativa_em,
        ultimoErro: nota.ultimo_erro,
        numeroNfse: nota.numero_nfse,
        urlPdf: nota.url_pdf,
      };
    }
  }

  return resumo;
}

export interface ResumoBilling {
  statusAssinatura: string | null;
  plano: string | null;
  inadimplente: boolean;
}

export async function resumoBilling(
  db: SupabaseClient<Database>,
  params: { empresaId: string },
): Promise<ResumoBilling> {
  const { data } = await db
    .from("assinaturas")
    .select("status, plano")
    .eq("empresa_id", params.empresaId)
    .neq("status", "cancelada")
    .limit(1)
    .maybeSingle();

  return {
    statusAssinatura: data?.status ?? null,
    plano: data?.plano ?? null,
    inadimplente: data?.status === "inadimplente",
  };
}
