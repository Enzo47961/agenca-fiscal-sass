import { describe, it, expect } from "vitest";
import {
  CCLASSTRIB_ESPERADOS_POR_CST,
  OP_SIMP_NAC,
  PENDENCIAS_C5,
  REG_AP_IBSCBS_SN,
  TABELA_CST,
  TOTAL_CCLASSTRIB_ESPERADO,
  aliquotaEfetiva,
  buscarCst,
  declaracaoIbsCbsSchema,
  validarDeclaracao,
  type DeclaracaoTributariaIBSCBS,
} from "@/lib/fiscal/ibscbs";

// ---------------------------------------------------------------------------
// Tabela CST — a informação de maior confiança da pesquisa (extração ao vivo
// do portal SVRS). Estes testes travam o conteúdo: se alguém editar a tabela
// sem passar por uma Nota Técnica, o teste quebra e obriga a justificar.
// ---------------------------------------------------------------------------

describe("tabela CST-IBS/CBS", () => {
  it("tem exatamente os 18 códigos oficiais", () => {
    expect(TABELA_CST).toHaveLength(18);
    expect(TABELA_CST.map((c) => c.codigo)).toEqual([
      "000", "010", "011", "200", "220", "221", "222", "400", "410",
      "510", "515", "550", "620", "800", "810", "811", "820", "830",
    ]);
  });

  it("mantém o CST 220 ativo (conflito de fontes resolvido na seção 4 da pesquisa)", () => {
    // Uma fonte secundária dizia que a v1.60 excluiu o 220; a extração ao vivo
    // do portal SVRS mostra ele ativo, com 3 cClassTrib. Vale a fonte primária.
    expect(buscarCst("220")).not.toBeNull();
    expect(CCLASSTRIB_ESPERADOS_POR_CST["220"]).toBe(3);
  });

  it("marca corretamente quais CSTs exigem tributação", () => {
    const exigem = TABELA_CST.filter((c) => c.exigeTributacao).map((c) => c.codigo);
    expect(exigem).toEqual([
      "000", "010", "011", "200", "220", "221", "222", "510", "515", "550", "830",
    ]);
  });

  it("liga cada indicador de subgrupo ao CST certo (seção 3.3)", () => {
    expect(TABELA_CST.filter((c) => c.diferimento).map((c) => c.codigo)).toEqual(["510", "515"]);
    expect(TABELA_CST.filter((c) => c.monofasica).map((c) => c.codigo)).toEqual(["620"]);
    expect(TABELA_CST.filter((c) => c.transfCredito).map((c) => c.codigo)).toEqual(["800"]);
    expect(TABELA_CST.filter((c) => c.credPresZfm).map((c) => c.codigo)).toEqual(["810"]);
    expect(TABELA_CST.filter((c) => c.ajusteCompetencia).map((c) => c.codigo)).toEqual(["811"]);
    // ind_gRed cobre redução de BC ou de alíquota: {011, 200, 222, 515}
    expect(
      TABELA_CST.filter((c) => c.redAliquota || c.redBaseCalculo).map((c) => c.codigo),
    ).toEqual(["011", "200", "222", "515"]);
  });

  it("a contagem de cClassTrib por CST soma os 164 oficiais", () => {
    const soma = Object.values(CCLASSTRIB_ESPERADOS_POR_CST).reduce((a, b) => a + b, 0);
    expect(soma).toBe(TOTAL_CCLASSTRIB_ESPERADO);
    expect(soma).toBe(164);
  });

  it("todo CST da tabela tem contagem de cClassTrib, e vice-versa", () => {
    expect(Object.keys(CCLASSTRIB_ESPERADOS_POR_CST).sort()).toEqual(
      TABELA_CST.map((c) => c.codigo).sort(),
    );
  });

  it("buscarCst devolve null para código inexistente", () => {
    expect(buscarCst("999")).toBeNull();
    expect(buscarCst("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

describe("declaracaoIbsCbsSchema", () => {
  it("exige CST de 3 dígitos e cClassTrib de 6", () => {
    expect(() => declaracaoIbsCbsSchema.parse({ cst: "00", cClassTrib: "000001" })).toThrow();
    expect(() => declaracaoIbsCbsSchema.parse({ cst: "000", cClassTrib: "00001" })).toThrow();
    expect(() => declaracaoIbsCbsSchema.parse({ cst: "abc", cClassTrib: "000001" })).toThrow();
  });

  it("aceita uma declaração mínima válida", () => {
    const d = declaracaoIbsCbsSchema.parse({ cst: "000", cClassTrib: "000001" });
    expect(d.cst).toBe("000");
  });
});

// ---------------------------------------------------------------------------
// Validação estrutural
// ---------------------------------------------------------------------------

function decl(over: Partial<DeclaracaoTributariaIBSCBS> = {}): DeclaracaoTributariaIBSCBS {
  return { cst: "000", cClassTrib: "000001", ...over };
}

describe("validarDeclaracao", () => {
  it("aprova uma declaração coerente", () => {
    expect(validarDeclaracao(decl())).toEqual({ valido: true, erros: [] });
  });

  it("recusa CST fora da tabela oficial", () => {
    const r = validarDeclaracao(decl({ cst: "999", cClassTrib: "999001" }));
    expect(r.valido).toBe(false);
    expect(r.erros.join(" ")).toContain("não existe na tabela");
  });

  it("recusa cClassTrib cujo prefixo não repete o CST", () => {
    const r = validarDeclaracao(decl({ cst: "200", cClassTrib: "000027" }));
    expect(r.valido).toBe(false);
    expect(r.erros.join(" ")).toContain("os 3 primeiros dígitos");
  });

  it("exige diferimento em CST 510 e 515", () => {
    expect(validarDeclaracao(decl({ cst: "510", cClassTrib: "510001" })).valido).toBe(false);
    expect(validarDeclaracao(decl({ cst: "515", cClassTrib: "515001" })).valido).toBe(false);

    const ok = validarDeclaracao(
      decl({
        cst: "510",
        cClassTrib: "510001",
        diferimento: { percentualUf: 1, percentualMun: 1, percentualCbs: 0 },
      }),
    );
    expect(ok.valido).toBe(true);
  });

  it("recusa diferimento em CST que não admite", () => {
    const r = validarDeclaracao(
      decl({ diferimento: { percentualUf: 0.5, percentualMun: null, percentualCbs: null } }),
    );
    expect(r.valido).toBe(false);
    expect(r.erros.join(" ")).toContain("não admite grupo de diferimento");
  });

  it("valida a coerência interna de gTribRegular", () => {
    const bom = validarDeclaracao(
      decl({ tribRegular: { cstRegular: "000", cClassTribRegular: "000001" } }),
    );
    expect(bom.valido).toBe(true);

    const ruim = validarDeclaracao(
      decl({ tribRegular: { cstRegular: "000", cClassTribRegular: "200027" } }),
    );
    expect(ruim.valido).toBe(false);
    expect(ruim.erros.join(" ")).toContain("cClassTrib regular");
  });

  // A trava que impede declarar um enquadramento que não sabemos se existe.
  it("falha fechada quando o cClassTrib não está na tabela de domínio", () => {
    const vazia = new Set<string>();
    const r = validarDeclaracao(decl(), { cClassTribConhecidos: vazia });
    expect(r.valido).toBe(false);
    expect(r.erros.join(" ")).toContain("não está na tabela de domínio");

    const populada = new Set(["000001"]);
    expect(validarDeclaracao(decl(), { cClassTribConhecidos: populada }).valido).toBe(true);
  });

  it("acumula todos os erros em vez de parar no primeiro", () => {
    const r = validarDeclaracao(
      decl({
        cst: "999",
        cClassTrib: "000001",
        tribRegular: { cstRegular: "888", cClassTribRegular: "111111" },
      }),
    );
    expect(r.erros.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Alíquota efetiva e códigos do Simples Nacional
// ---------------------------------------------------------------------------

describe("aliquotaEfetiva", () => {
  // pAliqEfet = pAliqOriginal × (1 − pRedAliq) × (1 − pRedutor) — NT-004,
  // confirmada por transcrição literal.
  it("sem redução, devolve a alíquota original", () => {
    expect(aliquotaEfetiva(0.009, 0)).toBeCloseTo(0.009, 10);
  });

  it("aplica redução de 60%", () => {
    expect(aliquotaEfetiva(0.1, 0.6)).toBeCloseTo(0.04, 10);
  });

  it("aplica redução e redutor de compra governamental de forma composta", () => {
    // 0.1 × (1 − 0.6) × (1 − 0.5) = 0.02 — composto, não somado
    expect(aliquotaEfetiva(0.1, 0.6, 0.5)).toBeCloseTo(0.02, 10);
  });

  it("redução de 100% zera a alíquota", () => {
    expect(aliquotaEfetiva(0.1, 1)).toBe(0);
  });
});

describe("Simples Nacional (NT-009)", () => {
  it("opSimpNac usa os códigos 1..4 da tabela oficial", () => {
    expect(OP_SIMP_NAC).toEqual({
      nao_optante: 1,
      mei: 2,
      me_epp: 3,
      optante_pendente: 4,
    });
  });

  it("regApIBSCBSSN contempla o regime híbrido (CBS pelo SN, IBS pelo regular)", () => {
    expect(REG_AP_IBSCBS_SN.cbs_sn_ibs_regular).toBe(2);
    expect(Object.keys(REG_AP_IBSCBS_SN)).toHaveLength(3);
  });
});

describe("pendências do C5", () => {
  it("estão declaradas em código para não serem tratadas como resolvidas", () => {
    expect(PENDENCIAS_C5.length).toBeGreaterThanOrEqual(8);
    expect(PENDENCIAS_C5.join(" ")).toContain("164");
    expect(PENDENCIAS_C5.join(" ")).toContain("contador");
  });
});
