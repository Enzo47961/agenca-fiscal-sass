/**
 * Camada de abstração sobre APIs fiscais (Focus NFe, Nuvem Fiscal, etc).
 * O motor de retry NÃO conhece providers concretos — só esta interface
 * e as duas classes de erro (regras 8 e 21 do CLAUDE.md).
 */
import { type RegimeIbsCbs } from "./reforma";

// ---------------------------------------------------------------------------
// Erros classificados — a distinção transiente/permanente dirige o retry
// ---------------------------------------------------------------------------

/**
 * Erro transiente: timeout, 5xx, prefeitura fora do ar, rate limit.
 * O motor DEVE fazer retry com backoff.
 */
export class FiscalErrorTransient extends Error {
  readonly kind = "transient" as const;
  constructor(
    message: string,
    public readonly codigo: string | null = null,
    public readonly payloadBruto: unknown = null,
  ) {
    super(message);
    this.name = "FiscalErrorTransient";
  }
}

/**
 * Erro permanente: dados inválidos, CNPJ irregular, rejeição de validação.
 * Retry é inútil — o motor DEVE falhar imediatamente.
 */
export class FiscalErrorPermanent extends Error {
  readonly kind = "permanent" as const;
  constructor(
    message: string,
    public readonly codigo: string | null = null,
    public readonly payloadBruto: unknown = null,
  ) {
    super(message);
    this.name = "FiscalErrorPermanent";
  }
}

export type FiscalError = FiscalErrorTransient | FiscalErrorPermanent;

export function isFiscalError(e: unknown): e is FiscalError {
  return e instanceof FiscalErrorTransient || e instanceof FiscalErrorPermanent;
}

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------

export interface EmitirNfseInput {
  /** Chave de idempotência — MESMO valor em todos os retries (regra 7). */
  referenciaExterna: string;
  prestador: {
    cnpj: string;
    inscricaoMunicipal: string | null;
    codigoMunicipioIbge: string;
  };
  tomador: {
    cpfCnpj: string;
    nome: string;
    email: string | null;
    endereco: Record<string, unknown>;
  };
  servico: {
    descricao: string;
    codigoServico: string;
    valorCentavos: number;
    aliquotaIss: number;
    issRetido: boolean;
    competencia: string; // ISO date (yyyy-mm-dd)
    /** Código NBS (Nomenclatura Brasileira de Serviços) — reforma. Null no legado. */
    codigoNbs: string | null;
    /** Tributos da reforma (CBS/IBS) já calculados. Zerados no modelo antigo. */
    reforma: {
      regime: RegimeIbsCbs;
      cbsAliquota: number;
      ibsAliquota: number;
      cbsValorCentavos: number;
      ibsValorCentavos: number;
    };
  };
}

export interface EmitirNfseResult {
  numeroNfse: string;
  codigoVerificacao: string | null;
  providerId: string;
  urlPdf: string | null;
  urlXml: string | null;
}

export interface FiscalProvider {
  readonly nome: string;

  /**
   * Emite a NFS-e. Implementações DEVEM:
   * - usar `referenciaExterna` como chave de idempotência no provider;
   * - inspecionar o corpo mesmo em HTTP 200 (prefeituras retornam erro no body);
   * - lançar exclusivamente FiscalErrorTransient ou FiscalErrorPermanent em falha.
   */
  emitir(input: EmitirNfseInput): Promise<EmitirNfseResult>;

  /**
   * Consulta por referência externa — usada para resolver ambiguidade
   * (ex.: timeout após o envio: a nota pode ter sido emitida).
   */
  consultarPorReferencia(referenciaExterna: string): Promise<EmitirNfseResult | null>;
}
