/**
 * Tipos de domínio — espelham os CREATE TYPE do Postgres (regra 17).
 * Se um enum mudar no banco (migration nova), atualizar aqui no mesmo PR.
 */

export const NOTA_STATUS = ["pendente", "reprocessando", "emitida", "falhou"] as const;
export type NotaStatus = (typeof NOTA_STATUS)[number];

export const ASSINATURA_STATUS = ["trial", "ativa", "inadimplente", "cancelada"] as const;
export type AssinaturaStatus = (typeof ASSINATURA_STATUS)[number];

export const PLANO_TIPO = ["starter", "pro", "escala"] as const;
export type PlanoTipo = (typeof PLANO_TIPO)[number];

export const TENTATIVA_RESULTADO = ["sucesso", "erro_transiente", "erro_permanente"] as const;
export type TentativaResultado = (typeof TENTATIVA_RESULTADO)[number];

export const MEMBRO_PAPEL = ["owner", "admin", "operador"] as const;
export type MembroPapel = (typeof MEMBRO_PAPEL)[number];

/** Dinheiro no TypeScript é SEMPRE inteiro em centavos (regra 15). */
export type Centavos = number;

export function formatarCentavos(centavos: Centavos): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
