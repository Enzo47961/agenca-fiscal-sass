import { describe, it, expect } from "vitest";
import { formatarCentavos, NOTA_STATUS, PLANO_TIPO } from "@/types/domain";

describe("formatarCentavos", () => {
  it("formata centavos como reais", () => {
    expect(formatarCentavos(1500)).toContain("15,00");
    expect(formatarCentavos(1500)).toContain("R$");
  });

  it("zero é R$ 0,00", () => {
    expect(formatarCentavos(0)).toContain("0,00");
  });

  it("trata valores com centavos quebrados", () => {
    expect(formatarCentavos(30)).toContain("0,30");
    expect(formatarCentavos(199)).toContain("1,99");
  });
});

describe("enums de domínio", () => {
  it("espelham os valores esperados do banco", () => {
    expect(NOTA_STATUS).toContain("emitida");
    expect(NOTA_STATUS).toContain("falhou");
    expect(PLANO_TIPO).toEqual(["starter", "pro", "escala"]);
  });
});
