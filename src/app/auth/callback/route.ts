import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Callback dos links de e-mail do Supabase (confirmação de conta e login).
 * Troca o `code` por uma sessão (cookies) e redireciona para o painel.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destino = request.nextUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(destino, request.url));
    }
  }

  // Link inválido ou expirado
  return NextResponse.redirect(new URL("/login?erro=link-invalido", request.url));
}
