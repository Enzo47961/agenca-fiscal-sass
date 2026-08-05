import { z } from "zod";
import {
  FiscalErrorPermanent,
  FiscalErrorTransient,
  type EmitirNfseInput,
  type EmitirNfseResult,
  type FiscalProvider,
} from "../provider";

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
  /** Presente nos corpos de erro (400/401/404/422). */
  codigo: z.string().nullish(),
  mensagem: z.string().nullish(),
  erros: z.array(erroFocusSchema).nullish(),
});

type NfseFocus = z.infer<typeof nfseFocusSchema>;

/** Status terminais/possíveis documentados pela Focus NFe. */
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
  }

  // -------------------------------------------------------------------------
  // FiscalProvider
  // -------------------------------------------------------------------------

  async emitir(input: EmitirNfseInput): Promise<EmitirNfseResult> {
    const ref = input.referenciaExterna;
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
    metodo: "GET" | "POST",
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
   * Traduz o nosso `EmitirNfseInput` no JSON da Focus NFe.
   *
   * PENDÊNCIA CONSCIENTE (item C5 da auditoria): a Focus já aceita os campos
   * estruturados da reforma (`ibs_cbs_classificacao_tributaria` = cClassTrib,
   * `codigo_indicador_operacao`). NÃO os enviamos ainda porque o sistema não
   * modela CST/cClassTrib — o `regime_ibscbs` que temos é um agregado nosso,
   * não um código da tabela oficial, e mapear um para o outro sem a NT
   * 007/2026 lida na íntegra seria inventar enquadramento fiscal. Enquanto
   * isso não for resolvido, esses campos ficam ausentes e a nota sai com o
   * tratamento padrão do município. NÃO promover para produção sem fechar isso.
   */
  private montarPayload(input: EmitirNfseInput): Record<string, unknown> {
    const { prestador, tomador, servico } = input;
    const ehCnpj = tomador.cpfCnpj.replace(/\D/g, "").length === 14;

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
      },
    };
  }
}

/** Fábrica usada pelo registry — lê o ambiente validado em src/lib/env.ts. */
export function criarFocusNfeProvider(cfg: {
  token: string;
  ambiente: FocusNfeAmbiente;
}): FocusNfeProvider {
  return new FocusNfeProvider(cfg);
}
