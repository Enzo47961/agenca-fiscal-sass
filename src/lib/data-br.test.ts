import { describe, expect, it } from "vitest";
import { dataCivilBr } from "./data-br";

/**
 * Item B4. Estes testes existem para impedir a volta de
 * `new Date().toISOString().slice(0, 10)` como forma de obter "hoje".
 */
describe("dataCivilBr", () => {
  it("das 21h a meia-noite, UTC ja virou e a data civil BR nao", () => {
    // 31/08/2026, 22h em Sao Paulo. O defeito original gravava competencia
    // 2026-09-01 e mandava a nota para o mes seguinte de apuracao.
    const noite = new Date("2026-08-31T22:00:00-03:00");
    expect(noite.toISOString().slice(0, 10)).toBe("2026-09-01"); // o que era
    expect(dataCivilBr(noite)).toBe("2026-08-31"); // o que passa a ser
  });

  it("na virada do ano, nao antecipa 2027", () => {
    // 31/12/2026 as 21h30 em Sao Paulo: o bloqueio das aliquotas de 2027
    // disparava 2h30 antes da hora.
    const reveillon = new Date("2026-12-31T21:30:00-03:00");
    expect(reveillon.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(dataCivilBr(reveillon)).toBe("2026-12-31");
  });

  it("de madrugada em Brasilia, ainda e o mesmo dia civil", () => {
    // 01/09 00:30 BRT = 03:30 UTC no mesmo dia — aqui os dois concordam.
    expect(dataCivilBr(new Date("2026-09-01T00:30:00-03:00"))).toBe("2026-09-01");
  });

  it("formata sempre com zero a esquerda", () => {
    expect(dataCivilBr(new Date("2026-01-05T12:00:00-03:00"))).toBe("2026-01-05");
  });
});
