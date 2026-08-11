/**
 * Qual empresa da carteira está ativa.
 *
 * Mora fora de `lib/supabase/server.ts` pelo mesmo motivo que a decisão de rota
 * mora em `lib/rotas.ts`: ali dentro ela depende de `cookies()` do Next e de um
 * client de banco, e ficaria sem teste. Aqui é uma função de duas entradas e
 * uma saída, e o teste cobre exatamente o que importa — que o valor vindo do
 * browser não decide nada sozinho.
 *
 * A REGRA: o cookie SUGERE, a lista de vínculos DECIDE. Um id que não esteja na
 * carteira é ignorado em silêncio, sem erro, porque ali chega tanto lixo de
 * sessão antiga (empresa removida, conta trocada) quanto tentativa de acesso —
 * e distinguir os dois pelo comportamento confirmaria a existência do id a quem
 * estivesse sondando.
 *
 * Não basta a RLS: ela impede LER dados de outra empresa, mas este id é usado
 * para ESCREVER — criar nota, salvar cliente. Aceitar um id não conferido
 * significaria gravar no tenant errado.
 */
export function resolverEmpresaAtiva(
  vinculos: readonly string[],
  preferida: string | null | undefined,
): string | null {
  if (vinculos.length === 0) return null;
  if (preferida && vinculos.includes(preferida)) return preferida;
  // Determinístico: abrir o painel duas vezes sem escolher nada tem que levar
  // sempre à mesma empresa. Quem chama já entrega a lista ordenada.
  return vinculos[0] ?? null;
}
