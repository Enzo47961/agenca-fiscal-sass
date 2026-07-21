import { describe, it, expect } from "vitest";
import {
  calcularTributosReforma,
  aliquotasReferencia,
  REGIME_IBSCBS,
  REGIME_IBSCBS_LABEL,
} from "@/lib/fiscal/reforma";

// Base R$ 1.000,00 = 100000 centavos
const BASE = 100_000;
const COMP = "2026-07-20";

describe("aliquotasReferencia", () => {
  it("fase de teste 2026: CBS 0,9% e IBS 0,1%", () => {
    expect(aliquotasReferencia("2026-01-01")).toEqual({ cbs: 0.009, ibs: 0.001 });
  });

  it("rejeita competência inválida", () => {
    expect(() => aliquotasReferencia("abril")).toThrow();
  });
});

describe("calcularTributosReforma", () => {
  it("regime padrão aplica a alíquota cheia", () => {
    const t = calcularTributosReforma({ baseCentavos: BASE, competencia: COMP, regime: "padrao" });
    expect(t.cbsAliquota).toBe(0.009);
    expect(t.ibsAliquota).toBe(0.001);
    expect(t.cbsValorCentavos).toBe(900); // 0,9% de R$1.000 = R$9,00
    expect(t.ibsValorCentavos).toBe(100); // 0,1% de R$1.000 = R$1,00
  });

  it("redução de 60% aplica fator 0,4", () => {
    const t = calcularTributosReforma({
      baseCentavos: BASE,
      competencia: COMP,
      regime: "reducao_60",
    });
    expect(t.cbsAliquota).toBe(0.0036);
    expect(t.cbsValorCentavos).toBe(360);
    expect(t.ibsValorCentavos).toBe(40);
  });

  it("redução de 30% aplica fator 0,7", () => {
    const t = calcularTributosReforma({
      baseCentavos: BASE,
      competencia: COMP,
      regime: "reducao_30",
    });
    expect(t.cbsAliquota).toBe(0.0063);
    expect(t.cbsValorCentavos).toBe(630);
    expect(t.ibsValorCentavos).toBe(70);
  });

  it("alíquota zero zera CBS e IBS", () => {
    const t = calcularTributosReforma({
      baseCentavos: BASE,
      competencia: COMP,
      regime: "aliquota_zero",
    });
    expect(t.cbsAliquota).toBe(0);
    expect(t.ibsAliquota).toBe(0);
    expect(t.cbsValorCentavos).toBe(0);
    expect(t.ibsValorCentavos).toBe(0);
  });

  it("regime específico não subestima (tratado como cheio até config)", () => {
    const especifico = calcularTributosReforma({
      baseCentavos: BASE,
      competencia: COMP,
      regime: "especifico",
    });
    const padrao = calcularTributosReforma({ baseCentavos: BASE, competencia: COMP, regime: "padrao" });
    expect(especifico.cbsValorCentavos).toBe(padrao.cbsValorCentavos);
  });

  it("valores são inteiros em centavos (regra 15)", () => {
    const t = calcularTributosReforma({ baseCentavos: 12_345, competencia: COMP, regime: "padrao" });
    expect(Number.isInteger(t.cbsValorCentavos)).toBe(true);
    expect(Number.isInteger(t.ibsValorCentavos)).toBe(true);
  });

  it("rejeita base não-inteira ou negativa", () => {
    expect(() => calcularTributosReforma({ baseCentavos: -1, competencia: COMP, regime: "padrao" })).toThrow();
    expect(() => calcularTributosReforma({ baseCentavos: 1.5, competencia: COMP, regime: "padrao" })).toThrow();
  });
});

describe("REGIME_IBSCBS", () => {
  it("todo regime tem rótulo para a UI", () => {
    for (const r of REGIME_IBSCBS) {
      expect(REGIME_IBSCBS_LABEL[r]).toBeTruthy();
    }
  });
});
