import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { type Database } from "@/types/database";
import { resolverEmpresaAtiva } from "@/lib/empresa-ativa";

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
  | {
      tipo: "com_empresa";
      userId: string;
      empresaId: string;
      /** Quantas empresas o usuário gerencia — o seletor só aparece com >1. */
      totalEmpresas: number;
    };

/**
 * Nome do cookie que guarda a empresa ativa.
 *
 * O cookie é uma PREFERÊNCIA de navegação, não uma credencial: o valor é
 * sempre conferido contra a carteira real antes de virar `empresaId`. Ver
 * `estadoDaSessao`.
 */
export const COOKIE_EMPRESA_ATIVA = "empresa_ativa";

/**
 * Distingue os três estados possíveis da sessão:
 * - "deslogado"    → mandar para /login
 * - "sem_empresa"  → logado mas sem vínculo em empresa_membros → /onboarding
 * - "com_empresa"  → fluxo normal do painel
 *
 * MULTI-EMPRESA E A REGRA 3. Com carteira, "qual empresa" deixou de ser óbvio,
 * e a escolha vem do browser — território hostil por definição. A regra é:
 * o cookie SUGERE, a tabela DECIDE. Buscamos os vínculos do usuário e só
 * aceitamos o cookie se ele estiver entre eles; qualquer outro valor cai no
 * padrão em silêncio, sem erro, porque um id inválido ali é lixo de sessão
 * antiga tão frequentemente quanto tentativa de acesso.
 *
 * Não basta a RLS: ela impediria LER dados de outra empresa, mas o
 * `empresaId` daqui é usado para ESCREVER (criar nota, salvar cliente), e
 * aceitar um id não conferido significaria gravar no tenant errado.
 *
 * O padrão é determinístico — a primeira por ordem de id — para que abrir o
 * painel duas vezes sem escolher nada leve sempre à mesma empresa.
 */
export async function estadoDaSessao(
  db: ReturnType<typeof createSessionClient>,
): Promise<EstadoSessao> {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { tipo: "deslogado" };

  const { data: vinculos } = await db
    .from("empresa_membros")
    .select("empresa_id")
    .eq("user_id", user.id)
    .order("empresa_id");

  const ids = (vinculos ?? []).map((v) => v.empresa_id);
  if (ids.length === 0) {
    return { tipo: "sem_empresa", userId: user.id, email: user.email ?? null };
  }

  // A decisão em si vive em `lib/empresa-ativa.ts`, fora daqui, para ser
  // testável sem `cookies()` nem banco — mesmo motivo de `lib/rotas.ts`.
  const empresaId = resolverEmpresaAtiva(ids, cookies().get(COOKIE_EMPRESA_ATIVA)?.value);
  if (!empresaId) {
    return { tipo: "sem_empresa", userId: user.id, email: user.email ?? null };
  }

  return { tipo: "com_empresa", userId: user.id, empresaId, totalEmpresas: ids.length };
}
