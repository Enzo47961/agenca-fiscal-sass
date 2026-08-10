/**
 * Decisão de roteamento por sessão, isolada do runtime do Next.
 *
 * Está separada do `middleware.ts` por um motivo prático: middleware roda no
 * Edge Runtime e depende de `NextRequest`/`NextResponse`, o que torna o teste
 * caro e indireto. A regra em si — quem pode ver o quê — é lógica pura e
 * merece teste direto. O middleware fica sendo só a casca que lê o usuário e
 * aplica a decisão.
 */

/** Prefixos que exigem sessão válida. */
export const PREFIXOS_PROTEGIDOS = ["/dashboard", "/onboarding"] as const;

/** Páginas de entrada que não fazem sentido para quem já está logado. */
export const PREFIXOS_DE_AUTENTICACAO = ["/login", "/cadastro"] as const;

function casaPrefixo(pathname: string, prefixos: readonly string[]): boolean {
  return prefixos.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function rotaExigeSessao(pathname: string): boolean {
  return casaPrefixo(pathname, PREFIXOS_PROTEGIDOS);
}

export type DecisaoRota = { tipo: "seguir" } | { tipo: "redirecionar"; destino: string };

/**
 * `busca` é a query string COM o "?" (o formato de `nextUrl.search`), ou "".
 *
 * O `next` preservado no redirecionamento é o que evita o efeito mais chato de
 * uma sessão expirada: o usuário clica em "Notas", cai no login, entra, e vai
 * parar no painel genérico em vez da tela que ele queria. Ele é reconstruído
 * aqui a partir do pathname real — nunca copiado de um `next` que o usuário
 * tenha mandado —, então não há como transformar isto em open redirect.
 */
export function decidirRota(params: {
  pathname: string;
  busca?: string;
  temUsuario: boolean;
}): DecisaoRota {
  const { pathname, busca = "", temUsuario } = params;

  if (!temUsuario && rotaExigeSessao(pathname)) {
    const alvo = `${pathname}${busca}`;
    return { tipo: "redirecionar", destino: `/login?next=${encodeURIComponent(alvo)}` };
  }

  if (temUsuario && casaPrefixo(pathname, PREFIXOS_DE_AUTENTICACAO)) {
    return { tipo: "redirecionar", destino: "/dashboard" };
  }

  return { tipo: "seguir" };
}
