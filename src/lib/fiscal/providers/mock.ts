import {
  FiscalErrorTransient,
  type EmitirNfseInput,
  type CancelarNfseResult,
  type EmitirNfseResult,
  type FiscalProvider,
} from "../provider";

/**
 * Provider de desenvolvimento/teste. Simula latência e instabilidade
 * de prefeitura para exercitar o motor de retry localmente.
 */
export class MockFiscalProvider implements FiscalProvider {
  readonly nome = "mock";

  /** Taxa de falha transiente simulada (0 a 1). Configurável por env. */
  private readonly taxaFalha = Number(process.env.MOCK_FISCAL_TAXA_FALHA ?? "0.3");

  async emitir(input: EmitirNfseInput): Promise<EmitirNfseResult> {
    await new Promise((r) => setTimeout(r, 300));

    if (Math.random() < this.taxaFalha) {
      throw new FiscalErrorTransient(
        "Prefeitura indisponível (simulado pelo MockFiscalProvider)",
        "E504",
        { simulado: true, referencia: input.referenciaExterna },
      );
    }

    return {
      numeroNfse: String(Math.floor(Math.random() * 1_000_000)),
      codigoVerificacao: input.referenciaExterna.slice(0, 8).toUpperCase(),
      providerId: `mock_${input.referenciaExterna}`,
      urlPdf: null,
      urlXml: null,
    };
  }

  async consultarPorReferencia(): Promise<EmitirNfseResult | null> {
    return null; // mock nunca tem emissão pendente do outro lado
  }

  /**
   * Cancelamento simulado: sempre aceita. O mock existe para exercitar o FLUXO,
   * e recusar aqui esconderia o caminho feliz de quem esta testando. Nao ha XML
   * porque nao houve documento — o painel entao nao mostra link, que e o
   * comportamento correto para nota sem validade juridica.
   */
  async cancelar(): Promise<CancelarNfseResult> {
    return { urlXmlCancelamento: null };
  }
}
