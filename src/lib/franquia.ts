import { type Centavos } from "@/types/domain";

/**
 * VIGIA DA FRANQUIA GLOBAL DO PROVIDER
 *
 * Protege a margem contra o descasamento entre o que vendemos e o que
 * compramos: vendemos ao escritório um pool de `CNPJs x 100` notas; compramos
 * da Focus uma franquia GLOBAL de 4.000. Dois escritórios dentro do próprio
 * pool podem, somados, estourar a nossa — e aí pagamos excedente sem ter o que
 * faturar de ninguém.
 *
 * POR QUE PROJEÇÃO, E NÃO SÓ UM LIMIAR. Um alerta que dispara em 80% do
 * consumo avisa quando já é tarde: no plano Growth, ir de 80% a 100% pode levar
 * dias, e negociar plano novo com a Focus leva mais que isso. A projeção
 * responde a pergunta útil — "no ritmo de hoje, como o mês termina?" — e
 * dispara em dia 8, quando ainda dá para agir, e não em dia 26.
 *
 * O RITMO É LINEAR de propósito. Emissão de NFS-e concentra em início e fim de
 * mês, então o linear erra: superestima nos primeiros dias, subestima no meio.
 * Modelo mais fino exigiria histórico que ainda não temos — e um modelo
 * elaborado sobre dados que não existem dá falsa confiança. O linear é
 * conservador no início, que é justamente quando o aviso ainda vale.
 *
 * NÃO BLOQUEIA EMISSÃO. Nota fiscal não deixa de sair porque a nossa margem
 * apertou: o custo de uma nota não emitida é do cliente, e é maior que o nosso
 * excedente de R$0,12.
 */

/** Fração da franquia a partir da qual o consumo REAL vira alerta. */
export const LIMIAR_ALERTA = 0.8;

/** Fração da franquia a partir da qual a PROJEÇÃO vira atenção. */
export const LIMIAR_ATENCAO = 0.8;

export type NivelFranquia = "ok" | "atencao" | "alerta" | "estouro";

export interface EstadoFranquia {
  notasEmitidas: number;
  franquia: number;
  /** Consumo real sobre a franquia, 0..n (pode passar de 1). */
  percentual: number;
  /** Notas projetadas para o fim do mês, no ritmo atual. */
  projecao: number;
  /** Projeção sobre a franquia. */
  percentualProjetado: number;
  nivel: NivelFranquia;
  /** Quanto o excedente custaria se o mês fechar na projeção. */
  custoProjetadoCentavos: Centavos;
  diaDoMes: number;
  diasNoMes: number;
}

export interface EntradaFranquia {
  notasEmitidas: number;
  franquia: number;
  custoExcedenteCentavos: Centavos;
  diaDoMes: number;
  diasNoMes: number;
}

/**
 * Avalia o consumo da franquia e decide o nível do aviso.
 *
 * Os quatro níveis são ordenados por gravidade e o vigia só avisa quando o
 * nível SOBE — ver a PK de `franquia_alertas`.
 *
 *   ok       nada a fazer
 *   atencao  a PROJEÇÃO passa de 80% — dá tempo de negociar plano
 *   alerta   o consumo REAL passa de 80% — a folga acabou
 *   estouro  passou de 100% — já estamos pagando excedente
 */
export function avaliarFranquia(e: EntradaFranquia): EstadoFranquia {
  if (!Number.isInteger(e.franquia) || e.franquia <= 0) {
    throw new Error(`Franquia inválida: ${e.franquia}. Deve ser inteiro positivo.`);
  }
  if (!Number.isInteger(e.diasNoMes) || e.diasNoMes <= 0) {
    throw new Error(`diasNoMes inválido: ${e.diasNoMes}`);
  }
  // Dia fora do mês seria divisão por algo sem sentido na projeção. Grampear em
  // vez de lançar: o vigia não pode morrer por causa de uma borda de calendário.
  const diaDoMes = Math.min(Math.max(e.diaDoMes, 1), e.diasNoMes);
  const notasEmitidas = Math.max(0, e.notasEmitidas);

  const percentual = notasEmitidas / e.franquia;

  // Ritmo diário observado, extrapolado para o mês inteiro.
  const projecao = Math.round((notasEmitidas / diaDoMes) * e.diasNoMes);
  const percentualProjetado = projecao / e.franquia;

  const excedenteProjetado = Math.max(0, projecao - e.franquia);
  const custoProjetadoCentavos = excedenteProjetado * e.custoExcedenteCentavos;

  const nivel: NivelFranquia =
    percentual >= 1
      ? "estouro"
      : percentual >= LIMIAR_ALERTA
        ? "alerta"
        : percentualProjetado >= LIMIAR_ATENCAO
          ? "atencao"
          : "ok";

  return {
    notasEmitidas,
    franquia: e.franquia,
    percentual,
    projecao,
    percentualProjetado,
    nivel,
    custoProjetadoCentavos,
    diaDoMes,
    diasNoMes: e.diasNoMes,
  };
}

/** Ordem de gravidade — usada para avisar só quando o nível sobe. */
export const ORDEM_NIVEL: Record<NivelFranquia, number> = {
  ok: 0,
  atencao: 1,
  alerta: 2,
  estouro: 3,
};

/** Frase de uma linha para o assunto do e-mail. */
export function resumoFranquia(e: EstadoFranquia): string {
  const pct = Math.round(e.percentual * 100);
  const pctProj = Math.round(e.percentualProjetado * 100);
  switch (e.nivel) {
    case "estouro":
      return `Franquia estourada: ${e.notasEmitidas} de ${e.franquia} notas (${pct}%)`;
    case "alerta":
      return `Franquia em ${pct}%: ${e.notasEmitidas} de ${e.franquia} notas`;
    case "atencao":
      return `Projeção de ${pctProj}% da franquia no fim do mês (hoje em ${pct}%)`;
    case "ok":
      return `Franquia em ${pct}%, projeção ${pctProj}%`;
  }
}
