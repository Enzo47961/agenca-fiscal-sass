/**
 * Data civil brasileira.
 *
 * POR QUE ESTE MÓDULO EXISTE. Prazo fiscal e competência de nota são datas
 * CIVIS: valem pelo calendário de quem emite, não pelo relógio de Greenwich.
 * `new Date().toISOString().slice(0, 10)` devolve a data em UTC — e o Brasil
 * está em UTC−3. Entre 21h e a meia-noite, todos os dias, o UTC já virou:
 *
 *   31/08/2026 22:00 em São Paulo  →  toISOString() diz "2026-09-01"
 *   31/12/2026 21:30 em São Paulo  →  toISOString() diz "2027-01-01"
 *
 * Três horas por dia em que o sistema acha que é amanhã. Em fim de mês isso
 * muda o mês de apuração; em 31/12 antecipa a virada do ano fiscal.
 *
 * `Intl.DateTimeFormat` com `en-CA` é o caminho direto para AAAA-MM-DD: é o
 * formato nativo dessa locale, então não há montagem manual de partes — que é
 * onde normalmente entra o erro de padding.
 *
 * NÃO usar para timestamps. Regra 16: instante é TIMESTAMPTZ em UTC. Isto aqui
 * é para o dia do calendário, que é outra coisa.
 */

/** Fuso civil de referência do produto. */
export const FUSO_BRASIL = "America/Sao_Paulo";

const FORMATADOR = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_BRASIL,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Data civil no Brasil, em AAAA-MM-DD.
 *
 * @param instante momento a converter; por padrão, agora.
 */
export function dataCivilBr(instante: Date = new Date()): string {
  return FORMATADOR.format(instante);
}
