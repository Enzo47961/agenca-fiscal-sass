import { type Centavos } from "@/types/domain";

/**
 * Faturamento de NOTAS EXCEDENTES — lógica pura e testável (regra 20).
 *
 * Modelo "conta de luz": o plano garante `limite_notas_mes`. Toda nota EMITIDA
 * além do limite no mês é excedente. Um job mensal (src/inngest/functions/
 * cobrar-excedentes.ts) soma as excedentes do ciclo e gera UMA fatura agregada.
 *
 * Este módulo não importa nada de framework de propósito: é o núcleo de cálculo,
 * exercitado por testes sem banco. A marcação race-safe em produção é feita pela
 * função SQL `marcar_nota_excedente`; `idsExcedentes` abaixo espelha essa regra
 * para verificação em teste.
 */

export interface NotaEmitida {
  id: string;
  /** ISO timestamp da emissão — critério primário de ordenação. */
  emitidaEm: string;
}

/**
 * Dado o conjunto de notas emitidas de um mês (qualquer ordem) e o limite do
 * plano, retorna os ids das notas excedentes: as que ultrapassam o limite pela
 * ordem de emissão (empate desfeito pelo id, igual ao banco).
 */
export function idsExcedentes(notas: NotaEmitida[], limiteNotasMes: number): string[] {
  if (!Number.isInteger(limiteNotasMes) || limiteNotasMes < 0) {
    throw new Error("limiteNotasMes deve ser inteiro >= 0");
  }
  const ordenadas = [...notas].sort((a, b) => {
    if (a.emitidaEm !== b.emitidaEm) return a.emitidaEm < b.emitidaEm ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
  return ordenadas.slice(limiteNotasMes).map((n) => n.id);
}

/** Uma nota é excedente se sua posição (1-indexada) no mês passa do limite. */
export function ehExcedente(posicaoNoMes: number, limiteNotasMes: number): boolean {
  return posicaoNoMes > limiteNotasMes;
}

export interface FaturaExcedenteCalculo {
  quantidadeNotas: number;
  precoUnitarioCentavos: Centavos;
  valorTotalCentavos: Centavos;
}

/** Total da fatura de excedente: quantidade × preço unitário (tudo em centavos). */
export function calcularFaturaExcedente(params: {
  quantidadeNotas: number;
  precoUnitarioCentavos: Centavos;
}): FaturaExcedenteCalculo {
  const { quantidadeNotas, precoUnitarioCentavos } = params;
  if (!Number.isInteger(quantidadeNotas) || quantidadeNotas < 0) {
    throw new Error("quantidadeNotas deve ser inteiro >= 0");
  }
  if (!Number.isInteger(precoUnitarioCentavos) || precoUnitarioCentavos < 0) {
    throw new Error("precoUnitarioCentavos deve ser inteiro >= 0 (centavos)");
  }
  return {
    quantidadeNotas,
    precoUnitarioCentavos,
    valorTotalCentavos: quantidadeNotas * precoUnitarioCentavos,
  };
}

/** Primeiro dia (UTC, yyyy-mm-dd) do mês anterior ao de `ref`. */
export function competenciaMesAnterior(ref: Date): string {
  const inicio = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1));
  return inicio.toISOString().slice(0, 10);
}

/** Intervalo [inicio, fimExclusivo) do mês de uma competência yyyy-mm-dd. */
export function intervaloDoMes(competencia: string): { inicio: string; fimExclusivo: string } {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(competencia);
  if (!m) throw new Error(`Competência inválida: ${competencia} (esperado yyyy-mm-dd)`);
  const ano = Number(m[1]);
  const mes = Number(m[2]); // 1-12
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fimExclusivo = new Date(Date.UTC(ano, mes, 1));
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fimExclusivo: fimExclusivo.toISOString().slice(0, 10),
  };
}

/** Vencimento (yyyy-mm-dd) a `dias` corridos de `ref` — usado na cobrança Asaas. */
export function vencimentoEmDias(ref: Date, dias: number): string {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + dias));
  return d.toISOString().slice(0, 10);
}

/** Descrição legível da cobrança agregada de excedentes. */
export function descricaoFaturaExcedente(params: {
  quantidadeNotas: number;
  competencia: string;
}): string {
  const [ano, mes] = params.competencia.split("-");
  const plural = params.quantidadeNotas === 1 ? "nota" : "notas";
  return `Notas fiscais excedentes ${mes}/${ano} — ${params.quantidadeNotas} ${plural} além do limite do plano`;
}
