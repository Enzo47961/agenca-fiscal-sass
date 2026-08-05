import { describe, it, expect } from "vitest";
import { tokenConfere } from "@/lib/webhook-token";

const TOKEN = "b".repeat(40);

describe("tokenConfere (item M2 da auditoria)", () => {
  it("aceita o token exato", () => {
    expect(tokenConfere(TOKEN, TOKEN)).toBe(true);
  });

  it("recusa token diferente do mesmo tamanho", () => {
    expect(tokenConfere("c".repeat(40), TOKEN)).toBe(false);
  });

  it("recusa quando só o prefixo bate (o caso que o ataque de timing explora)", () => {
    expect(tokenConfere("b".repeat(39) + "c", TOKEN)).toBe(false);
    expect(tokenConfere("b".repeat(20) + "c".repeat(20), TOKEN)).toBe(false);
  });

  it("recusa tamanho diferente sem estourar (timingSafeEqual exige buffers iguais)", () => {
    expect(tokenConfere("b".repeat(39), TOKEN)).toBe(false);
    expect(tokenConfere("b".repeat(41), TOKEN)).toBe(false);
  });

  it("recusa header ausente, vazio ou nulo", () => {
    expect(tokenConfere(null, TOKEN)).toBe(false);
    expect(tokenConfere(undefined, TOKEN)).toBe(false);
    expect(tokenConfere("", TOKEN)).toBe(false);
  });

  it("recusa quando o segredo do servidor está vazio — nunca autoriza por omissão", () => {
    expect(tokenConfere("", "")).toBe(false);
    expect(tokenConfere("qualquer", "")).toBe(false);
  });

  it("lida com multibyte sem quebrar", () => {
    expect(tokenConfere("çãé-token-çãé", "çãé-token-çãé")).toBe(true);
    expect(tokenConfere("çãé-token-çãx", "çãé-token-çãé")).toBe(false);
  });
});
