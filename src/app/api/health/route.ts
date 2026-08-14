import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * HEALTH CHECK — `GET /api/health`
 *
 * Endpoint para monitor externo (UptimeRobot, Better Stack, o que for) bater de
 * minuto em minuto. Sem isto, a primeira notícia de que o sistema caiu vem do
 * cliente, e num produto fiscal isso significa nota que não saiu.
 *
 * VERIFICA O QUE PODE QUEBRAR SOZINHO, não só se o processo está de pé:
 * responder 200 porque o Next subiu, com o banco fora, é o pior tipo de
 * monitoramento — o que dá falsa tranquilidade.
 *
 * NÃO EXPÕE NADA. Sem contagem de notas, sem nome de empresa, sem versão de
 * dependência: é rota pública por definição (monitor externo não faz login), e
 * detalhe de dentro aqui vira reconhecimento para quem estiver sondando.
 *
 * Usa o admin client porque não há sessão numa checagem de monitor — e a
 * consulta abaixo é de EXISTÊNCIA, não traz linha nenhuma.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const inicio = Date.now();

  try {
    const db = createAdminClient();
    // `head: true` + limite 1: confirma que o banco responde e que a tabela
    // está lá, sem transferir dado nenhum.
    const { error } = await db
      .from("empresas")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { status: "degradado", banco: "erro", latenciaMs: Date.now() - inicio },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { status: "ok", banco: "ok", latenciaMs: Date.now() - inicio },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Falha de configuração (variável ausente) cai aqui. 503 e não 500: é
    // indisponibilidade, e é o código que monitor entende como "fora".
    return NextResponse.json(
      { status: "fora", latenciaMs: Date.now() - inicio },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
