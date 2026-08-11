import { describe, it, expect } from "vitest";
import {
  MAX_DOCUMENTOS_AJUSTE,
  TIPO_AJUSTE_DOC,
  documentoAjusteBaseSchema,
  documentosAjusteBaseSchema,
  documentosAjusteDeColuna,
  resumoDocumento,
  somarAjusteBase,
  type DocumentoAjusteBase,
} from "@/lib/fiscal/ajuste-base";

/**
 * gReeRepRes — os documentos que originam o ajuste da base do IBS/CBS.
 * O total é SEMPRE derivado; digitar total foi o modelo que não se transmitia.
 */

const DFE: DocumentoAjusteBase = {
  tipo: "01",
  valorCentavos: 30_000,
  identificacao: {
    forma: "dfe_nacional",
    tipoChaveDFe: "2",
    chaveDFe: "35260812345678000199550010000000011000000017",
  },
};

describe("documentoAjusteBaseSchema", () => {
  it("aceita documento do repositório nacional", () => {
    expect(documentoAjusteBaseSchema.safeParse(DFE).success).toBe(true);
  });

  it("aceita documento fiscal fora do repositório", () => {
    const r = documentoAjusteBaseSchema.safeParse({
      ...DFE,
      identificacao: {
        forma: "doc_fiscal_outro",
        codigoMunicipio: "3550308",
        numero: "12345",
        descricao: "Nota de serviço do subcontratado",
      },
    });
    expect(r.success).toBe(true);
  });

  it("aceita documento não fiscal", () => {
    const r = documentoAjusteBaseSchema.safeParse({
      ...DFE,
      identificacao: { forma: "doc_nao_fiscal", numero: "REC-9", descricao: "Recibo de repasse" },
    });
    expect(r.success).toBe(true);
  });

  it("as três formas são EXCLUDENTES — não dá para misturar", () => {
    const r = documentoAjusteBaseSchema.safeParse({
      ...DFE,
      identificacao: {
        forma: "dfe_nacional",
        tipoChaveDFe: "2",
        chaveDFe: "35260812345678000199550010000000011000000017",
        numero: "12345", // campo de outra forma
      },
    });
    // `discriminatedUnion` ignora o excedente, mas a forma escolhida manda.
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.identificacao.forma).toBe("dfe_nacional");
  });

  it('tipo "99" exige descrição — sem ela ninguém audita depois', () => {
    const r = documentoAjusteBaseSchema.safeParse({ ...DFE, tipo: "99" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["descricaoTipo"]);
  });

  it('tipo "99" com descrição passa', () => {
    const r = documentoAjusteBaseSchema.safeParse({
      ...DFE,
      tipo: "99",
      descricaoTipo: "Reembolso de custas processuais por conta e ordem",
    });
    expect(r.success).toBe(true);
  });

  it('chave de tipo "9 — Outro" exige a descrição do documento', () => {
    const r = documentoAjusteBaseSchema.safeParse({
      ...DFE,
      identificacao: { forma: "dfe_nacional", tipoChaveDFe: "9", chaveDFe: "X1" },
    });
    expect(r.success).toBe(false);
  });

  it("recusa valor zero ou negativo — documento sem valor não ajusta nada", () => {
    expect(documentoAjusteBaseSchema.safeParse({ ...DFE, valorCentavos: 0 }).success).toBe(false);
    expect(documentoAjusteBaseSchema.safeParse({ ...DFE, valorCentavos: -1 }).success).toBe(false);
  });

  it("recusa valor fracionário (regra 15: centavos inteiros)", () => {
    expect(documentoAjusteBaseSchema.safeParse({ ...DFE, valorCentavos: 10.5 }).success).toBe(
      false,
    );
  });

  it("o domínio de tipos é o oficial, sem acréscimo nosso", () => {
    expect([...TIPO_AJUSTE_DOC]).toEqual(["01", "02", "03", "04", "99"]);
    expect(documentoAjusteBaseSchema.safeParse({ ...DFE, tipo: "05" }).success).toBe(false);
  });
});

describe("documentosAjusteBaseSchema", () => {
  it("lista vazia é o padrão", () => {
    expect(documentosAjusteBaseSchema.parse(undefined)).toEqual([]);
  });

  it(`recusa mais de ${MAX_DOCUMENTOS_AJUSTE} documentos`, () => {
    const muitos = Array.from({ length: MAX_DOCUMENTOS_AJUSTE + 1 }, () => DFE);
    expect(documentosAjusteBaseSchema.safeParse(muitos).success).toBe(false);
  });

  it(`aceita exatamente ${MAX_DOCUMENTOS_AJUSTE}`, () => {
    const limite = Array.from({ length: MAX_DOCUMENTOS_AJUSTE }, () => DFE);
    expect(documentosAjusteBaseSchema.safeParse(limite).success).toBe(true);
  });
});

describe("somarAjusteBase", () => {
  it("soma os documentos", () => {
    expect(somarAjusteBase([DFE, { ...DFE, valorCentavos: 5_000 }])).toBe(35_000);
  });

  it("lista vazia soma zero", () => {
    expect(somarAjusteBase([])).toBe(0);
  });
});

describe("documentosAjusteDeColuna", () => {
  it("reconstrói a lista gravada", () => {
    expect(documentosAjusteDeColuna([DFE])).toHaveLength(1);
  });

  it("coluna que não é array vira lista vazia", () => {
    expect(documentosAjusteDeColuna(null)).toEqual([]);
    expect(documentosAjusteDeColuna({ tipo: "01" })).toEqual([]);
  });

  it("descarta o documento inválido e PRESERVA o resto", () => {
    // Derrubar a emissão de uma nota já criada por causa de um item malformado
    // seria pior; o total gravado segue como referência de conferência.
    const misto = [DFE, { tipo: "01" }, { ...DFE, valorCentavos: 1_000 }];
    const r = documentosAjusteDeColuna(misto);
    expect(r).toHaveLength(2);
    expect(somarAjusteBase(r)).toBe(31_000);
  });
});

describe("resumoDocumento", () => {
  it("descreve cada forma de identificação de um jeito legível", () => {
    expect(resumoDocumento(DFE)).toContain("NF-e");
    expect(
      resumoDocumento({
        ...DFE,
        identificacao: {
          forma: "doc_fiscal_outro",
          codigoMunicipio: "3550308",
          numero: "12345",
          descricao: "x",
        },
      }),
    ).toContain("12345");
    expect(
      resumoDocumento({
        ...DFE,
        identificacao: { forma: "doc_nao_fiscal", numero: "REC-9", descricao: "x" },
      }),
    ).toContain("REC-9");
  });
});
