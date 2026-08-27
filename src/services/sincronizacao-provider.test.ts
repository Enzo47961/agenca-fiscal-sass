import { describe, it, expect } from "vitest";
import {
  creditosDoPlano,
  planejarSincronizacao,
  type EmpresaParaSincronizar,
} from "@/services/sincronizacao-provider";

const nossa = (
  id: string,
  cnpj: string,
  providerEmpresaId: string | null = null,
): EmpresaParaSincronizar => ({ id, cnpj, providerEmpresaId });

describe("planejarSincronizacao", () => {
  it("cadastra o que não existe no provedor", () => {
    const p = planejarSincronizacao([nossa("a", "11222333000181")], []);

    expect(p.cadastrar).toEqual(["a"]);
    expect(p.adotar).toEqual([]);
    expect(p.emDia).toEqual([]);
  });

  it("ADOTA o id em vez de recriar quando o CNPJ já existe lá", () => {
    // É o cenário que a função existe para resolver: o POST foi processado e a
    // resposta se perdeu. Recriar aqui produziria duplicata irreversível.
    const p = planejarSincronizacao(
      [nossa("a", "11222333000181")],
      [{ providerEmpresaId: "777", cnpj: "11222333000181" }],
    );

    expect(p.adotar).toEqual([{ empresaId: "a", providerEmpresaId: "777" }]);
    expect(p.cadastrar).toEqual([]);
  });

  it("compara CNPJ por dígitos — formatação de um lado não vira empresa duplicada", () => {
    const p = planejarSincronizacao(
      [nossa("a", "11.222.333/0001-81")],
      [{ providerEmpresaId: "777", cnpj: "11222333000181" }],
    );

    expect(p.cadastrar).toEqual([]);
    expect(p.adotar).toHaveLength(1);
  });

  it("deixa em dia quem já tem id que confere", () => {
    const p = planejarSincronizacao(
      [nossa("a", "11222333000181", "777")],
      [{ providerEmpresaId: "777", cnpj: "11222333000181" }],
    );

    expect(p.emDia).toEqual(["a"]);
    expect(p.cadastrar).toEqual([]);
    expect(p.divergentes).toEqual([]);
  });

  it("id que sumiu do provedor vira DIVERGENTE, e não recadastro automático", () => {
    // Recadastrar aqui seria adivinhar: o CNPJ pode continuar lá sob outro id, e
    // a "correção" criaria a duplicata que todo o desenho evita.
    const p = planejarSincronizacao([nossa("a", "11222333000181", "999")], []);

    expect(p.divergentes).toEqual([{ empresaId: "a", providerEmpresaIdAusente: "999" }]);
    expect(p.cadastrar).toEqual([]);
    expect(p.adotar).toEqual([]);
  });

  it("separa uma carteira mista sem perder nenhuma empresa", () => {
    const p = planejarSincronizacao(
      [
        nossa("nova", "11222333000181"),
        nossa("orfa", "11444777000161"),
        nossa("emdia", "06990590000123", "111"),
        nossa("sumiu", "33014556000196", "222"),
      ],
      [
        { providerEmpresaId: "111", cnpj: "06990590000123" },
        { providerEmpresaId: "555", cnpj: "11444777000161" },
      ],
    );

    expect(p.cadastrar).toEqual(["nova"]);
    expect(p.adotar).toEqual([{ empresaId: "orfa", providerEmpresaId: "555" }]);
    expect(p.emDia).toEqual(["emdia"]);
    expect(p.divergentes).toEqual([{ empresaId: "sumiu", providerEmpresaIdAusente: "222" }]);

    const total =
      p.cadastrar.length + p.adotar.length + p.emDia.length + p.divergentes.length;
    expect(total).toBe(4);
  });

  it("empresa alheia no provedor não contamina o plano", () => {
    // A conta é guarda-chuva: existem lá empresas que não são desta carteira.
    const p = planejarSincronizacao(
      [nossa("a", "11222333000181")],
      [{ providerEmpresaId: "888", cnpj: "99888777000166" }],
    );

    expect(p.cadastrar).toEqual(["a"]);
    expect(p.adotar).toEqual([]);
  });

  it("carteira vazia não produz trabalho", () => {
    const p = planejarSincronizacao([], [{ providerEmpresaId: "1", cnpj: "11222333000181" }]);
    expect(p).toEqual({ adotar: [], cadastrar: [], emDia: [], divergentes: [] });
  });

  it("é idempotente: rodar de novo sobre o resultado não gera cadastro", () => {
    const nossas = [nossa("a", "11222333000181")];
    const primeira = planejarSincronizacao(nossas, []);
    expect(primeira.cadastrar).toEqual(["a"]);

    // Depois do cadastro, o provedor passa a conhecer o CNPJ e nós, o id.
    const segunda = planejarSincronizacao(
      [nossa("a", "11222333000181", "777")],
      [{ providerEmpresaId: "777", cnpj: "11222333000181" }],
    );
    expect(segunda.cadastrar).toEqual([]);
    expect(segunda.emDia).toEqual(["a"]);
  });
});

describe("creditosDoPlano", () => {
  it("conta as páginas lidas mais um POST por empresa a cadastrar", () => {
    const plano = planejarSincronizacao(
      [nossa("a", "11222333000181"), nossa("b", "11444777000161")],
      [],
    );
    expect(creditosDoPlano(plano, 12)).toBe(14);
  });

  it("reconciliação de carteira já pronta custa só as páginas", () => {
    // É o que torna o job barato o bastante para virar rotina em vez de evento.
    const plano = planejarSincronizacao(
      [nossa("a", "11222333000181", "777")],
      [{ providerEmpresaId: "777", cnpj: "11222333000181" }],
    );
    expect(creditosDoPlano(plano, 12)).toBe(12);
  });
});
