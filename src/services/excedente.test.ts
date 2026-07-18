import { describe, it, expect } from "vitest";
import {
  idsExcedentes,
  ehExcedente,
  calcularFaturaExcedente,
  competenciaMesAnterior,
  intervaloDoMes,
  vencimentoEmDias,
  descricaoFaturaExcedente,
  type NotaEmitida,
} from "@/services/excedente";

describe("idsExcedentes", () => {
  const notas: NotaEmitida[] = [
    { id: "a", emitidaEm: "2026-06-01T10:00:00Z" },
    { id: "b", emitidaEm: "2026-06-02T10:00:00Z" },
    { id: "c", emitidaEm: "2026-06-03T10:00:00Z" },
  ];

  it("retorna as notas além do limite, na ordem de emissão", () => {
    expect(idsExcedentes(notas, 2)).toEqual(["c"]);
    expect(idsExcedentes(notas, 1)).toEqual(["b", "c"]);
  });

  it("limite 0 marca todas como excedente", () => {
    expect(idsExcedentes(notas, 0)).toEqual(["a", "b", "c"]);
  });

  it("limite >= quantidade não gera excedente", () => {
    expect(idsExcedentes(notas, 3)).toEqual([]);
    expect(idsExcedentes(notas, 99)).toEqual([]);
  });

  it("empate no horário é desfeito pelo id (igual ao banco)", () => {
    const empatadas: NotaEmitida[] = [
      { id: "z", emitidaEm: "2026-06-01T10:00:00Z" },
      { id: "a", emitidaEm: "2026-06-01T10:00:00Z" },
    ];
    // ordenadas: a, z → excedente (limite 1) = z
    expect(idsExcedentes(empatadas, 1)).toEqual(["z"]);
  });

  it("não muta o array de entrada", () => {
    const copia = [...notas];
    idsExcedentes(notas, 1);
    expect(notas).toEqual(copia);
  });

  it("rejeita limite inválido", () => {
    expect(() => idsExcedentes(notas, -1)).toThrow();
    expect(() => idsExcedentes(notas, 1.5)).toThrow();
  });
});

describe("ehExcedente", () => {
  it("é excedente quando a posição passa do limite", () => {
    expect(ehExcedente(3, 2)).toBe(true);
    expect(ehExcedente(2, 2)).toBe(false);
    expect(ehExcedente(1, 2)).toBe(false);
  });
});

describe("calcularFaturaExcedente", () => {
  it("multiplica quantidade por preço unitário (centavos)", () => {
    expect(calcularFaturaExcedente({ quantidadeNotas: 10, precoUnitarioCentavos: 30 })).toEqual({
      quantidadeNotas: 10,
      precoUnitarioCentavos: 30,
      valorTotalCentavos: 300,
    });
  });

  it("quantidade zero dá total zero", () => {
    expect(
      calcularFaturaExcedente({ quantidadeNotas: 0, precoUnitarioCentavos: 30 }).valorTotalCentavos,
    ).toBe(0);
  });

  it("rejeita valores não-inteiros ou negativos", () => {
    expect(() => calcularFaturaExcedente({ quantidadeNotas: -1, precoUnitarioCentavos: 30 })).toThrow();
    expect(() => calcularFaturaExcedente({ quantidadeNotas: 2, precoUnitarioCentavos: 1.5 })).toThrow();
    expect(() => calcularFaturaExcedente({ quantidadeNotas: 2, precoUnitarioCentavos: -30 })).toThrow();
  });
});

describe("competenciaMesAnterior", () => {
  it("volta um mês (primeiro dia)", () => {
    expect(competenciaMesAnterior(new Date("2026-07-18T12:00:00Z"))).toBe("2026-06-01");
  });

  it("vira o ano em janeiro", () => {
    expect(competenciaMesAnterior(new Date("2026-01-15T12:00:00Z"))).toBe("2025-12-01");
  });
});

describe("intervaloDoMes", () => {
  it("dá início e fim exclusivo do mês", () => {
    expect(intervaloDoMes("2026-06-01")).toEqual({ inicio: "2026-06-01", fimExclusivo: "2026-07-01" });
  });

  it("vira o ano em dezembro", () => {
    expect(intervaloDoMes("2025-12-01")).toEqual({ inicio: "2025-12-01", fimExclusivo: "2026-01-01" });
  });

  it("rejeita competência malformada", () => {
    expect(() => intervaloDoMes("2026/06/01")).toThrow();
  });
});

describe("vencimentoEmDias", () => {
  it("soma dias corridos", () => {
    expect(vencimentoEmDias(new Date("2026-07-18T00:00:00Z"), 7)).toBe("2026-07-25");
  });

  it("atravessa a virada de mês", () => {
    expect(vencimentoEmDias(new Date("2026-07-28T00:00:00Z"), 7)).toBe("2026-08-04");
  });
});

describe("descricaoFaturaExcedente", () => {
  it("descreve mês/ano e pluraliza", () => {
    expect(descricaoFaturaExcedente({ quantidadeNotas: 5, competencia: "2026-06-01" })).toBe(
      "Notas fiscais excedentes 06/2026 — 5 notas além do limite do plano",
    );
    expect(descricaoFaturaExcedente({ quantidadeNotas: 1, competencia: "2026-06-01" })).toContain(
      "1 nota além",
    );
  });
});
