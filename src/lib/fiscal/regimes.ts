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

// REGIME_COM_SIMPLES_POR_FORA foi removido junto com o booleano
// `simples_por_fora` (A6). A pergunta que ele respondia — "quem pode optar por
// apurar IBS/CBS pelo regime regular" — passou a ser respondida pelo par
// situação no Simples × regime de apuração, em `lib/fiscal/ibscbs.ts`. Uma
// constante sobrevivente ao campo que ela guardava só seria convite a
// reintroduzir o modelo antigo por engano.

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

/**
 * Prazo para o optante pelo Simples Nacional comunicar se apura IBS/CBS pelo
 * regime unificado ou pelo regular (art. 41, § 3º da LC 214/2025).
 *
 * Último dia de setembro de 2026. Quem não se manifestar **permanece no regime
 * unificado** — o silêncio tem efeito, e é isso que a tela precisa dizer.
 *
 * Fica aqui, e não numa string na tela, porque a data governa três coisas
 * (mostrar o aviso, mudar o tom depois de vencido, e o texto do prazo) e
 * espalhar isso é como as três divergem.
 */
export const PRAZO_OPCAO_REGIME_APURACAO = "2026-09-30";

/** `true` enquanto ainda dá para se manifestar. */
export function prazoOpcaoAberto(hoje: Date = new Date()): boolean {
  return hoje.toISOString().slice(0, 10) <= PRAZO_OPCAO_REGIME_APURACAO;
}

/** Dias que faltam para o prazo. Negativo depois de vencido. */
export function diasAtePrazoOpcao(hoje: Date = new Date()): number {
  const limite = Date.parse(`${PRAZO_OPCAO_REGIME_APURACAO}T23:59:59Z`);
  return Math.ceil((limite - hoje.getTime()) / 86_400_000);
}
