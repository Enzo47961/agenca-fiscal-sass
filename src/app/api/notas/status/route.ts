import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSessionClient, empresaDaSessao } from "@/lib/supabase/server";
import { statusDasNotas } from "@/services/dashboard";

/**
 * GET /api/notas/status[?notaId=uuid]
 * Status de processamento das notas para o dashboard (polling).
 *
 * Regra 3: tenant derivado da SESSÃO — nenhum empresa_id aceito por query/body.
 * Usa o client de sessão (anon + cookies): RLS é a segunda camada de defesa.
 */

const querySchema = z.object({
  notaId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const db = createSessionClient();
  const sessao = await empresaDaSessao(db);
  if (!sessao) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  const query = querySchema.safeParse({
    notaId: request.nextUrl.searchParams.get("notaId") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ erro: "parâmetros inválidos" }, { status: 400 });
  }

  const resultado = await statusDasNotas(db, {
    empresaId: sessao.empresaId,
    notaId: query.data.notaId,
  });

  return NextResponse.json(resultado, {
    headers: { "Cache-Control": "no-store" }, // status muda a cada retry
  });
}
