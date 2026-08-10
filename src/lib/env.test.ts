import { describe, it, expect } from "vitest";
import { verificarChavesInngest } from "@/lib/env";

/**
 * /api/inngest não é um endpoint qualquer: é ele que EXECUTA as funções,
 * inclusive a máquina de estados da emissão. A signing key é o que separa
 * "o Inngest pediu" de "alguém pediu".
 *
 * O desfecho perigoso não é a chave faltar e tudo quebrar — é o SDK INFERIR
 * modo de desenvolvimento (deploy sem os sinais de plataforma que ele
 * reconhece) e PULAR a verificação de assinatura em silêncio.
 */
describe("verificarChavesInngest", () => {
  it("em produção, exige as duas chaves", () => {
    expect(() =>
      verificarChavesInngest({ signingKey: "signkey-x", eventKey: "evt-x", ehProducao: true }),
    ).not.toThrow();
  });

  it("em produção, sem signing key, recusa e explica o risco", () => {
    expect(() =>
      verificarChavesInngest({ eventKey: "evt-x", ehProducao: true }),
    ).toThrow(/INNGEST_SIGNING_KEY/);

    expect(() => verificarChavesInngest({ eventKey: "evt-x", ehProducao: true })).toThrow(
      /assinatura|aberto/i,
    );
  });

  it("em produção, sem event key, também recusa", () => {
    expect(() => verificarChavesInngest({ signingKey: "signkey-x", ehProducao: true })).toThrow(
      /INNGEST_EVENT_KEY/,
    );
  });

  it("nomeia as duas quando faltam as duas", () => {
    try {
      verificarChavesInngest({ ehProducao: true });
      throw new Error("deveria ter lançado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      expect(msg).toContain("INNGEST_SIGNING_KEY");
      expect(msg).toContain("INNGEST_EVENT_KEY");
    }
  });

  // Dev Server local não usa nenhuma das duas — exigir aqui só criaria atrito
  // e ensinaria a preencher variável com valor qualquer.
  it("fora de produção, a ausência é o estado normal e passa em silêncio", () => {
    expect(() => verificarChavesInngest({ ehProducao: false })).not.toThrow();
  });

  it("string vazia conta como ausente", () => {
    expect(() =>
      verificarChavesInngest({ signingKey: "", eventKey: "", ehProducao: true }),
    ).toThrow(/INNGEST_SIGNING_KEY/);
  });
});
