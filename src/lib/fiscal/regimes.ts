/**
 * Constantes de regime tributário compartilhadas entre servidor e cliente.
 *
 * Módulo puro de propósito: `services/empresas.ts` importa `node:crypto` e não
 * pode entrar no bundle do browser, mas o formulário de configurações precisa
 * da MESMA regra para decidir se mostra o campo. Duplicar a string nos dois
 * lados é como a validação e a tela divergem — a tela oferece o campo, o schema
 * recusa o valor, e o usuário só descobre depois de salvar.
 */

export const REGIMES_TRIBUTARIOS = [
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
  "mei",
] as const;

export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number];

/**
 * Único regime em que a marcação "Simples Nacional por fora" tem efeito.
 * A justificativa completa está em `dadosFiscaisSchema` (services/empresas.ts).
 */
export const REGIME_COM_SIMPLES_POR_FORA = "simples_nacional";

/**
 * Regimes para os quais a obrigatoriedade do NBS é DUVIDOSA (item A7).
 *
 * DECISÃO DO USUÁRIO em 10/08/2026: o NBS continua **opcional para todos**, e
 * estes regimes recebem apenas um aviso na tela. As fontes divergem sobre a
 * exigência para Lucro Presumido/Real, e a base de conhecimento registra o
 * conflito sem resolvê-lo. Exigir o campo com base em fonte não confirmada
 * bloquearia emissão legítima de quem não tem o código em mãos — o erro caro,
 * porque impede o usuário de faturar. Avisar erra para o lado reversível.
 *
 * Isto NÃO é uma afirmação de que o NBS é exigido nesses regimes. É o registro
 * de onde a dúvida está concentrada, para que o aviso apareça onde importa.
 */
export const REGIMES_NBS_SOB_DUVIDA: readonly RegimeTributario[] = [
  "lucro_presumido",
  "lucro_real",
];
