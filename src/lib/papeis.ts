/**
 * Papéis de acesso — constantes e tipos compartilhados entre servidor e cliente.
 *
 * Módulo puro pelo mesmo motivo de `lib/fiscal/regimes.ts`: `services/convites.ts`
 * importa `node:crypto` (geração e hash do token) e não pode entrar no bundle do
 * browser, mas o formulário de convite precisa dos MESMOS rótulos e da mesma
 * lista de papéis. Sem esta separação o build quebra com
 * `UnhandledSchemeError: node:crypto` — e, pior que quebrar, duplicar as
 * strings nos dois lados é como a tela e a validação divergem.
 *
 * Os textos abaixo espelham as policies da migration 20260814120000. Se um
 * papel mudar de poder no banco, a descrição aqui muda junto — descrição que
 * promete mais que a policy vira reclamação de usuário.
 */

/** Papéis que podem ser CONVIDADOS. `owner` fica de fora: define-se ao criar a empresa. */
export const PAPEIS_CONVITE = ["admin", "operador"] as const;
export type PapelConvite = (typeof PAPEIS_CONVITE)[number];

export const PAPEL_LABEL: Record<string, string> = {
  owner: "Dono",
  admin: "Administrador",
  operador: "Operador",
};

/** O que cada papel pode — espelha as policies do banco. */
export const PAPEL_DESCRICAO: Record<string, string> = {
  owner: "Controle total, incluindo convidar administradores.",
  admin: "Emite notas, gerencia clientes e altera dados fiscais. Convida operadores.",
  operador: "Emite notas e cadastra clientes. Não altera dados fiscais nem convida.",
};

/** Dias de validade do convite. */
export const DIAS_VALIDADE_CONVITE = 7;

export interface ConvitePendente {
  id: string;
  email: string;
  papel: string;
  expiraEm: string;
  criadoEm: string;
  /** true quando já passou da validade — a tela mostra diferente. */
  expirado: boolean;
}
