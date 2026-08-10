import { describe, it, expect } from "vitest";
import {
  calcularBaseIbsCbs,
  calcularTributosReforma,
  ULTIMO_ANO_PIS_COFINS,
} from "@/lib/fiscal/reforma";

/**
 * Fórmula da NT SE/CGNFS-e nº 009/2026:
 *   até 2026:    vBC = vServ − descIncond − ajusteBC − vISSQN − vPIS − vCOFINS
 *   2027 a 2032: vBC = vServ − descIncond − ajusteBC − vISSQN
 */
describe("calcularBaseIbsCbs", () => {
  const R$1000 = 100_000;

  it("deduz o ISSQN — a regressão que motivou o item B7", () => {
    // Antes, a base era o valor bruto. R$ 1.000 com ISS de 5% tem base 950,
    // não 1.000: a diferença é o tributo destacado a maior.
    const base = calcularBaseIbsCbs({
      valorServicoCentavos: R$1000,
      aliquotaIss: 0.05,
      competencia: "2026-07-18",
    });

    expect(base.issqnCentavos).toBe(5_000);
    expect(base.baseCentavos).toBe(95_000);
    expect(base.baseCentavos).not.toBe(R$1000);
  });

  it("aplica a fórmula completa até 2026, com PIS e COFINS", () => {
    const base = calcularBaseIbsCbs({
      valorServicoCentavos: R$1000,
      descontoIncondicionadoCentavos: 10_000,
      ajusteBaseCentavos: 5_000,
      tipoAjusteBase: "ibscbs",
      issqnCentavos: 4_250,
      pisCentavos: 1_650,
      cofinsCentavos: 7_600,
      competencia: "2026-12-31",
    });

    // 100000 − 10000 − 5000 − 4250 − 1650 − 7600
    expect(base.baseCentavos).toBe(71_500);
    expect(base.deduzPisCofins).toBe(true);
  });

  it("a partir de 2027 a fórmula perde PIS e COFINS, mas mantém o ISSQN", () => {
    const componentes = {
      valorServicoCentavos: R$1000,
      descontoIncondicionadoCentavos: 10_000,
      issqnCentavos: 4_250,
      competencia: "2027-01-01",
    };
    const base = calcularBaseIbsCbs(componentes);

    expect(base.baseCentavos).toBe(85_750); // 100000 − 10000 − 4250
    expect(base.deduzPisCofins).toBe(false);
  });

  // Descartar em silêncio mudaria a base sem ninguém perceber. E o erro só
  // dispara quando alguém de fato reivindica a dedução — sem falso positivo.
  it("recusa PIS/COFINS não-zero a partir de 2027 em vez de descartar", () => {
    expect(() =>
      calcularBaseIbsCbs({
        valorServicoCentavos: R$1000,
        pisCentavos: 1_650,
        competencia: "2027-03-10",
      }),
    ).toThrow(/não são dedutíveis/i);

    // zero passa: não há dedução sendo reivindicada
    expect(
      calcularBaseIbsCbs({
        valorServicoCentavos: R$1000,
        pisCentavos: 0,
        cofinsCentavos: 0,
        competencia: "2027-03-10",
      }).baseCentavos,
    ).toBe(R$1000);
  });

  it(`${ULTIMO_ANO_PIS_COFINS} ainda deduz; o ano seguinte já não`, () => {
    const comuns = { valorServicoCentavos: R$1000, pisCentavos: 1_000, cofinsCentavos: 0 };
    expect(
      calcularBaseIbsCbs({ ...comuns, competencia: `${ULTIMO_ANO_PIS_COFINS}-12-31` })
        .deduzPisCofins,
    ).toBe(true);
    expect(() =>
      calcularBaseIbsCbs({ ...comuns, competencia: `${ULTIMO_ANO_PIS_COFINS + 1}-01-01` }),
    ).toThrow();
  });

  describe("ISSQN", () => {
    it("deriva de (vServ − descIncond) × alíquota quando não informado", () => {
      const base = calcularBaseIbsCbs({
        valorServicoCentavos: R$1000,
        descontoIncondicionadoCentavos: 20_000,
        aliquotaIss: 0.05,
        competencia: "2026-07-18",
      });

      expect(base.issqnDerivado).toBe(true);
      expect(base.issqnCentavos).toBe(4_000); // 5% de 80.000, não de 100.000
      expect(base.baseCentavos).toBe(76_000);
    });

    it("o valor informado prevalece sobre a derivação", () => {
      const base = calcularBaseIbsCbs({
        valorServicoCentavos: R$1000,
        aliquotaIss: 0.05,
        issqnCentavos: 1_234, // base de ISS própria (dedução de materiais, p.ex.)
        competencia: "2026-07-18",
      });

      expect(base.issqnDerivado).toBe(false);
      expect(base.issqnCentavos).toBe(1_234);
    });

    it("informar zero é diferente de não informar", () => {
      const base = calcularBaseIbsCbs({
        valorServicoCentavos: R$1000,
        aliquotaIss: 0.05,
        issqnCentavos: 0, // ISS não devido (imunidade, isenção)
        competencia: "2026-07-18",
      });

      expect(base.issqnDerivado).toBe(false);
      expect(base.baseCentavos).toBe(R$1000);
    });

    it("sem alíquota e sem valor, o ISSQN é zero", () => {
      const base = calcularBaseIbsCbs({ valorServicoCentavos: R$1000, competencia: "2026-07-18" });
      expect(base.issqnCentavos).toBe(0);
      expect(base.baseCentavos).toBe(R$1000);
    });

    it("arredonda para centavo inteiro (regra 15)", () => {
      const base = calcularBaseIbsCbs({
        valorServicoCentavos: 33_333,
        aliquotaIss: 0.0275,
        competencia: "2026-07-18",
      });
      expect(Number.isInteger(base.issqnCentavos)).toBe(true);
      expect(base.issqnCentavos).toBe(917); // 916,6575 → 917
      expect(base.baseCentavos).toBe(32_416);
    });
  });

  describe("ajuste de base", () => {
    it("aceita as duas alternativas da NT no mesmo lugar da fórmula", () => {
      for (const tipoAjusteBase of ["ibscbs", "loc_imoveis"] as const) {
        const base = calcularBaseIbsCbs({
          valorServicoCentavos: R$1000,
          ajusteBaseCentavos: 30_000,
          tipoAjusteBase,
          competencia: "2026-07-18",
        });
        expect(base.baseCentavos).toBe(70_000);
        expect(base.tipoAjusteBase).toBe(tipoAjusteBase);
      }
    });

    // Sem o tipo, o valor não teria tag onde sair no XML da DPS.
    it("recusa ajuste sem tipo", () => {
      expect(() =>
        calcularBaseIbsCbs({
          valorServicoCentavos: R$1000,
          ajusteBaseCentavos: 30_000,
          competencia: "2026-07-18",
        }),
      ).toThrow(/tipoAjusteBase/);
    });

    it("ajuste zero não exige tipo", () => {
      expect(
        calcularBaseIbsCbs({
          valorServicoCentavos: R$1000,
          ajusteBaseCentavos: 0,
          competencia: "2026-07-18",
        }).tipoAjusteBase,
      ).toBeNull();
    });
  });

  // A NT não fixa piso zero. Grampear em silêncio emitiria nota com base errada
  // e cara de correta; preferimos recusar e devolver o erro a quem digitou.
  it("recusa base negativa em vez de grampear em zero", () => {
    expect(() =>
      calcularBaseIbsCbs({
        valorServicoCentavos: 10_000,
        descontoIncondicionadoCentavos: 9_000,
        issqnCentavos: 5_000,
        competencia: "2026-07-18",
      }),
    ).toThrow(/negativa/i);
  });

  it("base exatamente zero é válida", () => {
    const base = calcularBaseIbsCbs({
      valorServicoCentavos: 10_000,
      descontoIncondicionadoCentavos: 10_000,
      competencia: "2026-07-18",
    });
    expect(base.baseCentavos).toBe(0);
  });

  it("recusa componente fracionário ou negativo (regra 15: centavos inteiros)", () => {
    expect(() =>
      calcularBaseIbsCbs({ valorServicoCentavos: 100.5, competencia: "2026-07-18" }),
    ).toThrow(/inteiro/);
    expect(() =>
      calcularBaseIbsCbs({
        valorServicoCentavos: R$1000,
        descontoIncondicionadoCentavos: -1,
        competencia: "2026-07-18",
      }),
    ).toThrow(/inteiro/);
  });

  it("recusa competência inválida", () => {
    expect(() =>
      calcularBaseIbsCbs({ valorServicoCentavos: R$1000, competencia: "abcd-01-01" }),
    ).toThrow(/Competência inválida/);
  });
});

// ---------------------------------------------------------------------------
// O efeito prático: o tributo destacado muda porque a base mudou.
// ---------------------------------------------------------------------------
describe("base correta x base bruta — efeito no tributo", () => {
  it("a base com ISSQN deduzido destaca menos IBS/CBS que a base bruta", () => {
    const competencia = "2026-07-18";
    const bruta = calcularTributosReforma({
      baseCentavos: 100_000,
      competencia,
      regime: "padrao",
    });

    const { baseCentavos } = calcularBaseIbsCbs({
      valorServicoCentavos: 100_000,
      aliquotaIss: 0.05,
      competencia,
    });
    const correta = calcularTributosReforma({ baseCentavos, competencia, regime: "padrao" });

    expect(bruta.cbsValorCentavos).toBe(900); // 0,9% de 1.000,00
    expect(correta.cbsValorCentavos).toBe(855); // 0,9% de 950,00
    expect(correta.cbsValorCentavos).toBeLessThan(bruta.cbsValorCentavos);
  });
});
