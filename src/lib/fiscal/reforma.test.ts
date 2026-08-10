import { describe, it, expect } from "vitest";
import {
  AliquotaNaoFixadaError,
  calcularTributosReforma,
  aliquotasReferencia,
  competenciasComAliquotaFixada,
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

  // O núcleo do C6: antes, QUALQUER ano devolvia o par de teste de 2026.
  // Uma nota de 2027 saía com CBS 0,9% — subdeclaração silenciosa justamente
  // quando a cobrança deixa de ser informativa.
  it("2027 e 2028 têm IBS fixo, mas a CBS ainda não foi fixada pelo Senado", () => {
    for (const ano of ["2027", "2028"]) {
      const erro = (() => {
        try {
          aliquotasReferencia(`${ano}-03-01`);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(erro).toBeInstanceOf(AliquotaNaoFixadaError);
      expect((erro as AliquotaNaoFixadaError).tributo).toBe("cbs");
      expect((erro as AliquotaNaoFixadaError).ano).toBe(Number(ano));
      expect((erro as AliquotaNaoFixadaError).message).toContain("Senado");
    }
  });

  it("de 2029 a 2033 nenhuma das duas está fixada", () => {
    for (const ano of [2029, 2030, 2031, 2032, 2033]) {
      const erro = (() => {
        try {
          aliquotasReferencia(`${ano}-01-01`);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(erro).toBeInstanceOf(AliquotaNaoFixadaError);
      expect((erro as AliquotaNaoFixadaError).tributo).toBe("ambos");
    }
  });

  it("anos fora da transição não caem em default nenhum", () => {
    expect(() => aliquotasReferencia("2025-12-31")).toThrow(AliquotaNaoFixadaError);
    expect(() => aliquotasReferencia("2034-01-01")).toThrow(AliquotaNaoFixadaError);
  });

  // O caminho de destrave quando a Resolução do Senado sair — sem deploy.
  it("override destrava o ano, e só o valor faltante precisa ser informado", () => {
    expect(aliquotasReferencia("2027-06-01", { 2027: { cbs: 0.0875 } })).toEqual({
      cbs: 0.0875,
      ibs: 0.001, // continua vindo da norma, que fixou o IBS
    });
  });

  it("override de um ano não vaza para os outros", () => {
    expect(() => aliquotasReferencia("2028-01-01", { 2027: { cbs: 0.0875 } })).toThrow(
      AliquotaNaoFixadaError,
    );
  });

  it("só 2026 está integralmente fixada hoje", () => {
    expect(competenciasComAliquotaFixada()).toEqual([2026]);
  });
});

describe("calcularTributosReforma com vigência", () => {
  it("propaga o erro de alíquota não fixada em vez de calcular errado", () => {
    expect(() =>
      calcularTributosReforma({ baseCentavos: BASE, competencia: "2027-01-01", regime: "padrao" }),
    ).toThrow(AliquotaNaoFixadaError);
  });

  it("calcula normalmente quando o override supre o que falta", () => {
    const t = calcularTributosReforma({
      baseCentavos: BASE,
      competencia: "2027-01-01",
      regime: "padrao",
      overridesAliquotas: { 2027: { cbs: 0.0875 } },
    });
    expect(t.cbsAliquota).toBe(0.0875);
    expect(t.cbsValorCentavos).toBe(8750); // 8,75% de R$1.000
    expect(t.ibsAliquota).toBe(0.001);
  });

  it("regime diferenciado continua sendo aplicado sobre a alíquota do override", () => {
    const t = calcularTributosReforma({
      baseCentavos: BASE,
      competencia: "2027-01-01",
      regime: "reducao_60",
      overridesAliquotas: { 2027: { cbs: 0.1 } },
    });
    // fator 0.4 = redução de 60%
    expect(t.cbsAliquota).toBe(0.04);
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
