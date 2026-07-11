import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";
import { type Centavos, type NotaStatus } from "@/types/domain";

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

  const [{ data: todas }, { data: recentes }] = await Promise.all([
    db
      .from("notas_fiscais")
      .select("status, valor_servico_centavos, emitida_em")
      .eq("empresa_id", params.empresaId),
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
  };
  let faturamentoMesCentavos = 0;

  for (const n of todas ?? []) {
    contagemPorStatus[n.status] += 1;
    if (n.status === "emitida" && n.emitida_em && new Date(n.emitida_em) >= inicioMes) {
      faturamentoMesCentavos += n.valor_servico_centavos;
    }
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
