import { type Centavos } from "@/types/domain";

/**
 * REFORMA TRIBUTÁRIA — cálculo de CBS e IBS por serviço (lógica pura e testável).
 *
 * Modelo IVA Dual (EC 132/2023, LC 214/2025): além do ISS do modelo antigo, a
 * nota passa a destacar CBS (federal) e IBS (estadual/municipal). Em 2026 (fase
 * de teste) as alíquotas são simbólicas — CBS 0,9% e IBS 0,1% — sem aumento real
 * de carga. Setores sensíveis têm regime diferenciado (alíquota zero, redução de
 * 60% ou 30%, ou regime específico).
 *
 * ATENÇÃO: os percentuais aqui são a fase de teste 2026 e as reduções previstas.
 * Os números da transição (2027+) dependem de regulamentação ainda em curso —
 * confirme com um contador antes de usar em produção. Tudo centralizado aqui
 * para ser fácil de ajustar num lugar só.
 */

export const REGIME_IBSCBS = [
  "padrao",
  "reducao_30",
  "reducao_60",
  "aliquota_zero",
  "especifico",
] as const;

export type RegimeIbsCbs = (typeof REGIME_IBSCBS)[number];

/** Rótulos legíveis para UI. */
export const REGIME_IBSCBS_LABEL: Record<RegimeIbsCbs, string> = {
  padrao: "Padrão (alíquota cheia)",
  reducao_30: "Redução de 30% (profissionais liberais regulamentados)",
  reducao_60: "Redução de 60% (saúde, educação, etc.)",
  aliquota_zero: "Alíquota zero (isenção)",
  especifico: "Regime específico",
};

/**
 * Fator aplicado à alíquota de referência conforme o regime diferenciado.
 * "especifico" tem regras próprias de apuração — tratado como cheio até que uma
 * configuração específica seja definida (não subestima o tributo).
 */
const FATOR_REGIME: Record<RegimeIbsCbs, number> = {
  padrao: 1,
  reducao_30: 0.7,
  reducao_60: 0.4,
  aliquota_zero: 0,
  especifico: 1,
};

/**
 * Alíquotas de referência (fração) por competência. Hoje só a fase de teste
 * 2026 está fixada; anos seguintes caem no mesmo default seguro até serem
 * configurados com base na regulamentação.
 */
export function aliquotasReferencia(competencia: string): { cbs: number; ibs: number } {
  const ano = Number(competencia.slice(0, 4));
  if (!Number.isFinite(ano)) {
    throw new Error(`Competência inválida: ${competencia}`);
  }
  // Fase de teste (2026): CBS 0,9% e IBS 0,1%, sem aumento real de carga.
  // 2027+ entra a transição — números reais a confirmar; mantém o default.
  return { cbs: 0.009, ibs: 0.001 };
}

export interface TributosReforma {
  regime: RegimeIbsCbs;
  cbsAliquota: number;
  ibsAliquota: number;
  cbsValorCentavos: Centavos;
  ibsValorCentavos: Centavos;
}

/** Arredonda uma fração de alíquota para 4 casas (compatível com NUMERIC(6,4)). */
function arredondar4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Calcula CBS e IBS de um serviço a partir da base (valor do serviço em
 * centavos), da competência e do regime diferenciado. Retorna alíquotas (fração)
 * e valores (centavos inteiros — regra 15).
 */
export function calcularTributosReforma(params: {
  baseCentavos: Centavos;
  competencia: string;
  regime: RegimeIbsCbs;
}): TributosReforma {
  const { baseCentavos, competencia, regime } = params;
  if (!Number.isInteger(baseCentavos) || baseCentavos < 0) {
    throw new Error("baseCentavos deve ser inteiro >= 0 (centavos)");
  }
  const base = aliquotasReferencia(competencia);
  const fator = FATOR_REGIME[regime];

  const cbsAliquota = arredondar4(base.cbs * fator);
  const ibsAliquota = arredondar4(base.ibs * fator);

  return {
    regime,
    cbsAliquota,
    ibsAliquota,
    cbsValorCentavos: Math.round(baseCentavos * cbsAliquota),
    ibsValorCentavos: Math.round(baseCentavos * ibsAliquota),
  };
}
