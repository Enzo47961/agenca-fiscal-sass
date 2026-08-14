"use server";

import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import {
  csvDaCarteira,
  periodoSchema,
  relatorioDaCarteira,
  type Periodo,
} from "@/services/relatorios";

export type ResultadoCsv = { ok: true; csv: string } | { ok: false; erro: string };

/**
 * Monta o CSV da carteira no período.
 *
 * Não recebe lista de empresas nem `empresaId`: o alcance vem de
 * `relatorio_carteira()`, que filtra pelos vínculos do usuário. Não há
 * parâmetro para forjar.
 */
export async function baixarCsvAction(periodo: Periodo): Promise<ResultadoCsv> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  const parse = periodoSchema.safeParse(periodo);
  if (!parse.success) {
    return { ok: false, erro: parse.error.errors[0]?.message ?? "Período inválido." };
  }

  try {
    const linhas = await relatorioDaCarteira(db, parse.data);
    return { ok: true, csv: csvDaCarteira(linhas) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao gerar a planilha." };
  }
}
