import { z } from "zod";
import {
  FiscalErrorPermanent,
  FiscalErrorTransient,
  type DadosCadastraisEmpresa,
  type EmitirNfseInput,
  type EmpresaNoProvider,
  type CancelarNfseInput,
  type CancelarNfseResult,
  type EmitirNfseResult,
  type FiscalProvider,
} from "../provider";
import { OP_SIMP_NAC, REG_AP_IBSCBS_SN, validarDeclaracao } from "../ibscbs";
import { type DocumentoAjusteBase } from "../ajuste-base";

/**
 * Provider fiscal Focus NFe (regra 21 do CLAUDE.md).
 *
 * Docs: https://doc.focusnfe.com.br  ·  Endpoints usados:
 *   POST   /v2/nfse?ref=REF   → envia a nota (assíncrono)
 *   GET    /v2/nfse/REF       → consulta o resultado
 *
 * MODELO ASSÍNCRONO — importante para entender o desenho abaixo:
 * o POST só confirma o RECEBIMENTO (`status: processando_autorizacao`); a
 * autorização real da prefeitura chega depois. Este provider resolve isso
 * SEM tocar no motor de retry (`src/inngest/functions/emitir-nfse.ts`):
 *
 *   1. `emitir()` faz o POST e, se voltar `processando_autorizacao`, faz um
 *      polling CURTO e limitado (padrão: 5 tentativas × 2 s) — na prática a
 *      maioria das notas autoriza nessa janela.
 *   2. Se ainda estiver processando ao fim do polling curto, lança
 *      `FiscalErrorTransient`. O motor então agenda o retry do produto
 *      (5 min → 15 min → 1 h, regra 9) e, na tentativa seguinte, chama
 *      `consultarPorReferencia()` ANTES de reemitir (regra 7) — que devolve
 *      a nota já autorizada. Nenhuma nota duplicada é criada na prefeitura.
 *
 * IDEMPOTÊNCIA (regra 7): a `referenciaExterna` da nota é usada como `ref` da
 * Focus, que é única por empresa. Se o POST for rejeitado por referência
 * duplicada (tentativa anterior morreu depois de enviar), caímos na consulta
 * em vez de tratar como erro.
 *
 * CLASSIFICAÇÃO DE ERROS (regra 8): 4xx de validação e rejeição da prefeitura
 * são PERMANENTES; 429, 5xx, timeout e falha de rede são TRANSIENTES. Nunca
 * lançamos erro genérico daqui.
 */

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export type FocusNfeAmbiente = "homologacao" | "producao";

const BASE_URL: Record<FocusNfeAmbiente, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

export interface FocusNfeConfig {
  token: string;
  ambiente: FocusNfeAmbiente;
  /** Timeout de cada request HTTP. */
  timeoutMs?: number;
  /** Polling curto dentro de emitir(): quantas consultas antes de desistir. */
  tentativasPolling?: number;
  /** Intervalo entre as consultas do polling curto. */
  intervaloPollingMs?: number;
  /** Injetável para teste (default: fetch global). */
  fetchImpl?: typeof fetch;
  /** Injetável para teste (default: setTimeout). */
  esperar?: (ms: number) => Promise<void>;
  /**
   * Carrega os cClassTrib válidos da tabela de domínio nacional. Injetado como
   * FUNÇÃO de propósito: o provider é camada de integração fiscal e não deve
   * conhecer o banco (regra 2). Quem compõe é o motor Inngest, que já tem o
   * client admin. Sem o carregador, a validação continua estrutural — CST,
   * prefixo e subgrupos condicionais —, mas não confere a EXISTÊNCIA do código.
   */
  carregarCClassTribConhecidos?: () => Promise<ReadonlySet<string>>;
}

// ---------------------------------------------------------------------------
// Contrato de resposta da Focus NFe (regra 19: Zod na fronteira)
// ---------------------------------------------------------------------------

const erroFocusSchema = z.object({
  codigo: z.string().nullish(),
  mensagem: z.string().nullish(),
  correcao: z.string().nullish(),
});

const nfseFocusSchema = z.object({
  status: z.string().nullish(),
  status_sefaz: z.string().nullish(),
  mensagem_sefaz: z.string().nullish(),
  numero: z.union([z.string(), z.number()]).nullish(),
  codigo_verificacao: z.union([z.string(), z.number()]).nullish(),
  ref: z.string().nullish(),
  url: z.string().nullish(),
  caminho_xml_nota_fiscal: z.string().nullish(),
  caminho_danfse: z.string().nullish(),
  /** Devolvido no cancelamento bem-sucedido. */
  caminho_xml_cancelamento: z.string().nullish(),
  /** Presente nos corpos de erro (400/401/404/422). */
  codigo: z.string().nullish(),
  mensagem: z.string().nullish(),
  erros: z.array(erroFocusSchema).nullish(),
});

type NfseFocus = z.infer<typeof nfseFocusSchema>;

/**
 * Resposta do recurso `/v2/empresas`. `passthrough` porque a Focus devolve
 * dezenas de campos de cadastro e só nos interessam estes — recusar o corpo
 * inteiro por causa de um campo novo seria pior que ignorá-lo.
 */
const empresaFocusSchema = z
  .object({
    id: z.union([z.string(), z.number()]).nullish(),
    certificado_valido_de: z.string().nullish(),
    certificado_valido_ate: z.string().nullish(),
    certificado_cnpj: z.string().nullish(),
    mensagem: z.string().nullish(),
    erro: z.string().nullish(),
  })
  .passthrough();

/**
 * Empresa como vem na LISTAGEM. `cnpj` é nullish porque a Focus cadastra também
 * pessoa física (campo `cpf`), e essas linhas simplesmente não interessam à
 * reconciliação — filtramos em vez de rejeitar a página inteira.
 */
const empresaListadaSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    cnpj: z.string().nullish(),
  })
  .passthrough();

const listaEmpresasSchema = z.array(empresaListadaSchema);

/** Status terminais/possíveis documentados pela Focus NFe. */
/** A Focus devolve no máximo 50 empresas por página (documentação oficial). */
const PAGINA_EMPRESAS = 50;
/** 200 páginas = 10.000 empresas. Muito além da realidade; ver `listarEmpresas`. */
const MAX_PAGINAS_EMPRESAS = 200;

const STATUS_AUTORIZADO = "autorizado";
const STATUS_PROCESSANDO = "processando_autorizacao";
const STATUS_ERRO = "erro_autorizacao";
const STATUS_CANCELADO = "cancelado";

// ---------------------------------------------------------------------------
// Helpers puros (exportados para teste)
// ---------------------------------------------------------------------------

/** Centavos → string decimal em reais, como a Focus espera ("1234.56"). */
export function centavosParaReais(centavos: number): string {
  if (!Number.isInteger(centavos)) {
    throw new FiscalErrorPermanent(`Valor deve ser inteiro em centavos, recebido ${centavos}`);
  }
  return (centavos / 100).toFixed(2);
}

/**
 * Alíquota de ISS: no nosso schema é FRAÇÃO (NUMERIC(5,4), 0.02 = 2%); a Focus
 * espera PERCENTUAL na maioria dos municípios (o exemplo oficial de São Paulo
 * usa "aliquota": "5" para 5%).
 *
 * VERIFICAR EM HOMOLOGAÇÃO antes de produção: alguns municípios integrados à
 * Focus aceitam/exigem a fração. Se o município de teste rejeitar o valor
 * (ou autorizar com ISS errado), é AQUI que se corrige — está isolado de
 * propósito e coberto por teste.
 */
export function aliquotaIssParaPercentual(fracao: number): string {
  return (fracao * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

/** Monta a URL absoluta a partir do caminho relativo devolvido pela Focus. */
export function urlAbsoluta(base: string, caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  if (caminho.startsWith("http://") || caminho.startsWith("https://")) return caminho;
  return `${base}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
}

/** Junta os erros da Focus numa mensagem única legível para o log de tentativas. */
export function mensagemDeErro(corpo: NfseFocus, fallback: string): string {
  const doArray = (corpo.erros ?? [])
    .map((e) => [e.codigo, e.mensagem, e.correcao].filter(Boolean).join(" — "))
    .filter((s) => s.length > 0);
  if (doArray.length > 0) return doArray.join(" | ");

  const direto = [corpo.mensagem, corpo.mensagem_sefaz].filter(Boolean).join(" — ");
  return direto.length > 0 ? direto : fallback;
}

/**
 * Classificação de erro por status HTTP (regra 8).
 * Transiente = vale a pena tentar de novo mais tarde.
 */
export function ehTransiente(statusHttp: number): boolean {
  if (statusHttp === 429) return true; // rate limit
  if (statusHttp === 408) return true; // request timeout
  return statusHttp >= 500; // indisponibilidade da Focus/prefeitura
}

/**
 * Traduz o regime tributário do NOSSO domínio para o CRT que a Focus espera.
 *
 * POR QUE ISTO EXISTE. O campo `regime_tributario` da API de empresas da Focus
 * é o CRT (Código de Regime Tributário) do leiaute fiscal, e ele é NUMÉRICO:
 *
 *   1 = Simples Nacional
 *   2 = Simples Nacional, excesso de sublimite de receita bruta
 *   3 = Regime Normal
 *   4 = MEI
 *
 * Do nosso lado, `empresas.regime_tributario` é TEXT e guarda vocabulário de
 * negócio ("simples_nacional", "mei", "lucro_presumido", "lucro_real"). Até
 * 26/08/2026 a string crua ia direto no payload. O defeito nunca apareceu
 * porque o cadastro de empresa jamais foi exercido contra a API real — o token
 * nunca esteve em produção — e não havia teste cobrindo `enviarCertificado`.
 *
 * LUCRO PRESUMIDO E LUCRO REAL CAEM AMBOS EM 3, e isso não é perda de
 * informação: o CRT descreve a posição perante o SIMPLES, não a forma de
 * apuração do IRPJ. Quem não é optante nem MEI está no regime normal.
 *
 * O 2 NÃO É EMITIDO POR NÓS. "Excesso de sublimite" é condição apurada durante
 * o ano-calendário, não regime escolhido no cadastro, e o domínio não a
 * representa. Se um dia representar, é aqui que entra.
 *
 * DESCONHECIDO FALHA FECHADO. Um valor novo na coluna — migration futura, dado
 * importado torto — não pode virar cadastro com CRT errado: o CRT incorreto
 * distorce a tributação de TODA nota emitida por aquele CNPJ, e o erro seria
 * descoberto na escrituração, não aqui. Recusar e nomear o valor ofensor é mais
 * barato que qualquer palpite.
 */
const CRT_DA_FOCUS: Readonly<Record<string, number>> = {
  simples_nacional: 1,
  mei: 4,
  lucro_presumido: 3,
  lucro_real: 3,
};

export function crtDaFocus(regimeTributario: string): number {
  const crt = CRT_DA_FOCUS[regimeTributario];
  if (crt === undefined) {
    throw new FiscalErrorPermanent(
      `Regime tributário "${regimeTributario}" não tem correspondente no CRT da ` +
        `Focus NFe. Aceitos: ${Object.keys(CRT_DA_FOCUS).join(", ")}.`,
      "regime_tributario_desconhecido",
    );
  }
  return crt;
}

/**
 * Monta o corpo do cadastro de empresa. COMPARTILHADO de propósito entre criar
 * com certificado e criar sem — os dois caminhos gravam a mesma empresa, e
 * deixá-los montar o payload separadamente é como o defeito do CRT nasceria de
 * novo, agora em dose dupla.
 *
 * `inscricao_municipal` vai como `undefined` quando ausente, e não como null:
 * empresa sem IM ainda pode ser CADASTRADA (a IM é exigida na emissão), e
 * mandar null explicitamente arriscaria sobrescrever com vazio um valor que já
 * exista do outro lado num PUT.
 */
export function montarPayloadEmpresa(empresa: DadosCadastraisEmpresa): Record<string, unknown> {
  return {
    nome: empresa.razaoSocial,
    cnpj: empresa.cnpj,
    inscricao_municipal: empresa.inscricaoMunicipal ?? undefined,
    codigo_municipio: empresa.codigoMunicipioIbge,
    email: empresa.emailContato,
    regime_tributario: crtDaFocus(empresa.regimeTributario),
    // Sem esta flag a empresa fica CADASTRADA mas não HABILITADA para NFS-e, e
    // a descoberta viria na primeira emissão — longe daqui e com a nota já
    // criada. Nosso produto é NFS-e: toda empresa que cadastramos existe para
    // isso, então não há caso em que seja false.
    habilita_nfse: true,
  };
}

/** Só os dígitos — a Focus ignora formatação, então normalizamos dos dois lados. */
export function digitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Segundos até o contador de créditos da Focus reiniciar.
 *
 * A API concede 100 créditos por minuto por token e devolve `Rate-Limit-Reset`
 * junto do HTTP 429. Sem ler esse cabeçalho, o backoff padrão esperaria 5
 * minutos onde a própria API está dizendo que 20 segundos bastam — e numa carga
 * de centenas de empresas essa diferença é a distância entre minutos e horas.
 */
export function segundosAteResetar(resposta: { headers?: Headers }): number | null {
  const bruto = resposta.headers?.get?.("Rate-Limit-Reset");
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class FocusNfeProvider implements FiscalProvider {
  readonly nome = "focusnfe";

  private readonly base: string;
  private readonly autorizacao: string;
  private readonly timeoutMs: number;
  private readonly tentativasPolling: number;
  private readonly intervaloPollingMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly esperar: (ms: number) => Promise<void>;
  private readonly carregarCClassTribConhecidos:
    | (() => Promise<ReadonlySet<string>>)
    | null;

  constructor(cfg: FocusNfeConfig) {
    if (!cfg.token) {
      throw new FiscalErrorPermanent(
        "FOCUSNFE_TOKEN não configurado — defina a variável de ambiente antes de usar o provider focusnfe",
      );
    }
    this.base = BASE_URL[cfg.ambiente];
    // Basic auth: token como usuário, senha vazia (padrão da Focus NFe).
    this.autorizacao = `Basic ${Buffer.from(`${cfg.token}:`).toString("base64")}`;
    this.timeoutMs = cfg.timeoutMs ?? 20_000;
    this.tentativasPolling = cfg.tentativasPolling ?? 5;
    this.intervaloPollingMs = cfg.intervaloPollingMs ?? 2_000;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.esperar = cfg.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.carregarCClassTribConhecidos = cfg.carregarCClassTribConhecidos ?? null;
  }

  // -------------------------------------------------------------------------
  // FiscalProvider
  // -------------------------------------------------------------------------

  async emitir(input: EmitirNfseInput): Promise<EmitirNfseResult> {
    const ref = input.referenciaExterna;

    await this.validarGrupoIbsCbs(input);

    const envio = await this.requisitar("POST", `/v2/nfse?ref=${encodeURIComponent(ref)}`, {
      corpo: this.montarPayload(input),
    });

    // Referência já usada: uma tentativa anterior enviou e morreu antes de
    // confirmar. NÃO é erro — é exatamente o caso que a idempotência cobre.
    if (envio.statusHttp === 422 && this.pareceReferenciaDuplicada(envio.corpo)) {
      const existente = await this.consultarPorReferencia(ref);
      if (existente) return existente;
      return this.aguardarAutorizacao(ref);
    }

    if (envio.statusHttp >= 400) {
      throw this.erroDeResposta(envio.statusHttp, envio.corpo, `Focus NFe recusou o envio da nota`);
    }

    const resultado = this.interpretar(envio.corpo, ref);
    if (resultado) return resultado;

    // Ainda processando: polling curto e, se não resolver, transiente.
    return this.aguardarAutorizacao(ref);
  }

  async consultarPorReferencia(referenciaExterna: string): Promise<EmitirNfseResult | null> {
    const resp = await this.requisitar(
      "GET",
      `/v2/nfse/${encodeURIComponent(referenciaExterna)}`,
    );

    // Nunca enviada (ou já expurgada): o motor segue e emite normalmente.
    if (resp.statusHttp === 404) return null;

    if (resp.statusHttp >= 400) {
      throw this.erroDeResposta(
        resp.statusHttp,
        resp.corpo,
        `Focus NFe falhou ao consultar a referência ${referenciaExterna}`,
      );
    }

    return this.interpretar(resp.corpo, referenciaExterna);
  }

  /**
   * Cancela a NFS-e. `DELETE /v2/nfse/{referencia}` com a justificativa no corpo.
   *
   * A CHAMADA É SÍNCRONA no provider: ele fala com a prefeitura na hora e
   * responde `cancelado` ou `erro_cancelamento` na mesma requisição. Quem torna
   * o fluxo assíncrono é o motor Inngest, do nosso lado, para ter retry — e
   * cancelamento tem prazo, então falhar por indisponibilidade sem insistir é
   * caro.
   *
   * NÃO VALIDAMOS PRAZO AQUI. Ele é municipal (DF até o dia 15 do mês seguinte,
   * Recife 60 dias, Jundiaí veda após 180) e não temos como conhecer a regra de
   * cada município. A prefeitura responde, e a recusa vira erro PERMANENTE com
   * a mensagem original — insistir contra prazo vencido só queima tentativa.
   */
  async cancelar(input: CancelarNfseInput): Promise<CancelarNfseResult> {
    const resp = await this.requisitar(
      "DELETE",
      `/v2/nfse/${encodeURIComponent(input.referenciaExterna)}`,
      { corpo: { justificativa: input.justificativa } },
    );

    if (resp.statusHttp >= 400) {
      throw this.erroDeResposta(
        resp.statusHttp,
        resp.corpo,
        `Focus NFe recusou o cancelamento da nota ${input.referenciaExterna}`,
      );
    }

    // Prefeitura devolve erro em HTTP 200 (armadilha conhecida do CLAUDE.md):
    // o status do CORPO é quem manda.
    const status = resp.corpo.status;
    if (status === "erro_cancelamento") {
      throw new FiscalErrorPermanent(
        mensagemDeErro(resp.corpo, "A prefeitura recusou o cancelamento."),
        resp.corpo.codigo ?? "erro_cancelamento",
        resp.corpo,
      );
    }
    if (status !== "cancelado") {
      // Estado inesperado: transiente de propósito. Pode ser processamento em
      // curso, e tratar como permanente encerraria o cancelamento cedo demais.
      throw new FiscalErrorTransient(
        `Focus NFe devolveu status "${String(status)}" ao cancelar — ainda não confirmado.`,
        String(status ?? "sem-status"),
        resp.corpo,
      );
    }

    return {
      urlXmlCancelamento: urlAbsoluta(this.base, resp.corpo.caminho_xml_cancelamento ?? null),
    };
  }

  /**
   * Cadastra ou atualiza a empresa na Focus, enviando o certificado A1.
   *
   * `POST /v2/empresas` cria; `PUT /v2/empresas/{id}` atualiza e TROCA o
   * certificado — confirmado na referência de campos deles em 12/08/2026. O
   * retorno traz `certificado_valido_ate`, que é o que permite avisar o
   * usuário antes do vencimento em vez de descobrir na nota rejeitada.
   *
   * O CERTIFICADO NÃO É LOGADO NEM DEVOLVIDO. A mensagem de erro carrega o
   * corpo da resposta da Focus, nunca o do envio: `arquivo_certificado_base64`
   * num log de erro seria exatamente o vazamento que este desenho evita.
   */
  async enviarCertificado(params: {
    empresa: {
      cnpj: string;
      razaoSocial: string;
      inscricaoMunicipal: string | null;
      codigoMunicipioIbge: string;
      emailContato: string;
      regimeTributario: string;
    };
    certificado: { arquivo: Buffer; senha: string };
    providerEmpresaId?: string | null;
  }): Promise<{
    providerEmpresaId: string;
    validoAte: string | null;
    validoDe: string | null;
    cnpjDoCertificado: string | null;
  }> {
    const { empresa, certificado, providerEmpresaId } = params;
    const atualizando = Boolean(providerEmpresaId);

    const resp = await this.requisitarEmpresa(
      atualizando ? "PUT" : "POST",
      atualizando ? `/v2/empresas/${providerEmpresaId}` : "/v2/empresas",
      {
        ...montarPayloadEmpresa(empresa),
        arquivo_certificado_base64: certificado.arquivo.toString("base64"),
        senha_certificado: certificado.senha,
      },
    );

    if (resp.statusHttp >= 400) {
      const msg = resp.corpo.mensagem ?? resp.corpo.erro ?? "erro não detalhado";
      // Senha errada, certificado vencido e CNPJ divergente sao PERMANENTES:
      // repetir com o mesmo arquivo da o mesmo resultado.
      throw ehTransiente(resp.statusHttp)
        ? new FiscalErrorTransient(`Focus recusou o certificado: ${msg}`, String(resp.statusHttp))
        : new FiscalErrorPermanent(`Focus recusou o certificado: ${msg}`, String(resp.statusHttp));
    }

    if (!resp.corpo.id) {
      throw new FiscalErrorPermanent(
        "Focus aceitou o envio mas não devolveu o id da empresa — sem ele não dá " +
          "para trocar o certificado depois.",
      );
    }

    return {
      providerEmpresaId: String(resp.corpo.id),
      validoAte: resp.corpo.certificado_valido_ate ?? null,
      validoDe: resp.corpo.certificado_valido_de ?? null,
      cnpjDoCertificado: resp.corpo.certificado_cnpj ?? null,
    };
  }

  /**
   * Cadastra a empresa SEM certificado. Ver o contrato em `FiscalProvider`.
   *
   * A recusa aqui é quase sempre dado cadastral — município não atendido, IM em
   * formato inválido, CNPJ já existente. Todas permanentes: repetir com os
   * mesmos dados dá o mesmo resultado, e queimar tentativa só atrasa a
   * descoberta de que alguém precisa corrigir a planilha.
   */
  async cadastrarEmpresa(params: {
    empresa: DadosCadastraisEmpresa;
    providerEmpresaId?: string | null;
  }): Promise<{ providerEmpresaId: string }> {
    const atualizando = Boolean(params.providerEmpresaId);

    const resp = await this.requisitarEmpresa(
      atualizando ? "PUT" : "POST",
      atualizando ? `/v2/empresas/${params.providerEmpresaId}` : "/v2/empresas",
      montarPayloadEmpresa(params.empresa),
    );

    if (resp.statusHttp >= 400) {
      const msg = resp.corpo.mensagem ?? resp.corpo.erro ?? "erro não detalhado";
      throw ehTransiente(resp.statusHttp)
        ? new FiscalErrorTransient(`Focus recusou o cadastro da empresa: ${msg}`, String(resp.statusHttp), {
            resetSegundos: resp.resetSegundos,
          })
        : new FiscalErrorPermanent(
            `Focus recusou o cadastro da empresa: ${msg}`,
            String(resp.statusHttp),
          );
    }

    if (!resp.corpo.id) {
      throw new FiscalErrorPermanent(
        "Focus aceitou o cadastro mas não devolveu o id da empresa — sem ele não " +
          "dá para enviar o certificado nem atualizar os dados depois.",
      );
    }

    return { providerEmpresaId: String(resp.corpo.id) };
  }

  /**
   * Lista TODAS as empresas da conta, paginando de 50 em 50.
   *
   * O TETO DE PÁGINAS NÃO É DEFENSIVISMO VAZIO. Se a paginação nunca terminasse
   * — mudança de contrato, resposta repetida —, o laço rodaria para sempre
   * gastando créditos. E truncar em silêncio seria pior que falhar: um mapa
   * incompleto faria o job concluir que empresas já cadastradas não existem, e
   * criá-las de novo. Duplicata no provider é o dano que esta função existe
   * para evitar, então ela prefere estourar a entregar meia verdade.
   */
  async listarEmpresas(): Promise<EmpresaNoProvider[]> {
    const empresas: EmpresaNoProvider[] = [];
    let offset = 0;

    for (let pagina = 0; pagina < MAX_PAGINAS_EMPRESAS; pagina++) {
      const lote = await this.listarPaginaDeEmpresas(offset);
      empresas.push(...lote);
      if (lote.length < PAGINA_EMPRESAS) return empresas;
      offset += PAGINA_EMPRESAS;
    }

    throw new FiscalErrorPermanent(
      `A listagem de empresas da Focus passou de ${MAX_PAGINAS_EMPRESAS} páginas sem ` +
        "terminar. Reconciliar com mapa incompleto criaria empresas duplicadas.",
      "paginacao_sem_fim",
    );
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /**
   * Traduz o corpo da Focus no resultado do nosso domínio.
   * - `autorizado`            → resultado
   * - `processando_autorizacao` → null (ainda não deu; quem chama decide)
   * - `erro_autorizacao`      → FiscalErrorPermanent (rejeição da prefeitura)
   * - `cancelado`             → FiscalErrorPermanent (não é emissão válida)
   */
  private interpretar(corpo: NfseFocus, ref: string): EmitirNfseResult | null {
    const status = corpo.status ?? null;

    if (status === STATUS_AUTORIZADO) {
      const numero = corpo.numero;
      if (numero === null || numero === undefined || String(numero).length === 0) {
        // Autorizado sem número é resposta incoerente da API — não inventamos
        // número de nota fiscal. Transiente: uma nova consulta costuma resolver.
        throw new FiscalErrorTransient(
          `Focus NFe devolveu status autorizado sem número para a referência ${ref}`,
          "resposta_incompleta",
          corpo,
        );
      }
      return {
        numeroNfse: String(numero),
        codigoVerificacao:
          corpo.codigo_verificacao === null || corpo.codigo_verificacao === undefined
            ? null
            : String(corpo.codigo_verificacao),
        providerId: `focusnfe_${ref}`,
        urlPdf: urlAbsoluta(this.base, corpo.caminho_danfse) ?? corpo.url ?? null,
        urlXml: urlAbsoluta(this.base, corpo.caminho_xml_nota_fiscal),
      };
    }

    if (status === STATUS_ERRO) {
      throw new FiscalErrorPermanent(
        mensagemDeErro(corpo, `Prefeitura rejeitou a nota (referência ${ref})`),
        corpo.status_sefaz ?? STATUS_ERRO,
        corpo,
      );
    }

    if (status === STATUS_CANCELADO) {
      throw new FiscalErrorPermanent(
        `Nota da referência ${ref} está cancelada na Focus NFe — não pode ser tratada como emitida`,
        STATUS_CANCELADO,
        corpo,
      );
    }

    if (status === STATUS_PROCESSANDO || status === null) return null;

    // Status desconhecido: não assumimos nada (regra 8 — nada de "assumir
    // transiente silenciosamente"); é transiente MAS com código explícito
    // para aparecer no log de tentativas e ser investigado.
    throw new FiscalErrorTransient(
      `Status não reconhecido da Focus NFe: "${status}" (referência ${ref})`,
      "status_desconhecido",
      corpo,
    );
  }

  /** Polling curto: resolve o caso comum (autoriza em segundos) sem retry longo. */
  private async aguardarAutorizacao(ref: string): Promise<EmitirNfseResult> {
    for (let i = 0; i < this.tentativasPolling; i++) {
      await this.esperar(this.intervaloPollingMs);
      const resultado = await this.consultarPorReferencia(ref);
      if (resultado) return resultado;
    }

    // Transiente de propósito: devolve o controle ao backoff do produto
    // (5 min → 15 min → 1 h). A próxima tentativa começa pela consulta.
    throw new FiscalErrorTransient(
      `Focus NFe ainda processando a autorização da referência ${ref} — nova consulta no próximo retry`,
      STATUS_PROCESSANDO,
      { ref },
    );
  }

  private pareceReferenciaDuplicada(corpo: NfseFocus): boolean {
    const texto = `${corpo.codigo ?? ""} ${corpo.mensagem ?? ""}`.toLowerCase();
    return texto.includes("duplicad") || texto.includes("ja existe") || texto.includes("já existe");
  }

  private erroDeResposta(statusHttp: number, corpo: NfseFocus, fallback: string) {
    const mensagem = `${mensagemDeErro(corpo, fallback)} (HTTP ${statusHttp})`;
    const codigo = corpo.codigo ?? String(statusHttp);
    return ehTransiente(statusHttp)
      ? new FiscalErrorTransient(mensagem, codigo, corpo)
      : new FiscalErrorPermanent(mensagem, codigo, corpo);
  }

  private async requisitar(
    metodo: "GET" | "POST" | "DELETE",
    caminho: string,
    opts?: { corpo?: unknown },
  ): Promise<{ statusHttp: number; corpo: NfseFocus }> {
    let resposta: Response;
    try {
      resposta = await this.fetchImpl(`${this.base}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: this.autorizacao,
          "Content-Type": "application/json",
        },
        body: opts?.corpo === undefined ? undefined : JSON.stringify(opts.corpo),
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch (e) {
      // Timeout / DNS / conexão recusada — sempre transiente (regra 8).
      throw new FiscalErrorTransient(
        `Falha de rede ao chamar a Focus NFe (${metodo} ${caminho}): ${
          e instanceof Error ? e.message : String(e)
        }`,
        "rede",
        null,
      );
    }

    const bruto: unknown = await resposta.json().catch(() => ({}));
    const parse = nfseFocusSchema.safeParse(bruto);
    if (!parse.success) {
      // Corpo fora do contrato: transiente (pode ser página de erro/manutenção
      // servida pelo proxy da Focus), mas com o payload bruto preservado.
      throw new FiscalErrorTransient(
        `Resposta da Focus NFe fora do formato esperado (HTTP ${resposta.status})`,
        "contrato_invalido",
        bruto,
      );
    }

    return { statusHttp: resposta.status, corpo: parse.data };
  }

  /**
   * Irmã de `requisitar()` para o recurso `/v2/empresas`, que tem contrato de
   * resposta próprio.
   *
   * Separada de propósito, e não generalizada com um tipo genérico: o payload
   * que passa por aqui carrega o certificado, e a única regra que não pode ser
   * quebrada nesta função é NÃO INCLUIR O CORPO ENVIADO em nenhuma mensagem de
   * erro. Uma função compartilhada com `requisitar()` — que hoje devolve o
   * `bruto` no erro de contrato — herdaria esse comportamento por acidente.
   */
  private async requisitarEmpresa(
    metodo: "POST" | "PUT",
    caminho: string,
    corpo: Record<string, unknown>,
  ): Promise<{
    statusHttp: number;
    corpo: z.infer<typeof empresaFocusSchema>;
    resetSegundos: number | null;
  }> {
    let resposta: Response;
    try {
      resposta = await this.fetchImpl(`${this.base}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: this.autorizacao,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch (e) {
      throw new FiscalErrorTransient(
        `Falha de rede ao chamar a Focus NFe (${metodo} ${caminho}): ${
          e instanceof Error ? e.message : String(e)
        }`,
        "rede",
        // `null` e não o corpo: ele contém o certificado.
        null,
      );
    }

    const bruto: unknown = await resposta.json().catch(() => ({}));
    const parse = empresaFocusSchema.safeParse(bruto);
    if (!parse.success) {
      throw new FiscalErrorTransient(
        `Resposta da Focus NFe fora do formato esperado (HTTP ${resposta.status})`,
        "contrato_invalido",
        null,
      );
    }

    return {
      statusHttp: resposta.status,
      corpo: parse.data,
      resetSegundos: segundosAteResetar(resposta),
    };
  }

  /**
   * Uma página da listagem de empresas. A Focus devolve até 50 por página e usa
   * `offset` como deslocamento.
   */
  private async listarPaginaDeEmpresas(offset: number): Promise<EmpresaNoProvider[]> {
    const caminho = `/v2/empresas?offset=${offset}`;
    let resposta: Response;
    try {
      resposta = await this.fetchImpl(`${this.base}${caminho}`, {
        method: "GET",
        headers: { Authorization: this.autorizacao },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch (e) {
      throw new FiscalErrorTransient(
        `Falha de rede ao listar empresas na Focus NFe: ${
          e instanceof Error ? e.message : String(e)
        }`,
        "rede",
        null,
      );
    }

    if (resposta.status >= 400) {
      const detalhe = `HTTP ${resposta.status}`;
      if (ehTransiente(resposta.status)) {
        throw new FiscalErrorTransient(`Focus recusou a listagem de empresas: ${detalhe}`, String(resposta.status), {
          resetSegundos: segundosAteResetar(resposta),
        });
      }
      throw new FiscalErrorPermanent(
        `Focus recusou a listagem de empresas: ${detalhe}`,
        String(resposta.status),
      );
    }

    const bruto: unknown = await resposta.json().catch(() => null);
    const parse = listaEmpresasSchema.safeParse(bruto);
    if (!parse.success) {
      throw new FiscalErrorTransient(
        "Listagem de empresas da Focus NFe fora do formato esperado",
        "contrato_invalido",
        null,
      );
    }

    // Linhas de pessoa física (sem CNPJ) não participam da reconciliação.
    return parse.data
      .filter((e): e is typeof e & { cnpj: string } => typeof e.cnpj === "string" && e.cnpj.length > 0)
      .map((e) => ({ providerEmpresaId: String(e.id), cnpj: digitos(e.cnpj) }));
  }

  /**
   * Valida o grupo IBSCBS antes de qualquer coisa sair para a prefeitura.
   *
   * Quando há carregador injetado, a validação passa a conferir também a
   * EXISTÊNCIA do cClassTrib na tabela de domínio oficial (164 códigos) — é a
   * trava que impede declarar um enquadramento inventado.
   *
   * Se o carregador falhar (banco fora do ar, tabela não semeada), o erro é
   * TRANSIENTE: é problema de infraestrutura nossa, não da declaração. Deixar
   * passar sem conferir seria pior — emitiria com enquadramento não verificado.
   */
  private async validarGrupoIbsCbs(input: EmitirNfseInput): Promise<void> {
    const declaracao = input.servico.reforma.declaracao ?? null;
    if (!declaracao) return;

    let conhecidos: ReadonlySet<string> | undefined;
    if (this.carregarCClassTribConhecidos) {
      try {
        conhecidos = await this.carregarCClassTribConhecidos();
      } catch (e) {
        throw new FiscalErrorTransient(
          `Não foi possível carregar a tabela de domínio cClassTrib: ${
            e instanceof Error ? e.message : String(e)
          }`,
          "dominio_indisponivel",
          null,
        );
      }
    }

    // Falha fechada: CST/cClassTrib incoerentes são erro de enquadramento
    // fiscal, não instabilidade. Retry não conserta — erro PERMANENTE
    // (regra 8), e a nota nem chega a ser enviada à prefeitura.
    const validacao = validarDeclaracao(declaracao, { cClassTribConhecidos: conhecidos });
    if (!validacao.valido) {
      throw new FiscalErrorPermanent(
        `Grupo IBSCBS inválido: ${validacao.erros.join("; ")}`,
        "ibscbs_invalido",
        declaracao,
      );
    }
  }

  /**
   * Traduz o nosso `EmitirNfseInput` no JSON da Focus NFe.
   *
   * GRUPO IBSCBS: quando `servico.reforma.declaracao` está preenchida, vão o
   * CST e o cClassTrib em campos SEPARADOS. A versão anterior mandava só o
   * cClassTrib, com a justificativa de que os 3 primeiros dígitos já são o CST
   * e de que a Focus não expunha campo próprio — a segunda metade estava
   * errada: `ibs_cbs_situacao_tributaria` existe, e o leiaute do Anexo VI trata
   * CST e cClassTrib como dois campos `1-1` distintos na DPS.
   *
   * O vBC NÃO É ENVIADO, e isso está correto. No Anexo VI o campo mora em
   * `NFSe/infNFSe/IBSCBS/valores/vBC` — lado NFS-e, CALCULADO pelo Ambiente de
   * Dados Nacional a partir do que a DPS declara. A DPS envia os componentes:
   * `vServ` (1-1) e `vDescIncond` (0-1). Empurrar um vBC pronto seria mandar
   * conta feita para quem faz a conta, e divergência ali é rejeição. O nosso
   * `baseCalculo` continua valendo como prévia na tela e como base de
   * conferência contra o que o ADN devolver.
   *
   * Campos confirmados na referência da Focus para NFS-e nacional
   * (campos.focusnfe.com.br/nfse_nacional/EmissaoDPSXml.html):
   *
   *   ibs_cbs_situacao_tributaria           → CST
   *   ibs_cbs_classificacao_tributaria      → cClassTrib
   *   ibs_cbs_credito_codigo_classificacao  → cCredPres
   *   desconto_incondicionado               → vDescIncond
   *   valor_pis / valor_cofins              → vPis / vCofins
   *   codigo_opcao_simples_nacional         → opSimpNac
   *   regime_tributario_simples_nacional    → regApTribSN
   *
   * PENDÊNCIA que resta: o ajuste de base (`vCalcAjusteBCIBSCBS` /
   * `vCalcAjusteBCLocImoveis`) não aparece na referência de campos da Focus.
   * Segue sem ser enviado — quem trabalha com reembolso/repasse ou locação de
   * imóvel terá o ajuste ignorado pelo ADN até o nome ser confirmado na
   * homologação. `valor_servicos` continua sendo o vServ BRUTO, que é o que
   * aquele campo pede.
   */
  private montarPayload(input: EmitirNfseInput): Record<string, unknown> {
    const { prestador, tomador, servico } = input;
    const ehCnpj = tomador.cpfCnpj.replace(/\D/g, "").length === 14;
    const declaracao = servico.reforma.declaracao ?? null;
    const base = servico.reforma.baseCalculo ?? null;
    const intencao = servico.reforma.intencao ?? null;

    // opSimpNac é 1-1 na DPS (NT-009), mas só temos como preenchê-lo quando a
    // intenção veio montada. Sem ela, omitimos em vez de chutar "não optante":
    // afirmar a situação errada perante o Simples é pior que deixar a Focus
    // aplicar o padrão dela.
    const opSimpNac = intencao?.situacaoSimplesNacional
      ? OP_SIMP_NAC[intencao.situacaoSimplesNacional]
      : undefined;
    const regApTribSN = intencao?.regimeApuracaoSN
      ? REG_AP_IBSCBS_SN[intencao.regimeApuracaoSN]
      : undefined;

    return {
      data_emissao: `${servico.competencia}T00:00:00`,
      prestador: {
        cnpj: prestador.cnpj,
        inscricao_municipal: prestador.inscricaoMunicipal ?? undefined,
        codigo_municipio: prestador.codigoMunicipioIbge,
      },
      tomador: {
        [ehCnpj ? "cnpj" : "cpf"]: tomador.cpfCnpj,
        razao_social: tomador.nome,
        email: tomador.email ?? undefined,
        endereco: Object.keys(tomador.endereco).length > 0 ? tomador.endereco : undefined,
      },
      servico: {
        discriminacao: servico.descricao,
        item_lista_servico: servico.codigoServico,
        valor_servicos: centavosParaReais(servico.valorCentavos),
        aliquota: aliquotaIssParaPercentual(servico.aliquotaIss),
        iss_retido: servico.issRetido,
        // Reforma: o NBS o sistema já tem e é aceito pela Focus.
        codigo_nbs: servico.codigoNbs ?? undefined,
        // Grupo IBSCBS — só vai quando explicitamente declarado.
        ibs_cbs_situacao_tributaria: declaracao?.cst ?? undefined,
        ibs_cbs_classificacao_tributaria: declaracao?.cClassTrib ?? undefined,
        ibs_cbs_credito_codigo_classificacao: declaracao?.cCredPres ?? undefined,
        // gTribRegular — o par é informado à mão por quem emite; o sistema não
        // o deduz. Ver `solicitarEmissao`.
        ibs_cbs_situacao_tributaria_regular: declaracao?.tribRegular?.cstRegular ?? undefined,
        ibs_cbs_classificacao_tributaria_regular:
          declaracao?.tribRegular?.cClassTribRegular ?? undefined,
        // gReeRepRes — os documentos que originam o ajuste de base. O TOTAL nao
        // vai: quem soma e o Ambiente de Dados Nacional.
        documentos_referenciados: documentosReferenciados(servico.reforma.documentosAjuste),
        // Componentes da base (NT-009). `undefined` quando zero: mandar 0,00
        // num campo opcional é ruído, e a ausência já significa "não há".
        desconto_incondicionado: base?.descontoIncondicionadoCentavos
          ? centavosParaReais(base.descontoIncondicionadoCentavos)
          : undefined,
        valor_pis: base?.pisCentavos ? centavosParaReais(base.pisCentavos) : undefined,
        valor_cofins: base?.cofinsCentavos ? centavosParaReais(base.cofinsCentavos) : undefined,
      },
      // Regime do prestador perante o Simples Nacional. Fica FORA de `servico`
      // porque na DPS mora em `prest/regTrib/`, não no grupo do serviço.
      codigo_opcao_simples_nacional: opSimpNac,
      regime_tributario_simples_nacional: regApTribSN,
    };
  }
}

/**
 * Traduz os documentos de ajuste para a coleção `documentos_referenciados`.
 *
 * Nomes conferidos um a um na referência de campos da Focus: `tipo_valor_incluido`
 * (tpReeRepRes), `valor_repasse` (vlrReeRepRes), `tipo_chave_dfe` (tipoChaveDFe),
 * `chave_dfe` (chaveDFe), e as duas alternativas para documento fora do
 * repositório nacional.
 *
 * `undefined` quando não há documento: coleção vazia e ausência significam a
 * mesma coisa para o Fisco, e mandar `[]` é ruído.
 */
function documentosReferenciados(
  docs: readonly DocumentoAjusteBase[] | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!docs?.length) return undefined;

  return docs.map((d) => {
    const id = d.identificacao;
    const comum = {
      tipo_valor_incluido: d.tipo,
      descricao_tipo_valor_incluido: d.descricaoTipo ?? undefined,
      valor_repasse: centavosParaReais(d.valorCentavos),
    };

    switch (id.forma) {
      case "dfe_nacional":
        return {
          ...comum,
          tipo_chave_dfe: id.tipoChaveDFe,
          descricao_chave_dfe: id.descricaoTipoChave ?? undefined,
          chave_dfe: id.chaveDFe,
        };
      case "doc_fiscal_outro":
        return {
          ...comum,
          codigo_municipio_documento_fiscal_outro: id.codigoMunicipio,
          numero_documento_fiscal_outro: id.numero,
          descricao_documento_fiscal_outro: id.descricao,
        };
      case "doc_nao_fiscal":
        return {
          ...comum,
          numero_documento_nao_fiscal_outro: id.numero,
          descricao_documento_nao_fiscal_outro: id.descricao,
        };
    }
  });
}

/**
 * AJUSTE DE BASE — por que o TOTAL não é enviado.
 *
 * A suposição anterior (e o andaime que ela gerou) era de que faltava apenas o
 * NOME de um campo escalar. A referência de campos da Focus, lida por inteiro —
 * 247 campos — mostra que **não há campo escalar nenhum**. O que existe é:
 *
 *   `documentos_referenciados`  grupo/lista, "documentos referenciados nos
 *                               casos de reembolso, repasse e ressarcimento
 *                               que serão considerados na base de cálculo"
 *     ├ tipoChaveDFe / chaveDFe        documento no repositório nacional
 *     ├ cMunDocFiscal / nDocFiscal     documento fora do repositório
 *     ├ tpReeRepRes / xTpReeRepRes     tipo do reembolso/repasse
 *     └ vlrReeRepRes                   valor daquele documento
 *
 *   `imovel`                    grupo próprio, para locação de bem imóvel.
 *
 * Isso fecha com o Anexo VI: `vCalcAjusteBCIBSCBS` e `vCalcAjusteBCLocImoveis`
 * ficam em `NFSe/infNFSe/IBSCBS/valores/` — lado NFS-e, e o prefixo `vCalc` diz
 * o resto. O ajuste é CALCULADO pelo Ambiente de Dados Nacional somando os
 * documentos que a DPS referencia. Mesmo padrão do vBC.
 *
 * CONSEQUÊNCIA PARA NÓS: o nosso `ajusteBaseCentavos` é um escalar e não tem
 * como virar essa lista. Enviar o total num campo inventado não é opção, e
 * omitir em silêncio é pior — o ADN calcularia a base SEM o ajuste, a nota
 * sairia com base maior que a nossa prévia, e ninguém perceberia até a
 * apuração. Por isso `solicitarEmissao` RECUSA nota com ajuste declarado,
 * enquanto `gReeRepRes`/`imovel` não estiverem modelados como grupo.
 *
 * O que falta é modelagem, não informação: a documentação está completa.
 */

/** Fábrica usada pelo registry — lê o ambiente validado em src/lib/env.ts. */
export function criarFocusNfeProvider(cfg: {
  token: string;
  ambiente: FocusNfeAmbiente;
}): FocusNfeProvider {
  return new FocusNfeProvider(cfg);
}
