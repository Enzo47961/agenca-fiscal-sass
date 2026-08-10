import { describe, it, expect } from "vitest";
import { destinoSeguro, urlDeRedirecionamento, DESTINO_PADRAO } from "@/lib/redirect-seguro";

describe("destinoSeguro", () => {
  it("aceita caminho relativo à raiz", () => {
    expect(destinoSeguro("/dashboard/notas")).toBe("/dashboard/notas");
    expect(destinoSeguro("/dashboard?filtro=erro#topo")).toBe("/dashboard?filtro=erro#topo");
  });

  it("usa o padrão quando o parâmetro está ausente ou vazio", () => {
    expect(destinoSeguro(null)).toBe(DESTINO_PADRAO);
    expect(destinoSeguro(undefined)).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("   ")).toBe(DESTINO_PADRAO);
  });

  it("respeita um fallback customizado", () => {
    expect(destinoSeguro(null, "/onboarding")).toBe("/onboarding");
  });

  // O caso que dá nome ao problema: o link diz o nosso domínio, o usuário chega
  // autenticado no domínio do atacante.
  it("recusa URL absoluta", () => {
    expect(destinoSeguro("https://phishing.exemplo")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("http://phishing.exemplo/dashboard")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("HTTPS://phishing.exemplo")).toBe(DESTINO_PADRAO);
  });

  it("recusa esquemas executáveis", () => {
    expect(destinoSeguro("javascript:alert(1)")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("data:text/html,<script>")).toBe(DESTINO_PADRAO);
  });

  // Começa com "/", passaria em qualquer checagem ingênua, e o navegador
  // resolve como https://phishing.exemplo.
  it("recusa URL protocol-relative", () => {
    expect(destinoSeguro("//phishing.exemplo")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("//phishing.exemplo/dashboard")).toBe(DESTINO_PADRAO);
  });

  it("recusa barra invertida em qualquer posição", () => {
    expect(destinoSeguro("/\\phishing.exemplo")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/\\/phishing.exemplo")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("\\\\phishing.exemplo")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/dashboard\\..\\x")).toBe(DESTINO_PADRAO);
  });

  it("recusa caracteres de controle, crus ou percent-encoded", () => {
    expect(destinoSeguro("/\t/phishing.exemplo")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/%09/phishing.exemplo")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/%0d%0a/phishing.exemplo")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/%5cphishing.exemplo")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/%2f%2fphishing.exemplo")).toBe(DESTINO_PADRAO);
  });

  it("recusa percent-encoding malformado em vez de adivinhar", () => {
    expect(destinoSeguro("/%zz")).toBe(DESTINO_PADRAO);
  });

  it("devolve o valor original, não a versão decodificada", () => {
    // A decodificação existe só para inspecionar. Devolver o valor decodificado
    // mudaria o destino real do redirecionamento.
    expect(destinoSeguro("/dashboard/nota%20fiscal")).toBe("/dashboard/nota%20fiscal");
  });
});

describe("urlDeRedirecionamento", () => {
  const BASE = "https://app.exemplo.com.br/auth/callback?code=abc";

  it("resolve caminho relativo contra a origem da requisição", () => {
    const url = urlDeRedirecionamento("/dashboard/notas", BASE);
    expect(url.toString()).toBe("https://app.exemplo.com.br/dashboard/notas");
  });

  it("nunca sai da origem, mesmo com entrada hostil", () => {
    for (const hostil of [
      "https://phishing.exemplo",
      "//phishing.exemplo",
      "/\\phishing.exemplo",
      "javascript:alert(1)",
    ]) {
      expect(urlDeRedirecionamento(hostil, BASE).origin).toBe("https://app.exemplo.com.br");
    }
  });

  it("cai no fallback informado quando o destino é recusado", () => {
    const url = urlDeRedirecionamento("https://phishing.exemplo", BASE, "/login?erro=x");
    expect(url.toString()).toBe("https://app.exemplo.com.br/login?erro=x");
  });
});
