import { describe, it, expect, beforeEach } from "vitest";
import {
  carregarCClassTribConhecidos,
  limparCacheDominioFiscal,
} from "@/services/dominio-fiscal";
import { fakeSupabase, type FakeResult } from "@/test-utils/fake-supabase";

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
