/**
 * Camada de abstração sobre APIs fiscais (Focus NFe, Nuvem Fiscal, etc).
 * O motor de retry NÃO conhece providers concretos — só esta interface
 * e as duas classes de erro (regras 8 e 21 do CLAUDE.md).
 */
import { type BaseIbsCbsPersistida, type RegimeIbsCbs } from "./reforma";
import {
  type DeclaracaoTributariaIBSCBS,
  type IntencaoRegimeTributario,
  type ResultadoCalculoIBSCBS,
} from "./ibscbs";

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
    /**
     * Tributos da reforma (CBS/IBS).
     *
     * ATENÇÃO À NATUREZA DOS CAMPOS (item C5 da auditoria): `regime` e os
     * valores calculados são INTENÇÃO DE NEGÓCIO e prévia interna — servem para
     * a UI e para relatório, e NÃO são o vocabulário que a DPS espera. Na NFS-e
     * quem calcula o valor final de IBS/CBS é o Ambiente de Dados Nacional, a
     * partir do CST/cClassTrib declarado; empurrar um valor já pronto pode
     * divergir do que ele calcular. O que de fato se declara é `declaracao`.
     */
    reforma: {
      regime: RegimeIbsCbs;
      cbsAliquota: number;
      ibsAliquota: number;
      cbsValorCentavos: number;
      ibsValorCentavos: number;
      /**
       * Grupo IBSCBS da DPS — CST, cClassTrib e subgrupos condicionais.
       * Ausente/`null` enquanto o preenchimento do grupo não estiver
       * habilitado: não há data confirmada de obrigatoriedade de PREENCHIMENTO
       * para a NFS-e, e a NF-e teve as datas de produção suspensas na NT
       * 2025.002 v1.51. Por isso é flag, não calendário.
       */
      declaracao?: DeclaracaoTributariaIBSCBS | null;
      /** Contexto do Simples Nacional (opSimpNac / regApIBSCBSSN, NT-009). */
      intencao?: IntencaoRegimeTributario | null;
      /**
       * vBC do IBS/CBS e os termos que o produziram (NT SE/CGNFS-e 009/2026).
       *
       * NÃO confundir com `servico.valorCentavos`: aquele é o vServ bruto, este
       * é o bruto MENOS descontos incondicionados, ajuste de base, ISSQN e —
       * só até 2026 — PIS/COFINS. Um provider que usar o bruto onde a DPS pede
       * o vBC superestima a base e, a partir de 2027, o recolhimento.
       *
       * Os componentes vêm junto do total de propósito: a base é o número que
       * o Fisco confere, e mandar só o resultado deixaria o provider sem como
       * preencher os campos individuais da DPS.
       *
       * `null` = nota criada antes da fórmula existir (`ibscbs_base_centavos`
       * NULL no banco). Nesse caso o provider NÃO deve substituir pelo bruto.
       */
      baseCalculo?: BaseIbsCbsPersistida | null;
    };
  };
}

export interface EmitirNfseResult {
  numeroNfse: string;
  codigoVerificacao: string | null;
  providerId: string;
  urlPdf: string | null;
  urlXml: string | null;
  /**
   * Grupo IBSCBS CALCULADO pelo Ambiente de Dados Nacional e devolvido junto
   * com a nota autorizada. É dado de auditoria: persistir, nunca recalcular
   * localmente. Ausente enquanto o provider não expuser esses campos.
   */
  resultadoCalculado?: ResultadoCalculoIBSCBS | null;
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
