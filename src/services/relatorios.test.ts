import { describe, expect, it } from "vitest";
import { campoCsv, csvDaCarteira, periodoPadrao, periodoSchema, totalizar } from "./relatorios";
import { dataCivilBr } from "@/lib/data-br";

const linha = (over: Partial<Parameters<typeof totalizar>[0][number]> = {}) => ({
  empresaId: "e1",
  razaoSocial: "Padaria LTDA",
  nomeFantasia: null,
  cnpj: "11222333000181",
  papel: "owner",
  emitidas: 0,
  canceladas: 0,
  falhadas: 0,
  emAndamento: 0,
  faturadoCentavos: 0,
  ultimaEmissao: null,
  ...over,
});

describe("periodoSchema", () => {
  it("aceita periodo coerente", () => {
    expect(periodoSchema.safeParse({ inicio: "2026-08-01", fim: "2026-08-31" }).success).toBe(true);
  });

  it("recusa inicio depois do fim", () => {
    const r = periodoSchema.safeParse({ inicio: "2026-08-31", fim: "2026-08-01" });
    expect(r.success).toBe(false);
  });

  it("recusa inicio no futuro", () => {
    const r = periodoSchema.safeParse({ inicio: "2099-01-01", fim: "2099-12-31" });
    expect(r.success).toBe(false);
  });

  it("aceita hoje — a comparacao e com a data civil BR, nao UTC", () => {
    const hoje = dataCivilBr();
    expect(periodoSchema.safeParse({ inicio: hoje, fim: hoje }).success).toBe(true);
  });

  it("o periodo padrao e o mes corrente e passa na propria validacao", () => {
    const p = periodoPadrao();
    expect(p.inicio.endsWith("-01")).toBe(true);
    expect(periodoSchema.safeParse(p).success).toBe(true);
  });
});

describe("totalizar", () => {
  /**
   * O numero que o escritorio usa para AGIR: cliente que nao emitiu nada no
   * periodo e cliente prestes a sair. Se a linha sumisse do relatorio, o
   * problema ficaria invisivel — e e por isso que a consulta usa LEFT JOIN.
   */
  it("separa quem emitiu de quem parou", () => {
    const t = totalizar([
      linha({ emitidas: 3, faturadoCentavos: 30000 }),
      linha({ empresaId: "e2", emitidas: 0 }),
      linha({ empresaId: "e3", emitidas: 1, faturadoCentavos: 5000 }),
    ]);
    expect(t.empresas).toBe(3);
    expect(t.empresasAtivas).toBe(2);
    expect(t.empresasSemEmissao).toBe(1);
    expect(t.faturadoCentavos).toBe(35000);
  });

  /** Nota cancelada ou falhada nao entra no faturado — quem soma isso mente. */
  it("cancelada e falhada contam separado do faturamento", () => {
    const t = totalizar([
      linha({ emitidas: 2, canceladas: 5, falhadas: 3, faturadoCentavos: 20000 }),
    ]);
    expect(t.faturadoCentavos).toBe(20000);
    expect(t.canceladas).toBe(5);
    expect(t.falhadas).toBe(3);
  });

  it("carteira vazia nao quebra", () => {
    expect(totalizar([]).empresas).toBe(0);
  });
});

describe("csvDaCarteira", () => {
  it("usa ponto e virgula e virgula decimal — o Excel em portugues espera assim", () => {
    const csv = csvDaCarteira([linha({ emitidas: 2, faturadoCentavos: 123456 })]);
    expect(csv).toContain("razao_social;cnpj;papel");
    expect(csv).toContain("1234,56");
    expect(csv).not.toContain("1234.56");
  });

  /** Sem BOM o Excel le como Latin-1 e "Razao" vira "RazÃ£o". */
  it("leva BOM para o Excel reconhecer UTF-8", () => {
    expect(csvDaCarteira([]).charCodeAt(0)).toBe(0xfeff);
  });

  it("escapa campo com ponto e virgula no nome", () => {
    const csv = csvDaCarteira([linha({ razaoSocial: "Silva; Souza Ltda" })]);
    expect(csv).toContain('"Silva; Souza Ltda"');
  });

  it("aspas dentro do nome viram aspas duplicadas", () => {
    expect(campoCsv('Bar do "Ze"')).toBe('"Bar do ""Ze"""');
  });

  it("data de ultima emissao sai so com o dia", () => {
    const csv = csvDaCarteira([linha({ ultimaEmissao: "2026-08-14T16:53:44.717441+00:00" })]);
    expect(csv).toContain("2026-08-14");
    expect(csv).not.toContain("16:53:44");
  });
});
