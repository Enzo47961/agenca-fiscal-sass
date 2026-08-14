import { describe, expect, it } from "vitest";
import { avaliarSaude, LIMIAR_PRESAS, MINIMO_AMOSTRA } from "./saude";

const sinais = (o: Partial<Parameters<typeof avaliarSaude>[0]> = {}) => ({
  falhadas: 0,
  concluidas: 0,
  presas: 0,
  ...o,
});

describe("avaliarSaude", () => {
  it("dia normal nao gera alerta", () => {
    const d = avaliarSaude(sinais({ falhadas: 2, concluidas: 100 }));
    expect(d.nivel).toBe("ok");
    expect(d.motivos).toEqual([]);
  });

  /**
   * O ponto de usar PROPORCAO e nao contagem: dez falhas numa base grande e
   * terca-feira; numa base pequena e apagao. Limiar absoluto acusaria a grande
   * e ficaria mudo na pequena — que e onde estamos hoje.
   */
  it("dez falhas em mil notas e ruido; dez em doze e apagao", () => {
    expect(avaliarSaude(sinais({ falhadas: 10, concluidas: 1000 })).nivel).toBe("ok");
    expect(avaliarSaude(sinais({ falhadas: 10, concluidas: 12 })).nivel).toBe("critico");
  });

  it("proporcao alta com amostra pequena NAO alerta — seria ruido", () => {
    // 2 de 3 e 67%, mas tres notas nao dizem nada sobre o sistema.
    const d = avaliarSaude(sinais({ falhadas: 2, concluidas: 3 }));
    expect(d.nivel).toBe("ok");
    expect(3).toBeLessThan(MINIMO_AMOSTRA);
  });

  it("falha parcial vira atencao, falha quase total vira critico", () => {
    expect(avaliarSaude(sinais({ falhadas: 4, concluidas: 10 })).nivel).toBe("atencao");
    expect(avaliarSaude(sinais({ falhadas: 9, concluidas: 10 })).nivel).toBe("critico");
  });

  /** Nota presa aponta para o MOTOR, nao para a prefeitura — por isso critico. */
  it("notas presas acima do limiar sao criticas mesmo sem falhas", () => {
    const d = avaliarSaude(sinais({ presas: LIMIAR_PRESAS + 1 }));
    expect(d.nivel).toBe("critico");
    expect(d.motivos[0]).toMatch(/presas/i);
  });

  it("uma nota presa nao acorda ninguem de madrugada", () => {
    expect(avaliarSaude(sinais({ presas: 1 })).nivel).toBe("ok");
  });

  it("dia sem nota nenhuma nao e problema", () => {
    const d = avaliarSaude(sinais());
    expect(d.nivel).toBe("ok");
    expect(d.proporcaoFalha).toBe(0);
  });

  it("o motivo diz o numero, para o alerta ser acionavel", () => {
    const d = avaliarSaude(sinais({ falhadas: 8, concluidas: 10 }));
    expect(d.motivos[0]).toContain("8 de 10");
    expect(d.motivos[0]).toContain("80%");
  });
});
