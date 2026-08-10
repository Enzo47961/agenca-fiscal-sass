import { describe, it, expect, vi } from "vitest";

// Evita instanciar o cliente Inngest real (sem rede) ao importar o módulo.
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { solicitarEmissao, solicitarEmissaoSchema } from "@/services/notas";
import { fakeSupabase, type FakeCtx } from "@/test-utils/fake-supabase";

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
