import { describe, it, expect } from "vitest";
import { emailNotaEmitida, escaparHtml, urlSegura } from "@/lib/email/resend";

describe("emailNotaEmitida", () => {
  it("monta assunto e corpo com os dados da nota", () => {
    const { assunto, html } = emailNotaEmitida({
      nomeCliente: "Maria",
      nomeEmpresa: "Contabilidade Silva",
      numeroNfse: "12345",
      urlPdf: "https://exemplo.com/nota.pdf",
    });
    expect(assunto).toContain("12345");
    expect(assunto).toContain("Contabilidade Silva");
    expect(html).toContain("Maria");
    expect(html).toContain("Contabilidade Silva");
  });

  it("inclui o botão de PDF quando há url", () => {
    const { html } = emailNotaEmitida({
      nomeCliente: "Maria",
      nomeEmpresa: "Silva",
      numeroNfse: "1",
      urlPdf: "https://exemplo.com/nota.pdf",
    });
    expect(html).toContain("https://exemplo.com/nota.pdf");
    expect(html).toContain("Baixar nota fiscal");
  });

  it("omite o botão quando não há PDF", () => {
    const { html } = emailNotaEmitida({
      nomeCliente: "Maria",
      nomeEmpresa: "Silva",
      numeroNfse: "1",
      urlPdf: null,
    });
    expect(html).not.toContain("Baixar nota fiscal");
  });
});

// ---------------------------------------------------------------------------
// Escape de HTML no template (item M3)
//
// Nome do cliente e razão social vêm do banco, preenchidos por usuário, e o
// e-mail vai para um TERCEIRO — o cliente do nosso cliente. Sem escape, um
// tenant envia HTML arbitrário com o NOSSO remetente.
// ---------------------------------------------------------------------------

describe("escaparHtml", () => {
  it("escapa os cinco caracteres que mudam o significado do HTML", () => {
    expect(escaparHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("escapa o & primeiro, sem duplicar entidades", () => {
    expect(escaparHtml("<a>")).toBe("&lt;a&gt;");
    expect(escaparHtml("&amp;")).toBe("&amp;amp;");
  });

  it("não mexe em texto comum, inclusive acentos", () => {
    expect(escaparHtml("Serviços de consultoria — São Paulo")).toBe(
      "Serviços de consultoria — São Paulo",
    );
  });
});

describe("urlSegura", () => {
  it("aceita http e https", () => {
    expect(urlSegura("https://api.exemplo.com/nota.pdf")).toBe("https://api.exemplo.com/nota.pdf");
    expect(urlSegura("http://api.exemplo.com/nota.pdf")).toBe("http://api.exemplo.com/nota.pdf");
  });

  // Escapar não resolveria: `javascript:` não tem nenhum caractere que o escape
  // de HTML trate. Por isso a checagem é de esquema.
  it("recusa esquemas executáveis", () => {
    expect(urlSegura("javascript:alert(1)")).toBeNull();
    expect(urlSegura("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(urlSegura("vbscript:msgbox(1)")).toBeNull();
  });

  it("recusa vazio, nulo e URL malformada", () => {
    expect(urlSegura(null)).toBeNull();
    expect(urlSegura(undefined)).toBeNull();
    expect(urlSegura("")).toBeNull();
    expect(urlSegura("/relativa/nota.pdf")).toBeNull();
    expect(urlSegura("nem url")).toBeNull();
  });

  it("escapa aspas na URL, que fechariam o atributo href", () => {
    const saida = urlSegura('https://exemplo.com/a"onmouseover="alert(1)');
    expect(saida).not.toBeNull();
    expect(saida).not.toContain('"');
  });
});

describe("emailNotaEmitida", () => {
  const base = {
    nomeCliente: "Cliente",
    nomeEmpresa: "Empresa",
    numeroNfse: "123",
    urlPdf: null,
  };

  it("escapa o nome do cliente no corpo", () => {
    const { html } = emailNotaEmitida({
      ...base,
      nomeCliente: '<img src=x onerror="alert(1)">',
    });

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("escapa a razão social nas duas ocorrências", () => {
    const { html } = emailNotaEmitida({ ...base, nomeEmpresa: "Silva & Souza <b>ME</b>" });

    expect(html).not.toContain("<b>");
    expect(html.match(/Silva &amp; Souza/g)).toHaveLength(2);
  });

  it("escapa o número da nota", () => {
    const { html } = emailNotaEmitida({ ...base, numeroNfse: "1</strong><script>x</script>" });
    expect(html).not.toContain("<script>");
  });

  it("renderiza o botão para URL http(s)", () => {
    const { html } = emailNotaEmitida({ ...base, urlPdf: "https://cdn.exemplo.com/n.pdf" });
    expect(html).toContain('href="https://cdn.exemplo.com/n.pdf"');
  });

  it("OMITE o botão quando a URL é perigosa, em vez de renderizar link quebrado", () => {
    const { html } = emailNotaEmitida({ ...base, urlPdf: "javascript:alert(1)" });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Baixar nota fiscal");
  });

  // O assunto é texto puro no cliente de e-mail: escapar faria aparecer "&amp;"
  // literalmente para o destinatário.
  it("o assunto NÃO leva entidades HTML", () => {
    const { assunto } = emailNotaEmitida({ ...base, nomeEmpresa: "Silva & Souza" });
    expect(assunto).toContain("Silva & Souza");
    expect(assunto).not.toContain("&amp;");
  });
});
