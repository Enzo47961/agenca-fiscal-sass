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
