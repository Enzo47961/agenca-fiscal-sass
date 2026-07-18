import { describe, it, expect } from "vitest";
import { novaCobrancaSchema, referenciaNfseSchema } from "@/services/cobrancas";

const baseCobranca = {
  clienteId: "11111111-1111-1111-1111-111111111111",
  descricaoServico: "Consultoria contábil",
  codigoServico: "01.05",
  valorCentavos: 15000,
  vencimento: "2026-08-10",
  aliquotaIss: 0.05,
  issRetido: false,
};

describe("novaCobrancaSchema", () => {
  it("aceita uma cobrança válida", () => {
    const r = novaCobrancaSchema.parse(baseCobranca);
    expect(r.valorCentavos).toBe(15000);
    expect(r.issRetido).toBe(false);
  });

  it("issRetido tem default false", () => {
    expect(novaCobrancaSchema.parse({ ...baseCobranca, issRetido: undefined }).issRetido).toBe(false);
  });

  it("exige código de serviço no formato XX.XX", () => {
    expect(() => novaCobrancaSchema.parse({ ...baseCobranca, codigoServico: "105" })).toThrow();
  });

  it("rejeita valor zero ou negativo", () => {
    expect(() => novaCobrancaSchema.parse({ ...baseCobranca, valorCentavos: 0 })).toThrow();
    expect(() => novaCobrancaSchema.parse({ ...baseCobranca, valorCentavos: -1 })).toThrow();
  });

  it("rejeita alíquota fora de 0..1", () => {
    expect(() => novaCobrancaSchema.parse({ ...baseCobranca, aliquotaIss: 1.5 })).toThrow();
  });

  it("rejeita data de vencimento malformada", () => {
    expect(() => novaCobrancaSchema.parse({ ...baseCobranca, vencimento: "10/08/2026" })).toThrow();
  });
});

describe("referenciaNfseSchema", () => {
  it("valida o contrato compartilhado com o webhook", () => {
    const ref = referenciaNfseSchema.parse({
      empresaId: "22222222-2222-2222-2222-222222222222",
      clienteId: "33333333-3333-3333-3333-333333333333",
      descricaoServico: "Serviço X",
      codigoServico: "01.05",
      aliquotaIss: 0.02,
      issRetido: true,
    });
    expect(ref.issRetido).toBe(true);
  });

  it("rejeita empresaId que não é uuid", () => {
    expect(() =>
      referenciaNfseSchema.parse({
        empresaId: "nao-uuid",
        clienteId: "33333333-3333-3333-3333-333333333333",
        descricaoServico: "x",
        codigoServico: "01.05",
        aliquotaIss: 0.02,
      }),
    ).toThrow();
  });
});
