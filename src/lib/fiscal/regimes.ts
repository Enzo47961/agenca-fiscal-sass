/**
 * Constantes de regime tributário compartilhadas entre servidor e cliente.
 *
 * Módulo puro de propósito: `services/empresas.ts` importa `node:crypto` e não
 * pode entrar no bundle do browser, mas o formulário de configurações precisa
 * da MESMA regra para decidir se mostra o campo. Duplicar a string nos dois
 * lados é como a validação e a tela divergem — a tela oferece o campo, o schema
 * recusa o valor, e o usuário só descobre depois de salvar.
 */

/**
 * Único regime em que a marcação "Simples Nacional por fora" tem efeito.
 * A justificativa completa está em `dadosFiscaisSchema` (services/empresas.ts).
 */
export const REGIME_COM_SIMPLES_POR_FORA = "simples_nacional";
