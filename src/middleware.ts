import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { decidirRota } from "@/lib/rotas";

/**
 * Middleware de sessão.
 *
 * Existe por dois motivos, nessa ordem de importância:
 *
 * 1. RENOVAR O TOKEN. O access token do Supabase é curto (1h). Server Components
 *    conseguem LER cookie mas não conseguem ESCREVER — é por isso que o
 *    `setAll` de `lib/supabase/server.ts` engole a exceção com o comentário
 *    "middleware cuida do refresh". Sem este arquivo, esse comentário era uma
 *    promessa não cumprida: o refresh token nunca era trocado e o usuário era
 *    deslogado sozinho depois de uma hora, no meio do trabalho.
 *
 * 2. Barrar visitante antes de renderizar. As páginas já checam sessão por
 *    conta própria (`estadoDaSessao`) e continuam checando — a segurança de
 *    verdade está na RLS do banco, não aqui. O ganho é de experiência: sem
 *    isso o painel monta, dispara queries e só então redireciona.
 *
 * O que este arquivo NÃO faz: decidir se o usuário tem empresa. Isso exige uma
 * consulta a `empresa_membros` e sairia caro em toda navegação; quem resolve
 * continua sendo `estadoDaSessao` na página.
 */
export async function middleware(request: NextRequest) {
  // A resposta precisa existir ANTES do getUser(): é nela que os cookies
  // renovados são escritos. Devolver uma resposta criada depois perderia o
  // token novo, e o usuário seria deslogado no request seguinte.
  let resposta = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() — e não getSession() — porque só ele valida o JWT contra o
  // servidor de auth. getSession() confia no cookie, que o cliente controla.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decisao = decidirRota({
    pathname: request.nextUrl.pathname,
    busca: request.nextUrl.search,
    temUsuario: user !== null,
  });

  if (decisao.tipo === "redirecionar") {
    const url = new URL(decisao.destino, request.url);
    // Os cookies renovados vão junto: se o refresh aconteceu neste mesmo
    // request, jogá-los fora faria o usuário rodar o refresh de novo na
    // próxima navegação, com o token velho.
    const redirecionamento = NextResponse.redirect(url);
    resposta.cookies.getAll().forEach((cookie) => redirecionamento.cookies.set(cookie));
    return redirecionamento;
  }

  return resposta;
}

export const config = {
  matcher: [
    /**
     * Tudo, exceto:
     * - `api/**`   → webhooks (Focus, Asaas) e Inngest autenticam por token, não
     *                por cookie. Redirecionar um webhook para /login o quebraria,
     *                e o provedor leria o 307 como falha de entrega.
     * - `auth/**`  → o callback é justamente quem CRIA a sessão; rodar o refresh
     *                antes disso é trabalho perdido.
     * - estáticos  → não têm sessão para renovar.
     */
    "/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
