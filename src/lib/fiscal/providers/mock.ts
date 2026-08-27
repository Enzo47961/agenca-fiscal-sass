import {
  FiscalErrorTransient,
  type DadosCadastraisEmpresa,
  type EmpresaNoProvider,
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

  /**
   * Cadastro simulado. Existe para que o job de sincronizacao possa ser
   * exercitado de ponta a ponta sem token de provedor real — sem isso, o unico
   * jeito de ver o fluxo funcionar seria em producao, que e exatamente onde nao
   * se descobre defeito de graca.
   *
   * O id e DERIVADO do CNPJ, e nao aleatorio, porque assim `cadastrarEmpresa`
   * seguido de `listarEmpresas` devolve o mesmo identificador — que e a
   * propriedade que a reconciliacao testa.
   */
  async cadastrarEmpresa(params: {
    empresa: DadosCadastraisEmpresa;
    providerEmpresaId?: string | null;
  }): Promise<{ providerEmpresaId: string }> {
    const cnpj = params.empresa.cnpj.replace(/\D/g, "");
    const id = params.providerEmpresaId ?? `mock_emp_${cnpj}`;
    this.cadastradas.set(cnpj, id);
    return { providerEmpresaId: id };
  }

  /**
   * O mock nao tem estado entre processos: em producao a lista viria do
   * provedor. Aqui devolve o que foi cadastrado nesta instancia, o que basta
   * para exercitar o caminho de reconciliacao em teste.
   */
  async listarEmpresas(): Promise<EmpresaNoProvider[]> {
    return Array.from(this.cadastradas, ([cnpj, providerEmpresaId]) => ({
      cnpj,
      providerEmpresaId,
    }));
  }

  private readonly cadastradas = new Map<string, string>();
}
