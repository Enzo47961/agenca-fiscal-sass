import { describe, expect, it } from "vitest";
import { avaliarFranquia, resumoFranquia } from "./franquia";

const BASE = { franquia: 4000, custoExcedenteCentavos: 12, diasNoMes: 30 };

describe("avaliarFranquia", () => {
  it("ritmo tranquilo fica em ok", () => {
    // 1.200 notas ate o dia 15 -> projecao 2.400 (60%)
    const e = avaliarFranquia({ ...BASE, notasEmitidas: 1200, diaDoMes: 15 });
    expect(e.projecao).toBe(2400);
    expect(e.nivel).toBe("ok");
    expect(e.custoProjetadoCentavos).toBe(0);
  });

  /**
   * O CASO QUE JUSTIFICA A PROJECAO. No dia 8 o consumo real e de so 22% — um
   * alerta de limiar unico em 80% nao diria nada. Mas o ritmo leva a 4.125
   * notas, acima da franquia. Aqui ainda da tempo de negociar plano.
   */
  it("avisa em ATENCAO quando o ritmo leva ao estouro, muito antes do limiar", () => {
    const e = avaliarFranquia({ ...BASE, notasEmitidas: 1100, diaDoMes: 8 });
    expect(e.percentual).toBeLessThan(0.3); // real ainda baixo
    expect(e.projecao).toBe(4125);
    expect(e.nivel).toBe("atencao");
    expect(e.custoProjetadoCentavos).toBe(125 * 12);
  });

  it("consumo real acima de 80% vira ALERTA", () => {
    const e = avaliarFranquia({ ...BASE, notasEmitidas: 3300, diaDoMes: 25 });
    expect(e.nivel).toBe("alerta");
  });

  it("acima da franquia vira ESTOURO e calcula o custo", () => {
    const e = avaliarFranquia({ ...BASE, notasEmitidas: 4300, diaDoMes: 28 });
    expect(e.nivel).toBe("estouro");
    // projecao ~4607 -> 607 excedentes x R$0,12
    expect(e.custoProjetadoCentavos).toBeGreaterThan(0);
  });

  it("dia 1 nao explode a projecao para o infinito", () => {
    const e = avaliarFranquia({ ...BASE, notasEmitidas: 10, diaDoMes: 1 });
    expect(e.projecao).toBe(300);
    expect(Number.isFinite(e.projecao)).toBe(true);
  });

  it("mes vazio nao gera aviso", () => {
    const e = avaliarFranquia({ ...BASE, notasEmitidas: 0, diaDoMes: 1 });
    expect(e.nivel).toBe("ok");
    expect(e.projecao).toBe(0);
  });

  // O vigia roda todo dia; uma borda de calendario nao pode derruba-lo.
  it("grampeia dia fora do intervalo em vez de lancar", () => {
    expect(avaliarFranquia({ ...BASE, notasEmitidas: 100, diaDoMes: 99 }).diaDoMes).toBe(30);
    expect(avaliarFranquia({ ...BASE, notasEmitidas: 100, diaDoMes: 0 }).diaDoMes).toBe(1);
  });

  it("recusa franquia invalida — o numero vem do banco e nao pode ser zero", () => {
    expect(() => avaliarFranquia({ ...BASE, franquia: 0, notasEmitidas: 1, diaDoMes: 1 })).toThrow();
  });

  it("o resumo diz o que importa em cada nivel", () => {
    expect(resumoFranquia(avaliarFranquia({ ...BASE, notasEmitidas: 4300, diaDoMes: 28 }))).toMatch(
      /estourada/i,
    );
    expect(resumoFranquia(avaliarFranquia({ ...BASE, notasEmitidas: 1100, diaDoMes: 8 }))).toMatch(
      /proje/i,
    );
  });
});
