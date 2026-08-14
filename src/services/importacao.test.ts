import { describe, expect, it } from "vitest";
import { analisarCsv, cnpjValido } from "./importacao";
import { dividirCsv, detectarSeparador, lerCsv, normalizarCabecalho } from "@/lib/csv";

// CNPJs com digito verificador correto, para os testes nao virarem falso negativo.
const CNPJ_A = "11222333000181";
const CNPJ_B = "11444777000161";

const CABECALHO = "razao_social,cnpj,codigo_municipio_ibge,email_contato,regime_tributario";

describe("cnpjValido", () => {
  it("aceita CNPJ com digito verificador correto", () => {
    expect(cnpjValido(CNPJ_A)).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
  });

  it("recusa digito verificador errado", () => {
    expect(cnpjValido("11222333000182")).toBe(false);
  });

  /** Placeholder de planilha passa no modulo 11 e nao existe. */
  it("recusa sequencias repetidas", () => {
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });

  it("recusa tamanho errado", () => {
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("")).toBe(false);
  });
});

describe("leitura do CSV", () => {
  it("detecta ponto e virgula do Excel em portugues", () => {
    expect(detectarSeparador("a;b;c\n1;2;3")).toBe(";");
    expect(detectarSeparador("a,b,c\n1,2,3")).toBe(",");
  });

  it("virgula dentro de aspas nao separa coluna", () => {
    const l = dividirCsv('nome,cidade\n"Silva, Souza & Cia",Bauru', ",");
    expect(l[1]).toEqual(["Silva, Souza & Cia", "Bauru"]);
  });

  it("aspas escapadas viram uma aspa", () => {
    const l = dividirCsv('a\n"Ele disse ""oi"""', ",");
    expect(l[1]?.[0]).toBe('Ele disse "oi"');
  });

  it("remove o BOM do Excel — sem isso nenhuma coluna casa", () => {
    const { colunas } = lerCsv("﻿cnpj,nome\n1,2");
    expect(colunas[0]).toBe("cnpj");
  });

  it("aceita CRLF do Windows", () => {
    expect(dividirCsv("a,b\r\n1,2", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("normaliza cabecalho com acento e separador", () => {
    expect(normalizarCabecalho("Razão Social")).toBe("razaosocial");
    expect(normalizarCabecalho("codigo_municipio_ibge")).toBe("codigomunicipioibge");
    expect(normalizarCabecalho("  CNPJ  ")).toBe("cnpj");
  });

  it("numera as linhas contando o cabecalho — para a mensagem de erro apontar certo", () => {
    const { linhas } = lerCsv("cnpj\n1\n2");
    expect(linhas.map((l) => l.numero)).toEqual([2, 3]);
  });
});

describe("analisarCsv", () => {
  it("aceita um arquivo bem formado", () => {
    const csv = `${CABECALHO}\nPadaria LTDA,${CNPJ_A},3550308,a@a.com,simples_nacional`;
    const r = analisarCsv(csv);
    expect(r.erros).toEqual([]);
    expect(r.validas).toHaveLength(1);
    expect(r.validas[0]?.dados.razaoSocial).toBe("Padaria LTDA");
  });

  it("aceita apelidos de coluna e de regime — ninguem digita cabecalho igual", () => {
    const csv = `Razão Social;CNPJ;Município;E-mail;Regime\nX LTDA;11.222.333/0001-81;3550308;a@a.com;Simples`;
    const r = analisarCsv(csv);
    expect(r.validas).toHaveLength(1);
    expect(r.validas[0]?.dados.regimeTributario).toBe("simples_nacional");
    expect(r.validas[0]?.dados.cnpj).toBe(CNPJ_A);
  });

  /**
   * O ponto do desenho: uma linha ruim nao derruba o arquivo, e o relatorio sai
   * COMPLETO na primeira passada — nao um erro por rodada.
   */
  it("linha ruim vira erro e as boas seguem", () => {
    const csv = [
      CABECALHO,
      `Boa LTDA,${CNPJ_A},3550308,a@a.com,simples_nacional`,
      `Ruim LTDA,11222333000182,3550308,b@b.com,simples_nacional`,
      `Outra Ruim,${CNPJ_B},3550308,sem-arroba,lucro_real`,
      `Boa 2 LTDA,${CNPJ_B},3550308,c@c.com,lucro_presumido`,
    ].join("\n");

    const r = analisarCsv(csv);
    expect(r.validas).toHaveLength(2);
    expect(r.erros).toHaveLength(2);
    expect(r.erros[0]).toMatchObject({ linha: 3 });
    expect(r.erros[0]?.erro).toMatch(/d[ií]gito verificador/i);
    expect(r.erros[1]?.erro).toMatch(/e-?mail/i);
  });

  it("CNPJ repetido no arquivo e recusado, apontando a linha original", () => {
    const csv = [
      CABECALHO,
      `A LTDA,${CNPJ_A},3550308,a@a.com,simples_nacional`,
      `A LTDA de novo,${CNPJ_A},3550308,a@a.com,simples_nacional`,
    ].join("\n");

    const r = analisarCsv(csv);
    expect(r.validas).toHaveLength(1);
    expect(r.erros[0]?.erro).toMatch(/repetido no arquivo.*linha 2/i);
  });

  it("cabecalho faltando e relatado antes de qualquer linha", () => {
    const r = analisarCsv("razao_social,cnpj\nX,11222333000181");
    expect(r.colunasFaltando).toContain("codigoMunicipioIbge");
    expect(r.colunasFaltando).toContain("emailContato");
    expect(r.validas).toEqual([]);
  });

  it("arquivo vazio nao quebra", () => {
    expect(analisarCsv("").validas).toEqual([]);
  });

  it("linhas em branco no fim sao ignoradas", () => {
    const csv = `${CABECALHO}\nX LTDA,${CNPJ_A},3550308,a@a.com,simples\n\n\n`;
    expect(analisarCsv(csv).validas).toHaveLength(1);
  });
});
