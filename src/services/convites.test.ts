import { describe, expect, it } from "vitest";
import {
  criarConviteSchema,
  gerarToken,
  hashToken,
  hashesIguais,
  urlDoConvite,
} from "./convites";

describe("gerarToken", () => {
  it("nao repete — e credencial, colisao seria acesso cruzado", () => {
    const vistos = new Set(Array.from({ length: 500 }, () => gerarToken().token));
    expect(vistos.size).toBe(500);
  });

  it("cabe numa URL sem escape", () => {
    for (let i = 0; i < 50; i++) {
      const { token } = gerarToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it("tem entropia de 32 bytes (43 chars em base64url)", () => {
    expect(gerarToken().token).toHaveLength(43);
  });

  it("o hash devolvido corresponde ao token", () => {
    const { token, hash } = gerarToken();
    expect(hash).toBe(hashToken(token));
    expect(hash).toHaveLength(64);
  });

  /**
   * O ponto inteiro de guardar hash: o que fica no banco nao reconstroi o
   * token. Se este teste falhar, alguem trocou o hash por codificacao.
   */
  it("o hash nao contem o token", () => {
    const { token, hash } = gerarToken();
    expect(hash).not.toContain(token);
    expect(Buffer.from(hash, "hex").toString("base64url")).not.toBe(token);
  });
});

describe("hashesIguais", () => {
  it("reconhece iguais e diferentes", () => {
    const a = hashToken("abc");
    expect(hashesIguais(a, hashToken("abc"))).toBe(true);
    expect(hashesIguais(a, hashToken("abd"))).toBe(false);
  });

  it("tamanhos diferentes nao explodem", () => {
    expect(hashesIguais("curto", hashToken("abc"))).toBe(false);
  });
});

describe("urlDoConvite", () => {
  it("monta a URL sem barra dupla", () => {
    expect(urlDoConvite("https://x.com/", "abc")).toBe("https://x.com/convite/abc");
    expect(urlDoConvite("https://x.com", "abc")).toBe("https://x.com/convite/abc");
  });
});

describe("criarConviteSchema", () => {
  const base = { empresaId: "11111111-1111-1111-1111-111111111111", email: "a@b.com" };

  it("aceita admin e operador", () => {
    expect(criarConviteSchema.safeParse({ ...base, papel: "admin" }).success).toBe(true);
    expect(criarConviteSchema.safeParse({ ...base, papel: "operador" }).success).toBe(true);
  });

  /**
   * `owner` fora do schema de proposito: dono se define ao criar a empresa, e
   * ter dois donos e uma decisao que ainda nao modelamos (quem pode remover
   * quem?). O banco tambem recusa — esta e a segunda camada.
   */
  it("recusa convite para owner", () => {
    expect(criarConviteSchema.safeParse({ ...base, papel: "owner" }).success).toBe(false);
  });

  it("recusa e-mail malformado", () => {
    expect(criarConviteSchema.safeParse({ ...base, email: "sem-arroba", papel: "admin" }).success).toBe(
      false,
    );
  });
});
