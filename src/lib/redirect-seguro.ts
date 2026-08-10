/**
 * Validação do parâmetro `next` dos fluxos de autenticação.
 *
 * O problema que isto resolve é um open redirect. Sem validação,
 * `/auth/callback?code=...&next=https://phishing.exemplo` faz o NOSSO domínio
 * despachar o usuário recém-autenticado para um site de terceiros. O link que
 * a vítima recebeu e clicou aponta para o nosso domínio — é ele que aparece no
 * e-mail, no chat e no histórico —, e é justamente essa aparência de
 * legitimidade que o ataque compra. Pior no nosso caso: no instante do
 * redirecionamento a sessão JÁ existe, então a página de destino recebe um
 * usuário logado, pronto para digitar senha de novo em um formulário clonado.
 *
 * A regra é deliberadamente restritiva: só passa caminho relativo à raiz. É
 * mais fácil defender "aceito apenas /algo" do que enumerar todas as formas de
 * escrever uma URL absoluta — e são muitas, porque o parser do navegador é
 * tolerante de um jeito que o nosso não precisa ser.
 */

/** Destino usado quando `next` está ausente ou é recusado. */
export const DESTINO_PADRAO = "/dashboard";

/**
 * Formas de escapar do nosso domínio que o navegador aceita e uma checagem
 * ingênua de `startsWith("/")` deixaria passar:
 *
 * - `//evil.com`      → URL protocol-relative: vira `https://evil.com`.
 * - `/\evil.com`      → navegadores normalizam `\` para `/`, então equivale ao anterior.
 * - `/\/evil.com`     → mesma ideia, misturando as duas barras.
 * - `/%09/evil.com`   → tab/CR/LF são descartados por alguns parsers antes da normalização.
 *
 * Por isso a barra invertida é recusada em qualquer posição e caracteres de
 * controle também — inclusive na forma percent-encoded, que decodificamos só
 * para inspecionar, nunca para devolver.
 */
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\x00-\x1f\x7f]/;

export function destinoSeguro(
  valor: string | null | undefined,
  fallback: string = DESTINO_PADRAO,
): string {
  if (typeof valor !== "string") return fallback;

  const bruto = valor.trim();
  if (bruto === "") return fallback;

  // Caminho relativo à raiz e nada mais. Isto já elimina `https://`, `javascript:`,
  // `data:` e qualquer esquema, porque todos precisam de algo antes da primeira barra.
  if (!bruto.startsWith("/")) return fallback;

  // Protocol-relative e suas variantes com barra invertida.
  if (bruto.startsWith("//")) return fallback;
  if (bruto.includes("\\")) return fallback;

  if (CONTROLE.test(bruto)) return fallback;

  // Percent-encoding pode esconder tudo que foi recusado acima. Decodificar aqui
  // é só para INSPECIONAR: o valor devolvido continua sendo o original.
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(bruto);
  } catch {
    // Sequência percent malformada — não dá para saber o que vira no navegador.
    return fallback;
  }
  if (
    decodificado.startsWith("//") ||
    decodificado.includes("\\") ||
    CONTROLE.test(decodificado)
  ) {
    return fallback;
  }

  return bruto;
}

/**
 * Última linha de defesa, para uso junto de `new URL(destino, base)`.
 *
 * `destinoSeguro` já basta para os casos conhecidos, mas quem resolve a URL
 * final é o parser do runtime, não a nossa regex. Comparar a origem depois da
 * resolução transforma qualquer forma de escape que a gente não previu em um
 * fallback silencioso em vez de um redirecionamento para fora.
 */
export function urlDeRedirecionamento(
  valor: string | null | undefined,
  base: string,
  fallback: string = DESTINO_PADRAO,
): URL {
  const origem = new URL(base);
  const candidata = new URL(destinoSeguro(valor, fallback), origem);
  return candidata.origin === origem.origin ? candidata : new URL(fallback, origem);
}
