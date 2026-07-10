import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { type Database } from "@/types/database";

/**
 * Client de sessão do usuário (cookies) — para Server Components e Server Actions.
 * RLS ativa: toda query já sai filtrada pelo tenant do usuário logado (regras 1 e 3).
 */
export function createSessionClient() {
  const cookieStore = cookies();
  const env = publicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll chamado de Server Component — middleware cuida do refresh
          }
        },
      },
    },
  );
}

/**
 * Resolve a empresa (tenant) do usuário logado a partir da sessão — NUNCA
 * aceitar empresa_id vindo do cliente (regra 3).
 */
export async function empresaDaSessao(
  db: ReturnType<typeof createSessionClient>,
): Promise<{ empresaId: string; userId: string } | null> {
  const estado = await estadoDaSessao(db);
  return estado.tipo === "com_empresa"
    ? { empresaId: estado.empresaId, userId: estado.userId }
    : null;
}

export type EstadoSessao =
  | { tipo: "deslogado" }
  | { tipo: "sem_empresa"; userId: string; email: string | null }
  | { tipo: "com_empresa"; userId: string; empresaId: string };

/**
 * Distingue os três estados possíveis da sessão:
 * - "deslogado"    → mandar para /login
 * - "sem_empresa"  → logado mas sem vínculo em empresa_membros → /onboarding
 * - "com_empresa"  → fluxo normal do painel
 */
export async function estadoDaSessao(
  db: ReturnType<typeof createSessionClient>,
): Promise<EstadoSessao> {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { tipo: "deslogado" };

  const { data: membro } = await db
    .from("empresa_membros")
    .select("empresa_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membro) return { tipo: "sem_empresa", userId: user.id, email: user.email ?? null };
  return { tipo: "com_empresa", userId: user.id, empresaId: membro.empresa_id };
}
