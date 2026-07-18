import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn(async () => ({ ids: ["evt-1"] })) },
}));

import { processarPagamentoConfirmado } from "@/services/pagamentos";
import { inngest } from "@/inngest/client";
import { fakeSupabase, type FakeCtx } from "@/test-utils/fake-supabase";

const baseInput = {
  pagamentoId: "pay_123",
  valorCentavos: 15000,
  empresaId: "22222222-2222-2222-2222-222222222222",
  clienteId: "33333333-3333-3333-3333-333333333333",
  descricaoServico: "Serviço X",
  codigoServico: "01.05",
  aliquotaIss: 0.05,
  issRetido: false,
};

describe("processarPagamentoConfirmado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("é idempotente: webhook duplicado não cria segunda nota nem dispara evento", async () => {
    const db = fakeSupabase((ctx: FakeCtx) => {
      if (ctx.op === "select") return { data: { id: "nota-existente" }, error: null };
      throw new Error("não deveria inserir em pagamento duplicado");
    });

    const r = await processarPagamentoConfirmado(db, baseInput);

    expect(r).toEqual({ notaId: "nota-existente", duplicado: true });
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
  });

  it("cria nota nova e dispara o evento quando não é duplicata", async () => {
    let payloadInsert: unknown = null;
    const db = fakeSupabase((ctx: FakeCtx) => {
      if (ctx.op === "select") return { data: null, error: null };
      if (ctx.op === "insert") {
        payloadInsert = ctx.payload;
        return { data: { id: "nota-nova", empresa_id: baseInput.empresaId }, error: null };
      }
      return { data: null, error: null };
    });

    const r = await processarPagamentoConfirmado(db, baseInput);

    expect(r.duplicado).toBe(false);
    expect(r.notaId).toBe("nota-nova");
    expect(vi.mocked(inngest.send)).toHaveBeenCalledTimes(1);
    // Marcador de idempotência do pagamento embutido na descrição da nota
    expect(JSON.stringify(payloadInsert)).toContain("[pgto:pay_123]");
  });
});
