/**
 * AVALIAÇÃO DE SAÚDE OPERACIONAL
 *
 * Lógica pura, separada do vigia para ter teste sem banco nem rede.
 *
 * O QUE SE MONITORA, E POR QUÊ ESTES NÚMEROS
 *
 * Falha isolada de emissão é normal: prefeitura recusa dado errado, e o motor
 * já trata. O que precisa de gente é a falha SISTÊMICA — quando muitas notas
 * falham ao mesmo tempo, o problema não está no dado de uma delas.
 *
 * Por isso o alerta olha PROPORÇÃO, não contagem absoluta. Dez falhas em dez
 * notas é apagão; dez falhas em mil é terça-feira. Um limiar absoluto acusaria
 * a base grande e ficaria mudo na pequena, que é onde estamos hoje.
 *
 * O mínimo de amostra existe pela mesma razão: uma nota que falhou num dia de
 * duas notas dá 50% e não significa nada.
 */

/** Proporção de falhas que caracteriza problema sistêmico. */
export const LIMIAR_FALHA = 0.3;

/** Abaixo disto a proporção não é informação — é ruído estatístico. */
export const MINIMO_AMOSTRA = 5;

/**
 * Notas presas toleradas. Acima disso, o vigia de resgate não está dando conta
 * — o que aponta para problema no próprio motor, não na prefeitura.
 */
export const LIMIAR_PRESAS = 3;

export type NivelSaude = "ok" | "atencao" | "critico";

export interface SinaisSaude {
  /** Notas que terminaram em falha nas últimas 24h. */
  falhadas: number;
  /** Notas que chegaram a um desfecho (emitida ou falhou) nas últimas 24h. */
  concluidas: number;
  /** Notas presas que o resgate não resolveu. */
  presas: number;
}

export interface DiagnosticoSaude {
  nivel: NivelSaude;
  proporcaoFalha: number;
  /** Frases prontas do que está errado — vão no corpo do alerta. */
  motivos: string[];
  sinais: SinaisSaude;
}

export function avaliarSaude(s: SinaisSaude): DiagnosticoSaude {
  const falhadas = Math.max(0, s.falhadas);
  const concluidas = Math.max(0, s.concluidas);
  const presas = Math.max(0, s.presas);

  const proporcaoFalha = concluidas > 0 ? falhadas / concluidas : 0;
  const motivos: string[] = [];
  let nivel: NivelSaude = "ok";

  if (concluidas >= MINIMO_AMOSTRA && proporcaoFalha >= LIMIAR_FALHA) {
    motivos.push(
      `${falhadas} de ${concluidas} notas falharam nas últimas 24h ` +
        `(${Math.round(proporcaoFalha * 100)}%). Falha em massa costuma ser prefeitura ou ` +
        `provedor fora do ar, não dado errado.`,
    );
    // Tudo falhando é apagão, não degradação.
    nivel = proporcaoFalha >= 0.8 ? "critico" : "atencao";
  }

  if (presas > LIMIAR_PRESAS) {
    motivos.push(
      `${presas} nota(s) presas que o resgate automático não resolveu. ` +
        `Isso aponta para o motor, não para a prefeitura.`,
    );
    nivel = "critico";
  }

  return { nivel, proporcaoFalha, motivos, sinais: { falhadas, concluidas, presas } };
}
