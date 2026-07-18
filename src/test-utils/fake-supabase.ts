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
}

export interface FakeCtx {
  table: string;
  op: FakeOp;
  payload?: unknown;
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
  "match",
] as const;

export function fakeSupabase(handler: FakeHandler): SupabaseClient<Database> {
  const makeBuilder = (ctx: FakeCtx) => {
    const builder: Record<string, unknown> = {};
    for (const m of METODOS_FILTRO) {
      builder[m] = () => builder;
    }
    builder.single = async () => handler(ctx);
    builder.maybeSingle = async () => handler(ctx);
    builder.then = (onFulfilled: (r: FakeResult) => unknown) =>
      Promise.resolve(handler(ctx)).then(onFulfilled);
    return builder;
  };

  const client: unknown = {
    from: (table: string) => ({
      select: () => makeBuilder({ table, op: "select" }),
      insert: (payload: unknown) => makeBuilder({ table, op: "insert", payload }),
      update: (payload: unknown) => makeBuilder({ table, op: "update", payload }),
      upsert: (payload: unknown) => makeBuilder({ table, op: "upsert", payload }),
    }),
  };

  return client as SupabaseClient<Database>;
}
