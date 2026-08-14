import { z } from "zod";
import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";
import { type Centavos } from "@/types/domain";
import { dataCivilBr } from "@/lib/data-br";

/**
 * RELATÓRIO CONSOLIDADO DA CARTEIRA — o "painel de parceiro"
 *
 * O escritório enxergava uma empresa por vez, a ativa. Para fechar o mês teria
 * de trocar de empresa dezenas de vezes e anotar num papel.
 *
 * A agregação vive no banco (`relatorio_carteira`), numa varredura só; aqui
 * ficam a validação do período, os totais e a exportação — o que dá para testar
 * sem rede.
 */

export const periodoSchema = z
  .object({
    inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida"),
    fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida"),
  })
  .refine((p) => p.inicio <= p.fim, {
    message: "A data inicial não pode ser depois da final.",
    path: ["inicio"],
  })
  // Período no futuro é erro de digitação, não consulta. Comparado com a data
  // CIVIL brasileira: contra UTC, quem abrisse a tela às 21h teria "hoje"
  // recusado como futuro.
  .refine((p) => p.inicio <= dataCivilBr(), {
    message: "A data inicial está no futuro.",
    path: ["inicio"],
  });

export type Periodo = z.infer<typeof periodoSchema>;

export interface LinhaCarteira {
  empresaId: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  papel: string;
  emitidas: number;
  canceladas: number;
  falhadas: number;
  emAndamento: number;
  faturadoCentavos: Centavos;
  ultimaEmissao: string | null;
}

export interface TotaisCarteira {
  empresas: number;
  /** Empresas que emitiram ao menos uma nota no período. */
  empresasAtivas: number;
  /**
   * Empresas SEM nenhuma emissão no período. É o número que o escritório
   * precisa para agir — cliente parado é cliente prestes a sair.
   */
  empresasSemEmissao: number;
  emitidas: number;
  canceladas: number;
  falhadas: number;
  emAndamento: number;
  faturadoCentavos: Centavos;
}

export function totalizar(linhas: readonly LinhaCarteira[]): TotaisCarteira {
  const t: TotaisCarteira = {
    empresas: linhas.length,
    empresasAtivas: 0,
    empresasSemEmissao: 0,
    emitidas: 0,
    canceladas: 0,
    falhadas: 0,
    emAndamento: 0,
    faturadoCentavos: 0,
  };

  for (const l of linhas) {
    t.emitidas += l.emitidas;
    t.canceladas += l.canceladas;
    t.falhadas += l.falhadas;
    t.emAndamento += l.emAndamento;
    t.faturadoCentavos += l.faturadoCentavos;
    if (l.emitidas > 0) t.empresasAtivas += 1;
    else t.empresasSemEmissao += 1;
  }

  return t;
}

export async function relatorioDaCarteira(
  db: SupabaseClient<Database>,
  periodo: Periodo,
): Promise<LinhaCarteira[]> {
  const { data, error } = await db.rpc("relatorio_carteira", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
  });
  if (error) throw new Error(`Falha ao montar o relatório: ${error.message}`);

  return (data ?? []).map((l) => ({
    empresaId: l.empresa_id,
    razaoSocial: l.razao_social,
    nomeFantasia: l.nome_fantasia,
    cnpj: l.cnpj,
    papel: l.papel,
    emitidas: Number(l.emitidas),
    canceladas: Number(l.canceladas),
    falhadas: Number(l.falhadas),
    emAndamento: Number(l.em_andamento),
    faturadoCentavos: Number(l.faturado_centavos),
    ultimaEmissao: l.ultima_emissao,
  }));
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

/** Escapa um campo para CSV. */
export function campoCsv(valor: string | number | null): string {
  const s = valor === null ? "" : String(valor);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Gera o CSV do relatório.
 *
 * SEPARADOR `;` e valores com VÍRGULA decimal, de propósito: o destino é o
 * Excel em português, onde vírgula é separador decimal e ponto e vírgula é
 * separador de coluna. Exportar no padrão americano faria "1234.56" cair numa
 * célula de texto — e o contador teria de reformatar tudo à mão.
 *
 * O BOM é o que faz o Excel reconhecer UTF-8; sem ele, "Razão" vira "RazÃ£o".
 */
export function csvDaCarteira(linhas: readonly LinhaCarteira[]): string {
  const cabecalho = [
    "razao_social",
    "cnpj",
    "papel",
    "emitidas",
    "canceladas",
    "falhadas",
    "em_andamento",
    "faturado_reais",
    "ultima_emissao",
  ].join(";");

  const corpo = linhas.map((l) =>
    [
      campoCsv(l.razaoSocial),
      campoCsv(l.cnpj),
      campoCsv(l.papel),
      l.emitidas,
      l.canceladas,
      l.falhadas,
      l.emAndamento,
      campoCsv((l.faturadoCentavos / 100).toFixed(2).replace(".", ",")),
      campoCsv(l.ultimaEmissao ? l.ultimaEmissao.slice(0, 10) : ""),
    ].join(";"),
  );

  return `﻿${[cabecalho, ...corpo].join("\r\n")}\r\n`;
}

/** Primeiro e último dia do mês corrente, no calendário brasileiro. */
export function periodoPadrao(): Periodo {
  const hoje = dataCivilBr();
  return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };
}
