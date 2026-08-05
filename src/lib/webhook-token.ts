import { timingSafeEqual } from "node:crypto";

/**
 * Comparação de token de webhook em tempo constante (item M2 da auditoria).
 *
 * `a !== b` em JavaScript faz short-circuit no primeiro byte diferente, o que
 * vaza, pelo tempo de resposta, quantos caracteres iniciais do token estão
 * certos. O risco prático num webhook HTTP é baixo (a variação de rede afoga o
 * sinal), mas o custo de fechar é praticamente zero e estes são os handlers
 * mais expostos do sistema.
 *
 * Usado por /api/webhook/pagamento (Asaas) e /api/webhook/focusnfe.
 */
export function tokenConfere(recebido: string | null | undefined, esperado: string): boolean {
  if (!recebido || !esperado) return false;

  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");

  // timingSafeEqual exige buffers do mesmo tamanho. Comparar o tamanho antes
  // vaza só o COMPRIMENTO do token, não o conteúdo — informação irrelevante
  // para um segredo aleatório de tamanho conhecido/fixo.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
