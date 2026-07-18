import { describe, it, expect } from "vitest";
import { emailNotaEmitida } from "@/lib/email/resend";

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
