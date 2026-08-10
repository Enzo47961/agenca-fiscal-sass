import { describe, it, expect } from "vitest";
import {
  ReducaoDivergenteError,
  baseDeColunas,
  calcularBaseIbsCbs,
  calcularTributosReforma,
  fatoresReducao,
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

// ---------------------------------------------------------------------------
// Volta do banco: reconstrução da base a partir das colunas gravadas.
// ---------------------------------------------------------------------------
describe("baseDeColunas", () => {
  const colunas = {
    ibscbs_base_centavos: 71_250,
    valor_servico_centavos: 100_000,
    desconto_incondicionado_centavos: 10_000,
    ajuste_base_centavos: 5_000,
    ajuste_base_tipo: "ibscbs" as const,
    issqn_centavos: 4_500,
    pis_centavos: 1_650,
    cofins_centavos: 7_600,
  };

  it("remonta o vBC e todos os termos", () => {
    expect(baseDeColunas(colunas)).toEqual({
      baseCentavos: 71_250,
      valorServicoCentavos: 100_000,
      descontoIncondicionadoCentavos: 10_000,
      ajusteBaseCentavos: 5_000,
      tipoAjusteBase: "ibscbs",
      issqnCentavos: 4_500,
      pisCentavos: 1_650,
      cofinsCentavos: 7_600,
    });
  });

  it("o que volta do banco reproduz a fórmula — os termos fecham no total", () => {
    const b = baseDeColunas(colunas);
    const soma =
      b!.valorServicoCentavos -
      b!.descontoIncondicionadoCentavos -
      b!.ajusteBaseCentavos -
      b!.issqnCentavos -
      b!.pisCentavos -
      b!.cofinsCentavos;
    expect(soma).toBe(b!.baseCentavos);
  });

  it("nota anterior à fórmula devolve null — NUNCA o valor bruto", () => {
    // Cair para valor_servico_centavos aqui reintroduziria, só nas notas
    // antigas, exatamente o erro que o B7 corrigiu.
    const antiga = baseDeColunas({ ...colunas, ibscbs_base_centavos: null });
    expect(antiga).toBeNull();
  });

  it("base zero é base, não ausência de base", () => {
    // Serviço inteiramente consumido pelas deduções tem vBC 0 e continua sendo
    // uma nota com base calculada — `?? null` no lugar errado a trataria como
    // nota antiga.
    expect(baseDeColunas({ ...colunas, ibscbs_base_centavos: 0 })?.baseCentavos).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Correção transversal: a redução vem da tabela oficial do cClassTrib, não do
// enum RegimeIbsCbs. RN 104/111/118 do Anexo VI (E1543/E1547/E1552).
// ---------------------------------------------------------------------------
describe("fatoresReducao — tabela oficial manda sobre o enum", () => {
  it("sem cClassTrib declarado, o enum continua decidindo", () => {
    expect(fatoresReducao({ regime: "reducao_60" })).toEqual({ ibs: 0.4, cbs: 0.4 });
    expect(fatoresReducao({ regime: "padrao" })).toEqual({ ibs: 1, cbs: 1 });
  });

  it("regime padrão apenas ACEITA a redução oficial — não é divergência", () => {
    // `padrao` é o default de quem não escolheu nada; a tabela preenche.
    expect(
      fatoresReducao({ regime: "padrao", oficial: { cClassTrib: "200029", ibs: 0.6, cbs: 0.6 } }),
    ).toEqual({ ibs: 0.4, cbs: 0.4 });
  });

  it("regime e tabela concordando passa", () => {
    expect(
      fatoresReducao({
        regime: "reducao_60",
        oficial: { cClassTrib: "200029", ibs: 0.6, cbs: 0.6 },
      }),
    ).toEqual({ ibs: 0.4, cbs: 0.4 });
  });

  it("regime e tabela discordando LANÇA, citando a rejeição", () => {
    expect(() =>
      fatoresReducao({
        regime: "reducao_30",
        oficial: { cClassTrib: "200029", ibs: 0.6, cbs: 0.6 },
      }),
    ).toThrow(ReducaoDivergenteError);

    try {
      fatoresReducao({
        regime: "reducao_30",
        oficial: { cClassTrib: "200029", ibs: 0.6, cbs: 0.6 },
      });
    } catch (e) {
      expect((e as Error).message).toMatch(/E1543/);
      expect((e as ReducaoDivergenteError).cClassTrib).toBe("200029");
    }
  });

  it("suporta a redução assimétrica do 200025 (60% IBS / 100% CBS)", () => {
    // É o único código da tabela com IBS != CBS, e foi o que justificou
    // colunas separadas no banco.
    expect(
      fatoresReducao({ regime: "padrao", oficial: { cClassTrib: "200025", ibs: 0.6, cbs: 1.0 } }),
    ).toEqual({ ibs: 0.4, cbs: 0 });
  });

  it("recusa percentual cru no lugar de fração — bug de importação", () => {
    expect(() =>
      fatoresReducao({ regime: "padrao", oficial: { cClassTrib: "200029", ibs: 60, cbs: 60 } }),
    ).toThrow(/fração/);
  });
});

describe("calcularTributosReforma com redução oficial", () => {
  it("aplica a redução do cClassTrib ao destaque e registra a origem", () => {
    const t = calcularTributosReforma({
      baseCentavos: 100_000,
      competencia: "2026-07-18",
      regime: "padrao",
      reducaoOficial: { cClassTrib: "200029", ibs: 0.6, cbs: 0.6 },
    });
    // CBS 0,9% x (1 - 0,6) = 0,36% de 1.000,00 = 360 centavos
    expect(t.cbsValorCentavos).toBe(360);
    expect(t.ibsValorCentavos).toBe(40);
    expect(t.reducaoDe).toBe("200029");
  });

  it("assimetria do 200025 chega ao valor destacado", () => {
    const t = calcularTributosReforma({
      baseCentavos: 100_000,
      competencia: "2026-07-18",
      regime: "padrao",
      reducaoOficial: { cClassTrib: "200025", ibs: 0.6, cbs: 1.0 },
    });
    expect(t.ibsValorCentavos).toBe(40); // 0,1% x 0,4
    expect(t.cbsValorCentavos).toBe(0); // zerada
  });
});
