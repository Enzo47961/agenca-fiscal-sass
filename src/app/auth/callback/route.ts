import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { urlDeRedirecionamento } from "@/lib/redirect-seguro";

/**
 * Callback dos links de e-mail do Supabase (confirmação de conta e login).
 * Troca o `code` por uma sessão (cookies) e redireciona para o painel.
 *
 * O `next` chega pela URL, logo é entrada do usuário e não pode ser usado como
 * destino sem validação — ver `lib/redirect-seguro.ts`. Aqui o risco é maior
 * que o normal: neste ponto a sessão JÁ foi criada, então um destino externo
 * receberia um usuário autenticado vindo de um link que ostenta o nosso domínio.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destino = request.nextUrl.searchParams.get("next");

  if (code) {
    const supabase = createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(urlDeRedirecionamento(destino, request.url));
    }
  }

  // Link inválido ou expirado
  return NextResponse.redirect(new URL("/login?erro=link-invalido", request.url));
}
