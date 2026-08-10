import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";

/**
 * Fake mínimo e SEM REDE do Supabase client para testes de funções de serviço.
 * Cobre as cadeias usadas (from().select/insert/update/upsert().<filtros>()
 * .single()/.maybeSingle() e o builder aguardável direto).
 *
 * O handler recebe a operação e o payload, e decide o resultado — permitindo
 * simular "linha existente", "insert com id novo", etc., e também espionar
 * chamadas. Note o cast único a partir de `unknown` (regra 18: sem `as unknown as`).
 */

export type FakeOp = "select" | "insert" | "update" | "upsert";

export interface FakeResult {
  data: unknown;
  error: { message: string } | null;
  /** Total de linhas quando a consulta pede `{ count: "exact" }`. */
  count?: number | null;
}

/** Uma chamada de filtro/ordenação registrada, para o teste poder afirmar sobre ela. */
export interface FakeChamada {
  metodo: string;
  args: unknown[];
}

export interface FakeCtx {
  table: string;
  op: FakeOp;
  payload?: unknown;
  /**
   * Segundo argumento de `.select()` — é onde vivem `count` e `head`.
   *
   * Exposto porque a diferença entre contar no banco e contar em memória não
   * aparece no resultado, só na CHAMADA: as duas devolvem o mesmo número em
   * teste. Sem poder afirmar sobre `{ count: "exact", head: true }`, um teste
   * de agregação passaria igual com a implementação velha, que baixava a tabela
   * inteira.
   */
  opcoesSelect?: { count?: string; head?: boolean };
  /** Filtros, ordenação e paginação aplicados, na ordem. */
  chamadas: FakeChamada[];
}

export type FakeHandler = (ctx: FakeCtx) => FakeResult;

const METODOS_FILTRO = [
  "select",
  "eq",
  "neq",
  "is",
  "in",
  "like",
  "ilike",
  "gte",
  "gt",
  "lte",
  "lt",
  "order",
  "limit",
  "range",
  "match",
] as const;

export function fakeSupabase(handler: FakeHandler): SupabaseClient<Database> {
  const makeBuilder = (ctx: FakeCtx) => {
    const builder: Record<string, unknown> = {};
    for (const m of METODOS_FILTRO) {
      builder[m] = (...args: unknown[]) => {
        ctx.chamadas.push({ metodo: m, args });
        return builder;
      };
    }
    builder.single = async () => handler(ctx);
    builder.maybeSingle = async () => handler(ctx);
    builder.then = (onFulfilled: (r: FakeResult) => unknown) =>
      Promise.resolve(handler(ctx)).then(onFulfilled);
    return builder;
  };

  const client: unknown = {
    from: (table: string) => ({
      select: (_colunas?: unknown, opcoesSelect?: { count?: string; head?: boolean }) =>
        makeBuilder({ table, op: "select", opcoesSelect, chamadas: [] }),
      insert: (payload: unknown) => makeBuilder({ table, op: "insert", payload, chamadas: [] }),
      update: (payload: unknown) => makeBuilder({ table, op: "update", payload, chamadas: [] }),
      upsert: (payload: unknown) => makeBuilder({ table, op: "upsert", payload, chamadas: [] }),
    }),
  };

  return client as SupabaseClient<Database>;
}

/** Açúcar para os testes que só olham os filtros de uma tabela. */
export function argsDe(ctx: FakeCtx, metodo: string): unknown[][] {
  return ctx.chamadas.filter((c) => c.metodo === metodo).map((c) => c.args);
}
