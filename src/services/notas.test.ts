import { describe, it, expect, vi } from "vitest";

// Evita instanciar o cliente Inngest real (sem rede) ao importar o módulo.
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { solicitarEmissaoSchema } from "@/services/notas";

const base = {
  empresaId: "22222222-2222-2222-2222-222222222222",
  clienteId: "33333333-3333-3333-3333-333333333333",
  descricaoServico: "Consultoria",
  codigoServico: "01.05",
  valorServicoCentavos: 15000,
  aliquotaIss: 0.05,
  issRetido: false,
  competencia: "2026-07-18",
};

describe("solicitarEmissaoSchema", () => {
  it("aceita uma emissão válida", () => {
    expect(solicitarEmissaoSchema.parse(base).valorServicoCentavos).toBe(15000);
  });

  it("issRetido default false", () => {
    expect(solicitarEmissaoSchema.parse({ ...base, issRetido: undefined }).issRetido).toBe(false);
  });

  it("rejeita competência malformada", () => {
    expect(() => solicitarEmissaoSchema.parse({ ...base, competencia: "18/07/2026" })).toThrow();
  });

  it("rejeita valor não-positivo", () => {
    expect(() => solicitarEmissaoSchema.parse({ ...base, valorServicoCentavos: 0 })).toThrow();
  });

  it("rejeita alíquota fora de 0..1", () => {
    expect(() => solicitarEmissaoSchema.parse({ ...base, aliquotaIss: 2 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Grupo IBSCBS na criação da nota
// ---------------------------------------------------------------------------

describe("solicitarEmissaoSchema — grupo IBSCBS", () => {
  it("nota sem declaração continua válida (o grupo é opcional)", () => {
    const r = solicitarEmissaoSchema.parse(base);
    expect(r.declaracaoIbsCbs).toBeUndefined();
  });

  it("aceita uma declaração bem formada", () => {
    const r = solicitarEmissaoSchema.parse({
      ...base,
      declaracaoIbsCbs: { cst: "200", cClassTrib: "200027" },
    });
    expect(r.declaracaoIbsCbs?.cClassTrib).toBe("200027");
  });

  it("rejeita CST e cClassTrib com formato inválido já no schema", () => {
    expect(() =>
      solicitarEmissaoSchema.parse({ ...base, declaracaoIbsCbs: { cst: "20", cClassTrib: "200027" } }),
    ).toThrow();
    expect(() =>
      solicitarEmissaoSchema.parse({ ...base, declaracaoIbsCbs: { cst: "200", cClassTrib: "2000" } }),
    ).toThrow();
  });
});
