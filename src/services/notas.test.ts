import { describe, it, expect, vi, beforeEach } from "vitest";

// Evita instanciar o cliente Inngest real (sem rede) ao importar o módulo.
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { solicitarEmissao, solicitarEmissaoSchema } from "@/services/notas";
import { fakeSupabase, type FakeCtx } from "@/test-utils/fake-supabase";
import { limparCacheDominioFiscal } from "@/services/dominio-fiscal";

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

// ---------------------------------------------------------------------------
// C7 — regime diferenciado exige confirmação explícita.
//
// Não valida ELEGIBILIDADE (isso exige a correlação atividade ↔ regime, que é
// decisão contábil e não existe ainda). Valida que alguém assumiu a escolha.
// ---------------------------------------------------------------------------

describe("solicitarEmissaoSchema — confirmação de regime diferenciado (C7)", () => {
  const usuario = "55555555-5555-5555-5555-555555555555";

  it("regime padrão não exige confirmação nenhuma", () => {
    expect(() => solicitarEmissaoSchema.parse(base)).not.toThrow();
  });

  it("recusa regime diferenciado sem confirmação", () => {
    expect(() =>
      solicitarEmissaoSchema.parse({ ...base, regimeIbsCbs: "reducao_60" }),
    ).toThrow(/confirmação explícita/i);
  });

  it("aceita regime diferenciado com confirmação e autor", () => {
    const r = solicitarEmissaoSchema.parse({
      ...base,
      regimeIbsCbs: "reducao_60",
      confirmacaoRegimeDiferenciado: true,
      confirmadoPorUserId: usuario,
    });
    expect(r.confirmadoPorUserId).toBe(usuario);
  });

  it("recusa confirmação sem autor — registro sem quem confirmou não é registro", () => {
    expect(() =>
      solicitarEmissaoSchema.parse({
        ...base,
        regimeIbsCbs: "reducao_30",
        confirmacaoRegimeDiferenciado: true,
      }),
    ).toThrow(/usuário identificado/i);
  });

  it("exige confirmação em TODOS os regimes fora do padrão", () => {
    for (const regime of ["reducao_30", "reducao_60", "aliquota_zero", "especifico"]) {
      expect(() => solicitarEmissaoSchema.parse({ ...base, regimeIbsCbs: regime })).toThrow();
    }
  });
});

describe("solicitarEmissao — registro da confirmação (C7)", () => {
  const usuario = "55555555-5555-5555-5555-555555555555";

  it("grava quem confirmou e quando, na própria nota", async () => {
    const { db, payload } = dbCapturandoInsert();
    const antes = Date.now();

    await solicitarEmissao(db, {
      ...base,
      regimeIbsCbs: "reducao_60",
      confirmacaoRegimeDiferenciado: true,
      confirmadoPorUserId: usuario,
    });

    const p = payload();
    expect(p.regime_confirmado_por).toBe(usuario);
    expect(typeof p.regime_confirmado_em).toBe("string");
    // Instante do registro, não uma data qualquer copiada de outro campo.
    expect(new Date(p.regime_confirmado_em as string).getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("nota em regime padrão NÃO recebe registro de confirmação", async () => {
    const { db, payload } = dbCapturandoInsert();

    await solicitarEmissao(db, base);

    const p = payload();
    // Gravar autor e data aqui inventaria uma confirmação que ninguém deu.
    expect(p.regime_confirmado_por).toBeNull();
    expect(p.regime_confirmado_em).toBeNull();
  });

  it("regime padrão ignora um userId que chegue junto", async () => {
    const { db, payload } = dbCapturandoInsert();

    await solicitarEmissao(db, { ...base, confirmadoPorUserId: usuario });

    // A Server Action manda `estado.userId` sempre; o que decide o registro é
    // o regime, não a presença do campo.
    expect(payload().regime_confirmado_por).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B7 — base de cálculo LIGADA ao fluxo de criação da nota.
//
// Os testes abaixo olham o PAYLOAD do insert, não o retorno: o retorno é só o
// id, e uma implementação que calculasse a base certinho e esquecesse de
// gravá-la passaria num teste de retorno. É exatamente o modo de falha que o
// B7 tinha antes — a fórmula existia, testada, e ninguém a chamava.
// ---------------------------------------------------------------------------

/** Captura o payload do insert em `notas_fiscais`. */
function dbCapturandoInsert(): { db: ReturnType<typeof fakeSupabase>; payload: () => Record<string, unknown> } {
  let capturado: Record<string, unknown> = {};
  const db = fakeSupabase((ctx: FakeCtx) => {
    if (ctx.op === "insert") {
      capturado = ctx.payload as Record<string, unknown>;
      return {
        data: { id: "44444444-4444-4444-4444-444444444444", empresa_id: base.empresaId },
        error: null,
      };
    }
    return { data: null, error: null };
  });
  return { db, payload: () => capturado };
}

describe("solicitarEmissao — base de cálculo do IBS/CBS (B7)", () => {
  it("grava o vBC e cada termo da fórmula nas colunas", async () => {
    const { db, payload } = dbCapturandoInsert();

    await solicitarEmissao(db, {
      ...base,
      valorServicoCentavos: 100_000, // R$ 1.000,00
      descontoIncondicionadoCentavos: 10_000,
      ajusteBaseCentavos: 5_000,
      tipoAjusteBase: "ibscbs",
      issqnCentavos: 4_500,
      pisCentavos: 1_650,
      cofinsCentavos: 7_600,
    });

    const p = payload();
    // 100000 − 10000 − 5000 − 4500 − 1650 − 7600
    expect(p.ibscbs_base_centavos).toBe(71_250);
    expect(p.desconto_incondicionado_centavos).toBe(10_000);
    expect(p.ajuste_base_centavos).toBe(5_000);
    expect(p.ajuste_base_tipo).toBe("ibscbs");
    expect(p.issqn_centavos).toBe(4_500);
    expect(p.pis_centavos).toBe(1_650);
    expect(p.cofins_centavos).toBe(7_600);
  });

  it("destaca CBS/IBS sobre o vBC, não sobre o valor bruto", async () => {
    const { db, payload } = dbCapturandoInsert();

    await solicitarEmissao(db, {
      ...base,
      valorServicoCentavos: 100_000,
      descontoIncondicionadoCentavos: 20_000,
      issqnCentavos: 0,
      competencia: "2026-07-18",
    });

    const p = payload();
    expect(p.ibscbs_base_centavos).toBe(80_000);
    // CBS 0,9% da fase de teste: sobre 80.000 dá 720; sobre o bruto daria 900.
    expect(p.cbs_valor_centavos).toBe(720);
    expect(p.ibs_valor_centavos).toBe(80); // IBS 0,1%
  });

  it("deriva o ISSQN quando ele é omitido, e grava o valor derivado", async () => {
    const { db, payload } = dbCapturandoInsert();

    await solicitarEmissao(db, {
      ...base,
      valorServicoCentavos: 100_000,
      aliquotaIss: 0.05,
    });

    const p = payload();
    expect(p.issqn_centavos).toBe(5_000); // 100.000 × 5%
    expect(p.ibscbs_base_centavos).toBe(95_000);
  });

  it("respeita ISSQN zero informado — não é o mesmo que omitir", async () => {
    const { db, payload } = dbCapturandoInsert();

    await solicitarEmissao(db, {
      ...base,
      valorServicoCentavos: 100_000,
      aliquotaIss: 0.05,
      issqnCentavos: 0,
    });

    const p = payload();
    expect(p.issqn_centavos).toBe(0);
    expect(p.ibscbs_base_centavos).toBe(100_000);
  });

  it("nota sem nenhuma dedução informada continua válida (só o ISSQN derivado)", async () => {
    const { db, payload } = dbCapturandoInsert();

    await solicitarEmissao(db, base);

    const p = payload();
    expect(p.desconto_incondicionado_centavos).toBe(0);
    expect(p.ajuste_base_centavos).toBe(0);
    expect(p.ajuste_base_tipo).toBeNull();
    expect(p.pis_centavos).toBe(0);
    expect(p.cofins_centavos).toBe(0);
    expect(p.ibscbs_base_centavos).toBe(15_000 - 750); // 15.000 − 5% de ISS
  });

  it("recusa a nota quando as deduções superam o valor do serviço", async () => {
    const { db } = dbCapturandoInsert();

    await expect(
      solicitarEmissao(db, {
        ...base,
        valorServicoCentavos: 10_000,
        descontoIncondicionadoCentavos: 20_000,
      }),
    ).rejects.toThrow(/negativa/i);
  });

  it("recusa ajuste de base sem tipo — não teria tag onde sair", async () => {
    const { db } = dbCapturandoInsert();

    await expect(
      solicitarEmissao(db, { ...base, ajusteBaseCentavos: 1_000 }),
    ).rejects.toThrow(/tipoAjusteBase/);
  });

  it("recusa PIS/COFINS a partir de 2027 antes de criar a nota", async () => {
    const { db } = dbCapturandoInsert();

    await expect(
      solicitarEmissao(db, { ...base, competencia: "2027-01-05", pisCentavos: 100 }),
    ).rejects.toThrow(/PIS\/COFINS/);
  });
});

// ---------------------------------------------------------------------------
// Correlação oficial (Anexo VIII) ligada à criação da nota.
//
// Categoria A preenche sozinha; B e C não sugerem nada. E a redução do
// destaque passa a vir da tabela oficial do cClassTrib, não do enum.
// ---------------------------------------------------------------------------

/** Fake que responde por tabela: correlação, tabela de domínio e insert. */
function dbFiscal(opcoes: {
  correlacao?: Array<Record<string, unknown>>;
  reducao?: { perc_reducao_ibs: number; perc_reducao_cbs: number } | null;
  exigeTribRegular?: boolean;
}) {
  let payload: Record<string, unknown> = {};
  const db = fakeSupabase((ctx: FakeCtx) => {
    if (ctx.op === "insert") {
      payload = ctx.payload as Record<string, unknown>;
      return {
        data: { id: "44444444-4444-4444-4444-444444444444", empresa_id: base.empresaId },
        error: null,
      };
    }
    if (ctx.table === "item_lc116_cclasstrib_nfse") {
      return { data: opcoes.correlacao ?? [], error: null };
    }
    if (ctx.table === "cclasstrib_ibscbs") {
      // Duas consultas diferentes na mesma tabela: a de domínio não filtra, a
      // da redução filtra por código.
      const filtraCodigo = ctx.chamadas.some((c) => c.metodo === "eq");
      if (filtraCodigo) {
        return {
          data: opcoes.reducao
            ? {
                codigo: "200029",
                ind_trib_regular: opcoes.exigeTribRegular ?? false,
                ind_cred_pres: false,
                ...opcoes.reducao,
              }
            : null,
          error: null,
        };
      }
      return {
        data: [{ codigo: "000001" }, { codigo: "200029" }, { codigo: "550016" }],
        error: null,
      };
    }
    return { data: null, error: null };
  });
  return { db, payload: () => payload };
}

const OPCAO_INTEGRAL = {
  codigo: "000001",
  cst: "000",
  descricao_oficial: "Situações tributadas integralmente pelo IBS e CBS.",
  perc_reducao_ibs: 0,
  perc_reducao_cbs: 0,
  ind_trib_regular: false,
  ind_cred_pres: false,
  artigo_lc214: "Art. 4 da LC 214/2025",
  url_legislacao: null,
};

describe("solicitarEmissao — correlação oficial do item de serviço", () => {
  beforeEach(() => limparCacheDominioFiscal());

  it("categoria A: preenche CST e cClassTrib sozinho", () => {
    return (async () => {
      const { db, payload } = dbFiscal({
        correlacao: [OPCAO_INTEGRAL],
        reducao: { perc_reducao_ibs: 0, perc_reducao_cbs: 0 },
      });

      await solicitarEmissao(db, base);

      const p = payload();
      expect(p.ibscbs_cclasstrib).toBe("000001");
      expect(p.ibscbs_cst).toBe("000");
    })();
  });

  it("categoria B: NÃO sugere nada — a nota sai sem grupo até alguém escolher", async () => {
    const { db, payload } = dbFiscal({
      correlacao: [
        OPCAO_INTEGRAL,
        { ...OPCAO_INTEGRAL, codigo: "200043", cst: "200" },
      ],
    });

    await solicitarEmissao(db, base);

    expect(payload().ibscbs_cclasstrib).toBeNull();
  });

  it("categoria C: item sem correlação não recebe sugestão", async () => {
    const { db, payload } = dbFiscal({ correlacao: [] });
    await solicitarEmissao(db, base);
    expect(payload().ibscbs_cclasstrib).toBeNull();
  });

  it("declaração explícita vence o preenchimento automático", async () => {
    const { db, payload } = dbFiscal({
      correlacao: [OPCAO_INTEGRAL],
      reducao: { perc_reducao_ibs: 0.6, perc_reducao_cbs: 0.6 },
    });

    await solicitarEmissao(db, {
      ...base,
      declaracaoIbsCbs: { cst: "200", cClassTrib: "200029" },
      // 200029 tem redução: exige a mesma confirmação do C7.
      confirmacaoRegimeDiferenciado: true,
      confirmadoPorUserId: "55555555-5555-5555-5555-555555555555",
    });

    expect(payload().ibscbs_cclasstrib).toBe("200029");
  });

  it("a redução do destaque vem da TABELA, não do enum de regime", async () => {
    const { db, payload } = dbFiscal({
      correlacao: [],
      reducao: { perc_reducao_ibs: 0.6, perc_reducao_cbs: 0.6 },
    });

    await solicitarEmissao(db, {
      ...base,
      valorServicoCentavos: 100_000,
      issqnCentavos: 0,
      declaracaoIbsCbs: { cst: "200", cClassTrib: "200029" },
      // regime segue "padrao": quem não escolheu nada aceita o que a tabela diz
      confirmacaoRegimeDiferenciado: true,
      confirmadoPorUserId: "55555555-5555-5555-5555-555555555555",
    });

    const p = payload();
    // CBS 0,9% x (1 − 0,6) sobre 100.000 = 360, e não 900.
    expect(p.cbs_valor_centavos).toBe(360);
    expect(p.ibs_valor_centavos).toBe(40);
  });

  it("regime que contradiz a redução oficial impede a criação da nota", async () => {
    const { db } = dbFiscal({
      correlacao: [],
      reducao: { perc_reducao_ibs: 0.6, perc_reducao_cbs: 0.6 },
    });

    await expect(
      solicitarEmissao(db, {
        ...base,
        regimeIbsCbs: "reducao_30",
        confirmacaoRegimeDiferenciado: true,
        confirmadoPorUserId: "55555555-5555-5555-5555-555555555555",
        declaracaoIbsCbs: { cst: "200", cClassTrib: "200029" },
      }),
    ).rejects.toThrow(/E1543/);
  });
});

describe("solicitarEmissao — cClassTrib com redução exige a confirmação do C7", () => {
  const usuario = "55555555-5555-5555-5555-555555555555";
  beforeEach(() => limparCacheDominioFiscal());

  it("recusa código com redução sem confirmação, mesmo com regime padrão", async () => {
    // A porta dos fundos que este teste fecha: escolher 200029 mantendo o
    // regime em "padrao" daria 60% de redução sem ninguém assumir nada.
    const { db } = dbFiscal({
      correlacao: [],
      reducao: { perc_reducao_ibs: 0.6, perc_reducao_cbs: 0.6 },
    });

    await expect(
      solicitarEmissao(db, {
        ...base,
        declaracaoIbsCbs: { cst: "200", cClassTrib: "200029" },
      }),
    ).rejects.toThrow(/confirmação explícita/i);
  });

  it("registra a confirmação mesmo quando o regime é padrão", async () => {
    const { db, payload } = dbFiscal({
      correlacao: [],
      reducao: { perc_reducao_ibs: 0.6, perc_reducao_cbs: 0.6 },
    });

    await solicitarEmissao(db, {
      ...base,
      declaracaoIbsCbs: { cst: "200", cClassTrib: "200029" },
      confirmacaoRegimeDiferenciado: true,
      confirmadoPorUserId: usuario,
    });

    // A auditoria precisa de um registro só, venha a afirmação do enum ou do código.
    expect(payload().regime_confirmado_por).toBe(usuario);
    expect(payload().regime_confirmado_em).toBeTruthy();
  });

  it("código SEM redução não exige confirmação nenhuma", async () => {
    const { db, payload } = dbFiscal({
      correlacao: [OPCAO_INTEGRAL],
      reducao: { perc_reducao_ibs: 0, perc_reducao_cbs: 0 },
    });

    await solicitarEmissao(db, base);

    expect(payload().ibscbs_cclasstrib).toBe("000001");
    expect(payload().regime_confirmado_por).toBeNull();
  });
});

describe("solicitarEmissao — codigo que exige gTribRegular falha fechado", () => {
  beforeEach(() => limparCacheDominioFiscal());

  it("recusa a nota em vez de emitir sem o grupo obrigatório", async () => {
    // RN 733/734 do Anexo VI (E0964/E0965): o grupo é obrigatório para esses
    // códigos. Emitir sem ele é rejeição; inventar o par CSTReg/cClassTribReg
    // seria pior, porque a nota passaria declarando algo não verificado.
    const { db } = dbFiscal({
      correlacao: [],
      reducao: { perc_reducao_ibs: 0, perc_reducao_cbs: 0 },
      exigeTribRegular: true,
    });

    await expect(
      solicitarEmissao(db, {
        ...base,
        declaracaoIbsCbs: { cst: "550", cClassTrib: "550016" },
      }),
    ).rejects.toThrow(/tributação regular/i);
  });

  it("código que NÃO exige o grupo passa normalmente", async () => {
    const { db, payload } = dbFiscal({
      correlacao: [OPCAO_INTEGRAL],
      reducao: { perc_reducao_ibs: 0, perc_reducao_cbs: 0 },
      exigeTribRegular: false,
    });

    await solicitarEmissao(db, base);
    expect(payload().ibscbs_cclasstrib).toBe("000001");
  });
});
