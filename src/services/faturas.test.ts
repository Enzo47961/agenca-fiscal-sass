import { describe, it, expect } from "vitest";
import { faturaExcedenteRefSchema, marcarFaturaExcedentePaga } from "@/services/faturas";
import { fakeSupabase } from "@/test-utils/fake-supabase";

describe("faturaExcedenteRefSchema", () => {
  it("valida a referência de fatura de excedente", () => {
    const ref = faturaExcedenteRefSchema.parse({
      tipo: "fatura_excedente",
      faturaId: "44444444-4444-4444-4444-444444444444",
      empresaId: "55555555-5555-5555-5555-555555555555",
      competencia: "2026-06-01",
    });
    expect(ref.tipo).toBe("fatura_excedente");
  });

  it("rejeita referência sem a tag tipo correta (não confunde com nota)", () => {
    const r = faturaExcedenteRefSchema.safeParse({
      empresaId: "55555555-5555-5555-5555-555555555555",
      clienteId: "66666666-6666-6666-6666-666666666666",
      descricaoServico: "x",
      codigoServico: "01.05",
      aliquotaIss: 0.02,
    });
    expect(r.success).toBe(false);
  });
});

describe("marcarFaturaExcedentePaga", () => {
  it("retorna atualizada=true quando a linha muda para paga", async () => {
    const db = fakeSupabase(() => ({ data: [{ id: "fatura-1" }], error: null }));
    const r = await marcarFaturaExcedentePaga(db, {
      faturaId: "fatura-1",
      empresaId: "emp-1",
    });
    expect(r.atualizada).toBe(true);
  });

  it("retorna atualizada=false quando já estava paga (idempotente)", async () => {
    const db = fakeSupabase(() => ({ data: [], error: null }));
    const r = await marcarFaturaExcedentePaga(db, { faturaId: "fatura-1", empresaId: "emp-1" });
    expect(r.atualizada).toBe(false);
  });

  it("propaga erro do banco", async () => {
    const db = fakeSupabase(() => ({ data: null, error: { message: "boom" } }));
    await expect(
      marcarFaturaExcedentePaga(db, { faturaId: "fatura-1", empresaId: "emp-1" }),
    ).rejects.toThrow(/boom/);
  });
});
