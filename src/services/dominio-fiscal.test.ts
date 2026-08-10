import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  carregarCClassTribConhecidos,
  limparCacheDominioFiscal,
} from "@/services/dominio-fiscal";
import { fakeSupabase, type FakeResult } from "@/test-utils/fake-supabase";

// Sem rede ao importar o módulo de notas (que instancia o cliente Inngest).
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));
import { solicitarEmissao } from "@/services/notas";

/**
 * Fake mínimo com contador de chamadas — o ponto do cache é justamente NÃO
 * bater no banco a cada tentativa de emissão, então isso precisa ser medido.
 */
function bancoFalso(resultado: FakeResult) {
  let chamadas = 0;
  const db = fakeSupabase((): FakeResult => {
    chamadas += 1;
    return resultado;
  });
  return { db, chamadas: () => chamadas };
}

const TRES_CODIGOS: FakeResult = {
  data: [{ codigo: "000001" }, { codigo: "200027" }, { codigo: "410029" }],
  error: null,
};

describe("carregarCClassTribConhecidos", () => {
  beforeEach(() => limparCacheDominioFiscal());

  it("devolve os códigos da tabela como conjunto", async () => {
    const { db } = bancoFalso(TRES_CODIGOS);
    const conjunto = await carregarCClassTribConhecidos(db);

    expect(conjunto.has("200027")).toBe(true);
    expect(conjunto.has("999999")).toBe(false);
    expect(conjunto.size).toBe(3);
  });

  it("cacheia: a segunda chamada não vai ao banco", async () => {
    const { db, chamadas } = bancoFalso(TRES_CODIGOS);

    await carregarCClassTribConhecidos(db, { agora: 1_000 });
    await carregarCClassTribConhecidos(db, { agora: 2_000 });
    await carregarCClassTribConhecidos(db, { agora: 60_000 });

    expect(chamadas()).toBe(1);
  });

  it("recarrega depois do TTL de 10 minutos", async () => {
    const { db, chamadas } = bancoFalso(TRES_CODIGOS);

    await carregarCClassTribConhecidos(db, { agora: 0 });
    await carregarCClassTribConhecidos(db, { agora: 10 * 60 * 1000 - 1 });
    expect(chamadas()).toBe(1);

    await carregarCClassTribConhecidos(db, { agora: 10 * 60 * 1000 + 1 });
    expect(chamadas()).toBe(2);
  });

  it("limparCacheDominioFiscal força releitura", async () => {
    const { db, chamadas } = bancoFalso(TRES_CODIGOS);

    await carregarCClassTribConhecidos(db, { agora: 0 });
    limparCacheDominioFiscal();
    await carregarCClassTribConhecidos(db, { agora: 1 });

    expect(chamadas()).toBe(2);
  });

  it("propaga erro de consulta em vez de devolver conjunto vazio", async () => {
    const { db } = bancoFalso({ data: null, error: { message: "conexão recusada" } });
    await expect(carregarCClassTribConhecidos(db)).rejects.toThrow("conexão recusada");
  });

  // Tabela vazia = seed não rodou. Devolver conjunto vazio faria TODA declaração
  // ser recusada com a mensagem errada ("código não está na tabela"), escondendo
  // a causa real. Melhor falhar apontando o seed.
  it("tabela vazia falha apontando o seed, não a declaração", async () => {
    const { db } = bancoFalso({ data: [], error: null });
    await expect(carregarCClassTribConhecidos(db)).rejects.toThrow(/vazia|seed/i);
  });

  it("não cacheia resultado de falha", async () => {
    let chamadas = 0;
    const db = fakeSupabase((): FakeResult => {
      chamadas += 1;
      return chamadas === 1
        ? { data: null, error: { message: "instabilidade" } }
        : TRES_CODIGOS;
    });

    await expect(carregarCClassTribConhecidos(db, { agora: 0 })).rejects.toThrow();
    const conjunto = await carregarCClassTribConhecidos(db, { agora: 1 });

    expect(conjunto.size).toBe(3);
    expect(chamadas).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Integração: solicitarEmissao valida a declaração ANTES de criar a nota.
// O ponto: sem isso, uma nota com enquadramento inválido seria criada, entraria
// na máquina de estados, e só falharia minutos depois no motor.
// ---------------------------------------------------------------------------

describe("solicitarEmissao com grupo IBSCBS", () => {
  beforeEach(() => limparCacheDominioFiscal());

  const entrada = {
    empresaId: "22222222-2222-2222-2222-222222222222",
    clienteId: "33333333-3333-3333-3333-333333333333",
    descricaoServico: "Consultoria",
    codigoServico: "01.05",
    valorServicoCentavos: 15_000,
    aliquotaIss: 0.05,
    issRetido: false,
    competencia: "2026-07-18",
  };

  /** Fake que responde a tabela de domínio e ao insert da nota. */
  function bancoComDominio(codigos: string[]) {
    const inserts: unknown[] = [];
    const db = fakeSupabase((ctx): FakeResult => {
      if (ctx.table === "cclasstrib_ibscbs") {
        return { data: codigos.map((codigo) => ({ codigo })), error: null };
      }
      if (ctx.op === "insert") {
        inserts.push(ctx.payload);
        return {
          data: { id: "44444444-4444-4444-4444-444444444444", empresa_id: entrada.empresaId },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    return { db, inserts };
  }

  it("persiste a declaração nas colunas quando o código é válido", async () => {
    const { db, inserts } = bancoComDominio(["200027"]);
    await solicitarEmissao(db, {
      ...entrada,
      declaracaoIbsCbs: { cst: "200", cClassTrib: "200027" },
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      ibscbs_cst: "200",
      ibscbs_cclasstrib: "200027",
    });
  });

  it("recusa código inexistente e NÃO cria a nota", async () => {
    const { db, inserts } = bancoComDominio(["200027"]);

    await expect(
      solicitarEmissao(db, {
        ...entrada,
        declaracaoIbsCbs: { cst: "200", cClassTrib: "200999" },
      }),
    ).rejects.toThrow(/Grupo IBS\/CBS inválido/);

    // O ponto do teste: nenhuma nota chegou a existir.
    expect(inserts).toHaveLength(0);
  });

  it("recusa prefixo divergente antes de tocar o banco", async () => {
    const { db, inserts } = bancoComDominio(["000001"]);
    await expect(
      solicitarEmissao(db, {
        ...entrada,
        declaracaoIbsCbs: { cst: "200", cClassTrib: "000001" },
      }),
    ).rejects.toThrow(/Grupo IBS\/CBS inválido/);
    expect(inserts).toHaveLength(0);
  });

  it("sem declaração, as colunas do grupo ficam nulas e a tabela nem é consultada", async () => {
    const { db, inserts } = bancoComDominio([]);
    await solicitarEmissao(db, entrada);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      ibscbs_cst: null,
      ibscbs_cclasstrib: null,
    });
  });
});
