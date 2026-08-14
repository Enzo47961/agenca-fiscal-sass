import { describe, expect, it } from "vitest";
import {
  baixarXmls,
  competenciaExportacaoSchema,
  intervaloDaCompetencia,
  nomeArquivoXml,
  nomeDoPacote,
  resumirExportacao,
} from "./exportacao";

describe("competencia da exportacao", () => {
  it("aceita AAAA-MM e recusa o resto", () => {
    expect(competenciaExportacaoSchema.safeParse("2026-08").success).toBe(true);
    expect(competenciaExportacaoSchema.safeParse("2026-13").success).toBe(false);
    expect(competenciaExportacaoSchema.safeParse("2026-00").success).toBe(false);
    expect(competenciaExportacaoSchema.safeParse("08/2026").success).toBe(false);
    expect(competenciaExportacaoSchema.safeParse("2026-08-01").success).toBe(false);
  });

  it("delimita o mes de forma exclusiva no fim", () => {
    const { inicio, fimExclusivo } = intervaloDaCompetencia("2026-08");
    expect(inicio).toBe("2026-08-01T00:00:00.000Z");
    expect(fimExclusivo).toBe("2026-09-01T00:00:00.000Z");
  });

  it("vira o ano corretamente em dezembro", () => {
    expect(intervaloDaCompetencia("2026-12").fimExclusivo).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("nomeArquivoXml", () => {
  /**
   * O motivo de existir o CNPJ no nome: numero de NFS-e e sequencial POR
   * prestador. Na exportacao da carteira, duas empresas podem ter a nota n 1 —
   * sem o CNPJ, uma sobrescreveria a outra ao extrair.
   */
  it("nao colide entre empresas diferentes com o mesmo numero", () => {
    const a = nomeArquivoXml({ numeroNfse: "1", cnpjEmpresa: "11222333000181", urlXml: "x" }, 0);
    const b = nomeArquivoXml({ numeroNfse: "1", cnpjEmpresa: "11444777000161", urlXml: "x" }, 1);
    expect(a).not.toBe(b);
    expect(a).toBe("11222333000181-nfse-1.xml");
  });

  it("nota sem numero nao colide com outra sem numero", () => {
    const a = nomeArquivoXml({ numeroNfse: null, cnpjEmpresa: "11222333000181", urlXml: "x" }, 0);
    const b = nomeArquivoXml({ numeroNfse: null, cnpjEmpresa: "11222333000181", urlXml: "x" }, 1);
    expect(a).not.toBe(b);
  });

  it("limpa mascara do CNPJ e caractere estranho no numero", () => {
    expect(
      nomeArquivoXml({ numeroNfse: "12/345", cnpjEmpresa: "11.222.333/0001-81", urlXml: "x" }, 0),
    ).toBe("11222333000181-nfse-12345.xml");
  });

  it("nomeia o pacote com competencia e escopo", () => {
    expect(nomeDoPacote("2026-08", "carteira")).toBe("nfse-2026-08-carteira.zip");
  });
});

describe("resumirExportacao", () => {
  it("separa quem tem XML de quem nao tem", () => {
    const r = resumirExportacao([
      { numeroNfse: "1", cnpjEmpresa: "1", urlXml: "http://x/1.xml" },
      { numeroNfse: "2", cnpjEmpresa: "1", urlXml: null },
      { numeroNfse: "3", cnpjEmpresa: "1", urlXml: "http://x/3.xml" },
    ]);
    expect(r).toEqual({ total: 3, comXml: 2, semXml: 1 });
  });
});

describe("baixarXmls", () => {
  const nota = (n: string, url: string | null) => ({
    numeroNfse: n,
    cnpjEmpresa: "11222333000181",
    urlXml: url,
  });

  it("baixa so quem tem XML e ignora o resto", async () => {
    const { arquivos, falhas } = await baixarXmls(
      [nota("1", "http://x/1.xml"), nota("2", null), nota("3", "http://x/3.xml")],
      async () => new Uint8Array([1, 2, 3]),
    );
    expect(arquivos).toHaveLength(2);
    expect(falhas).toBe(0);
  });

  /**
   * Uma falha nao pode derrubar o lote: ZIP com 2 de 3 e um aviso claro e mais
   * util que erro seco — e o aviso e o que permite achar a nota problematica.
   */
  it("uma falha vira contagem, nao excecao", async () => {
    const { arquivos, falhas } = await baixarXmls(
      [nota("1", "http://x/1.xml"), nota("2", "http://x/quebra.xml"), nota("3", "http://x/3.xml")],
      async (url) => {
        if (url.includes("quebra")) throw new Error("HTTP 500");
        return new Uint8Array([9]);
      },
    );
    expect(arquivos).toHaveLength(2);
    expect(falhas).toBe(1);
  });

  it("respeita o paralelismo — nao abre tudo de uma vez contra o provider", async () => {
    let simultaneos = 0;
    let pico = 0;
    const notas = Array.from({ length: 20 }, (_, i) => nota(String(i), `http://x/${i}.xml`));

    await baixarXmls(
      notas,
      async () => {
        simultaneos += 1;
        pico = Math.max(pico, simultaneos);
        await new Promise((r) => setTimeout(r, 1));
        simultaneos -= 1;
        return new Uint8Array([1]);
      },
      4,
    );

    expect(pico).toBeLessThanOrEqual(4);
  });

  it("lote vazio nao quebra", async () => {
    const { arquivos, falhas } = await baixarXmls([], async () => new Uint8Array());
    expect(arquivos).toEqual([]);
    expect(falhas).toBe(0);
  });
});
