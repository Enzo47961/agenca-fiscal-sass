import { describe, it, expect } from "vitest";
import { resolverEmpresaAtiva } from "@/lib/empresa-ativa";

/**
 * O ponto destes testes é UM: o valor que vem do browser não decide o tenant.
 * Se algum dia alguém "simplificar" isto lendo o cookie direto, é aqui que
 * quebra — e é por isso que os casos hostis vêm antes dos felizes.
 */

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ALHEIA = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("resolverEmpresaAtiva — o cookie sugere, a carteira decide", () => {
  it("IGNORA empresa que não está na carteira", () => {
    // O caso que importa: id de outro tenant chegando pelo cookie.
    expect(resolverEmpresaAtiva([A, B], ALHEIA)).toBe(A);
  });

  it("ignora id malformado sem quebrar", () => {
    expect(resolverEmpresaAtiva([A, B], "'; DROP TABLE empresas; --")).toBe(A);
    expect(resolverEmpresaAtiva([A, B], "")).toBe(A);
    expect(resolverEmpresaAtiva([A, B], null)).toBe(A);
    expect(resolverEmpresaAtiva([A, B], undefined)).toBe(A);
  });

  it("aceita a preferida quando ela ESTÁ na carteira", () => {
    expect(resolverEmpresaAtiva([A, B], B)).toBe(B);
  });

  it("sem vínculo nenhum devolve null — quem chama manda para o onboarding", () => {
    expect(resolverEmpresaAtiva([], A)).toBeNull();
    expect(resolverEmpresaAtiva([], null)).toBeNull();
  });

  it("o padrão é determinístico: mesma entrada, mesma empresa", () => {
    // Sem isso, abrir o painel duas vezes poderia cair em empresas diferentes,
    // e emitir nota no CNPJ errado vira questão de sorte.
    expect(resolverEmpresaAtiva([A, B], null)).toBe(resolverEmpresaAtiva([A, B], null));
    expect(resolverEmpresaAtiva([A, B], null)).toBe(A);
  });

  it("carteira de uma empresa ignora qualquer preferência", () => {
    expect(resolverEmpresaAtiva([A], ALHEIA)).toBe(A);
    expect(resolverEmpresaAtiva([A], A)).toBe(A);
  });
});
