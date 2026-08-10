import { type Centavos } from "@/types/domain";

/**
 * REFORMA TRIBUTÁRIA — cálculo de CBS e IBS por serviço (lógica pura e testável).
 *
 * Modelo IVA Dual (EC 132/2023, LC 214/2025): além do ISS do modelo antigo, a
 * nota passa a destacar CBS (federal) e IBS (estadual/municipal). Em 2026 (fase
 * de teste) as alíquotas são simbólicas — CBS 0,9% e IBS 0,1% — sem aumento real
 * de carga. Setores sensíveis têm regime diferenciado (alíquota zero, redução de
 * 60% ou 30%, ou regime específico).
 *
 * ALÍQUOTAS POR VIGÊNCIA (item C6): a tabela VIGENCIAS abaixo é a fonte única.
 * Anos cuja alíquota a norma ainda não fixou LANÇAM erro em vez de devolver um
 * número plausível — ver aliquotasReferencia(). Confirme com um contador antes
 * de usar em produção.
 */

export const REGIME_IBSCBS = [
  "padrao",
  "reducao_30",
  "reducao_60",
  "aliquota_zero",
  "especifico",
] as const;

export type RegimeIbsCbs = (typeof REGIME_IBSCBS)[number];

/** Rótulos legíveis para UI. */
export const REGIME_IBSCBS_LABEL: Record<RegimeIbsCbs, string> = {
  padrao: "Padrão (alíquota cheia)",
  reducao_30: "Redução de 30% (profissionais liberais regulamentados)",
  reducao_60: "Redução de 60% (saúde, educação, etc.)",
  aliquota_zero: "Alíquota zero (isenção)",
  especifico: "Regime específico",
};

/**
 * Fator aplicado à alíquota de referência conforme o regime diferenciado.
 * "especifico" tem regras próprias de apuração — tratado como cheio até que uma
 * configuração específica seja definida (não subestima o tributo).
 */
const FATOR_REGIME: Record<RegimeIbsCbs, number> = {
  padrao: 1,
  reducao_30: 0.7,
  reducao_60: 0.4,
  aliquota_zero: 0,
  especifico: 1,
};

/**
 * Erro específico para "a lei ainda não fixou essa alíquota".
 *
 * Existe como classe própria de propósito: quem chama precisa distinguir isto
 * de um erro de programação. Não é bug nosso — é norma que não foi publicada.
 */
export class AliquotaNaoFixadaError extends Error {
  readonly kind = "aliquota_nao_fixada" as const;
  constructor(
    message: string,
    readonly ano: number,
    readonly tributo: "cbs" | "ibs" | "ambos",
  ) {
    super(message);
    this.name = "AliquotaNaoFixadaError";
  }
}

/** `null` = não fixado por norma até a data desta implementação (05/08/2026). */
interface VigenciaAliquota {
  readonly cbs: number | null;
  readonly ibs: number | null;
  readonly fundamento: string;
}

/**
 * TABELA DE VIGÊNCIA DAS ALÍQUOTAS DE REFERÊNCIA (item C6 da auditoria).
 *
 * Fonte: EC 132/2023 (ADCT arts. 125-129), LC 214/2025 art. 18, e a pesquisa
 * oficial de 05/08/2026 (`relatorio_pesquisa_oficial_ibscbs.md`, Entrega 6).
 *
 * O PONTO CENTRAL: até 05/08/2026 **nenhuma alíquota de referência de 2027 em
 * diante foi fixada por Resolução do Senado Federal**, que é o instrumento que
 * a lei exige (ADCT art. 130; LC 214/2025 art. 18). Existe apenas uma proposta
 * INTERNA do Comitê Gestor (Resolução CGIBS nº 14, de 29/07/2026, estimando IBS
 * em 18,7% e o total em ~27,91%) — não é a fixação legal e NÃO deve ser usada
 * como parâmetro de cálculo. Por isso ela não está nesta tabela.
 *
 * Antes, esta função recebia a competência, ignorava o ano e devolvia sempre o
 * par de teste de 2026. Uma nota de 2027 sairia com CBS 0,9% — subdeclaração
 * silenciosa, justamente quando a cobrança deixa de ser informativa.
 */
const VIGENCIAS: Readonly<Record<number, VigenciaAliquota>> = {
  // Fase de teste: valores fixos no texto constitucional, confirmados
  // literalmente. Apuração informativa, compensável com PIS/Cofins.
  2026: { cbs: 0.009, ibs: 0.001, fundamento: "ADCT art. 125 (EC 132/2023)" },

  // IBS é fixo por norma: 0,05% estadual + 0,05% municipal = 0,1%.
  // CBS = alíquota de referência − 0,1 p.p., e a referência depende de
  // Resolução do Senado ainda não publicada. Metade conhecida, metade não.
  2027: { cbs: null, ibs: 0.001, fundamento: "ADCT arts. 126-127; CBS pendente do Senado" },
  2028: { cbs: null, ibs: 0.001, fundamento: "ADCT art. 127; CBS pendente do Senado" },

  // A partir daqui, ICMS/ISS reduzem progressivamente (9/10, 8/10, 7/10, 6/10)
  // e as alíquotas de referência de CBS e IBS passam a valer — nenhuma fixada.
  2029: { cbs: null, ibs: null, fundamento: "ADCT art. 128-I; referências pendentes" },
  2030: { cbs: null, ibs: null, fundamento: "ADCT art. 128-II; referências pendentes" },
  2031: { cbs: null, ibs: null, fundamento: "ADCT art. 128-III; referências pendentes" },
  2032: { cbs: null, ibs: null, fundamento: "ADCT art. 128-IV; referências pendentes" },
  2033: { cbs: null, ibs: null, fundamento: "ADCT art. 129 (ICMS/ISS extintos); pendentes" },
};

/** Override para quando o Senado publicar: `{ 2027: { cbs: 0.0875 } }`. */
export type OverridesAliquotas = Readonly<
  Record<number, { cbs?: number; ibs?: number } | undefined>
>;

/**
 * Alíquotas de referência (fração) da competência informada.
 *
 * LANÇA `AliquotaNaoFixadaError` quando a norma ainda não fixou o valor, em vez
 * de devolver um número plausível. Emitir com alíquota inventada é pior do que
 * não emitir: vira subdeclaração com aparência de conformidade.
 *
 * `overrides` é o caminho para destravar sem deploy assim que a Resolução do
 * Senado sair — passe o valor publicado, com fundamento registrado.
 */
export function aliquotasReferencia(
  competencia: string,
  overrides: OverridesAliquotas = {},
): { cbs: number; ibs: number } {
  const ano = Number(competencia.slice(0, 4));
  if (!Number.isInteger(ano) || ano < 1000) {
    throw new Error(`Competência inválida: ${competencia}`);
  }

  const vigencia = VIGENCIAS[ano];
  if (!vigencia) {
    const limites = Object.keys(VIGENCIAS).map(Number);
    throw new AliquotaNaoFixadaError(
      `Não há alíquota de IBS/CBS definida para ${ano}. A tabela cobre de ` +
        `${Math.min(...limites)} a ${Math.max(...limites)} — antes disso o tributo não existia, ` +
        `depois disso ainda não há norma.`,
      ano,
      "ambos",
    );
  }

  const cbs = overrides[ano]?.cbs ?? vigencia.cbs;
  const ibs = overrides[ano]?.ibs ?? vigencia.ibs;

  const faltando: Array<"cbs" | "ibs"> = [];
  if (cbs === null || cbs === undefined) faltando.push("cbs");
  if (ibs === null || ibs === undefined) faltando.push("ibs");

  if (faltando.length > 0) {
    const quais = faltando.map((t) => t.toUpperCase()).join(" e ");
    throw new AliquotaNaoFixadaError(
      `Alíquota de ${quais} para ${ano} ainda não foi fixada por Resolução do Senado ` +
        `(${vigencia.fundamento}). Emitir com um valor estimado seria subdeclaração. ` +
        `Configure a alíquota publicada antes de emitir nesta competência.`,
      ano,
      faltando.length === 2 ? "ambos" : faltando[0]!,
    );
  }

  return { cbs: cbs as number, ibs: ibs as number };
}

/** Anos com alíquota integralmente fixada hoje — útil para UI e diagnóstico. */
export function competenciasComAliquotaFixada(): number[] {
  return Object.entries(VIGENCIAS)
    .filter(([, v]) => v.cbs !== null && v.ibs !== null)
    .map(([ano]) => Number(ano))
    .sort();
}

// ---------------------------------------------------------------------------
// BASE DE CÁLCULO DO IBS/CBS (item B7 da auditoria pós-C5)
//
// Antes, o sistema usava o valor BRUTO do serviço como base. A base da NFS-e
// não é o valor bruto: é o valor bruto MENOS um conjunto de deduções. Usar o
// bruto superestima a base e, com ela, o IBS/CBS destacado. Em 2026 a apuração
// é informativa e o erro é "só" um número errado na nota; a partir de 2027 vira
// recolhimento a maior.
//
// FÓRMULA (Nota Técnica SE/CGNFS-e nº 009/2026, v1.0.1, lida na fonte oficial
// em 06/08/2026 — gov.br/nfse, documentação técnica RTC):
//
//   até 2026:    vBC = vServ − descIncond − ajusteBC − vISSQN − vPIS − vCOFINS
//   2027 a 2032: vBC = vServ − descIncond − ajusteBC − vISSQN
//
// onde `ajusteBC` é `vCalcAjusteBCIBSCBS` OU `vCalcAjusteBCLocImoveis` — a NT
// usa "ou" porque as duas ocupam o mesmo lugar na fórmula, cada uma para um
// tipo de operação.
//
// RESOLUÇÃO DA PENDÊNCIA P5 (NT-004 vs NT-009): as duas fórmulas NÃO divergem
// e não há coexistência a resolver. A NT-009 ATUALIZA a NT-004 — mesma
// estrutura, com `vCalcReeRepRes` renomeado para `vCalcAjusteBCIBSCBS` e o
// acréscimo da alternativa `vCalcAjusteBCLocImoveis` (locação de bens imóveis,
// subitem 99.03). A NT-009 diz complementar/ajustar as notas anteriores, sem
// revogá-las. Por isso implementamos a redação da NT-009, que é a mais recente
// e engloba a anterior.
//
// A dedução do ISSQN é PERMANENTE durante toda a transição; PIS e COFINS só
// até 2026, quando deixam de existir.
// ---------------------------------------------------------------------------

/** Último ano em que PIS e COFINS existem e, portanto, são dedutíveis da base. */
export const ULTIMO_ANO_PIS_COFINS = 2026;

/**
 * Qual das duas alternativas de ajuste ocupa o lugar na fórmula.
 * - `ibscbs`      → vCalcAjusteBCIBSCBS (glosa de serviços de saúde, operações de terceiros)
 * - `loc_imoveis` → vCalcAjusteBCLocImoveis (locação de bens imóveis, subitem 99.03)
 */
export const TIPO_AJUSTE_BASE = ["ibscbs", "loc_imoveis"] as const;
export type TipoAjusteBase = (typeof TIPO_AJUSTE_BASE)[number];

/** Rótulos legíveis para UI — o nome da tag não diz nada a quem preenche. */
export const TIPO_AJUSTE_BASE_LABEL: Record<TipoAjusteBase, string> = {
  ibscbs: "Reembolso, repasse ou glosa (vCalcAjusteBCIBSCBS)",
  loc_imoveis: "Locação de bem imóvel — subitem 99.03 (vCalcAjusteBCLocImoveis)",
};

export interface ComponentesBaseIbsCbs {
  /** vServ — valor bruto do serviço. */
  valorServicoCentavos: Centavos;
  /** descIncond — desconto incondicionado (o condicionado NÃO entra). */
  descontoIncondicionadoCentavos?: Centavos;
  /** vCalcAjusteBCIBSCBS ou vCalcAjusteBCLocImoveis, conforme `tipoAjusteBase`. */
  ajusteBaseCentavos?: Centavos;
  tipoAjusteBase?: TipoAjusteBase | null;
  /**
   * vISSQN. Quando omitido, é derivado de `(vServ − descIncond) × aliquotaIss`.
   * A derivação segue o preço do serviço como base do ISS (LC 116/2003, art. 7º);
   * quem tiver base de ISS própria — dedução de materiais, por exemplo — informa
   * o valor e a derivação não acontece.
   */
  issqnCentavos?: Centavos;
  aliquotaIss?: number;
  /** vPIS e vCOFINS — dedutíveis só até 2026. */
  pisCentavos?: Centavos;
  cofinsCentavos?: Centavos;
}

export interface BaseIbsCbs {
  baseCentavos: Centavos;
  /** Memória de cálculo: o que de fato foi subtraído, já resolvido. */
  valorServicoCentavos: Centavos;
  descontoIncondicionadoCentavos: Centavos;
  ajusteBaseCentavos: Centavos;
  tipoAjusteBase: TipoAjusteBase | null;
  issqnCentavos: Centavos;
  /** true quando o ISSQN veio da derivação, não informado por quem chamou. */
  issqnDerivado: boolean;
  pisCentavos: Centavos;
  cofinsCentavos: Centavos;
  /** false a partir de 2027 — PIS/COFINS não entram mais na fórmula. */
  deduzPisCofins: boolean;
}

function exigirCentavos(nome: string, valor: number | undefined): Centavos {
  const n = valor ?? 0;
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${nome} deve ser inteiro >= 0 (centavos). Recebido: ${String(valor)}`);
  }
  return n;
}

/**
 * Calcula o vBC da NFS-e a partir dos componentes da NT-009.
 *
 * Duas decisões que a NT NÃO toma e que portanto são NOSSAS, marcadas aqui para
 * não passarem por norma:
 *
 * 1. Base negativa. A NT não estabelece piso zero nem proíbe o valor negativo.
 *    Preferimos LANÇAR a grampear em zero: deduções maiores que o valor do
 *    serviço são erro de digitação ou de integração, e zerar em silêncio emitiria
 *    uma nota com base errada e aparência de correta.
 * 2. PIS/COFINS a partir de 2027. Um valor NÃO-ZERO nessas competências também
 *    lança, em vez de ser descartado sem aviso. Descartar mudaria a base sem que
 *    ninguém percebesse; e o erro só dispara quando alguém realmente reivindica
 *    a dedução, então não há falso positivo.
 */
export function calcularBaseIbsCbs(
  params: ComponentesBaseIbsCbs & { competencia: string },
): BaseIbsCbs {
  const ano = Number(params.competencia.slice(0, 4));
  if (!Number.isInteger(ano) || ano < 1000) {
    throw new Error(`Competência inválida: ${params.competencia}`);
  }

  const valorServicoCentavos = exigirCentavos("valorServicoCentavos", params.valorServicoCentavos);
  const descontoIncondicionadoCentavos = exigirCentavos(
    "descontoIncondicionadoCentavos",
    params.descontoIncondicionadoCentavos,
  );
  const ajusteBaseCentavos = exigirCentavos("ajusteBaseCentavos", params.ajusteBaseCentavos);
  const pisCentavos = exigirCentavos("pisCentavos", params.pisCentavos);
  const cofinsCentavos = exigirCentavos("cofinsCentavos", params.cofinsCentavos);

  // O tipo do ajuste não é decorativo: ele diz QUAL tag da DPS carrega o valor.
  // Um ajuste sem tipo sairia no XML sem endereço.
  const tipoAjusteBase = params.tipoAjusteBase ?? null;
  if (ajusteBaseCentavos > 0 && tipoAjusteBase === null) {
    throw new Error(
      "Ajuste de base informado sem `tipoAjusteBase`. Escolha entre " +
        `${TIPO_AJUSTE_BASE.join(" e ")} — são tags diferentes da DPS.`,
    );
  }

  const deduzPisCofins = ano <= ULTIMO_ANO_PIS_COFINS;
  if (!deduzPisCofins && (pisCentavos > 0 || cofinsCentavos > 0)) {
    throw new Error(
      `PIS/COFINS não são dedutíveis da base de IBS/CBS em ${ano}: os tributos ` +
        `deixam de existir em ${ULTIMO_ANO_PIS_COFINS + 1} e a fórmula da NT-009 ` +
        "não os inclui a partir daí. Zere os campos ou revise a competência.",
    );
  }

  // ISSQN: informado prevalece; derivado é o caminho de quem só tem alíquota.
  const issqnDerivado = params.issqnCentavos === undefined || params.issqnCentavos === null;
  const issqnCentavos = issqnDerivado
    ? Math.round(
        Math.max(0, valorServicoCentavos - descontoIncondicionadoCentavos) *
          (params.aliquotaIss ?? 0),
      )
    : exigirCentavos("issqnCentavos", params.issqnCentavos);

  const baseCentavos =
    valorServicoCentavos -
    descontoIncondicionadoCentavos -
    ajusteBaseCentavos -
    issqnCentavos -
    (deduzPisCofins ? pisCentavos + cofinsCentavos : 0);

  if (baseCentavos < 0) {
    throw new Error(
      `Base de cálculo de IBS/CBS negativa (${baseCentavos} centavos): as deduções ` +
        `somam mais que o valor do serviço (${valorServicoCentavos}). Revise desconto ` +
        "incondicionado, ajuste de base, ISSQN, PIS e COFINS.",
    );
  }

  return {
    baseCentavos,
    valorServicoCentavos,
    descontoIncondicionadoCentavos,
    ajusteBaseCentavos,
    tipoAjusteBase,
    issqnCentavos,
    issqnDerivado,
    pisCentavos,
    cofinsCentavos,
    deduzPisCofins,
  };
}

/**
 * A base como ela fica GRAVADA na nota — os termos da fórmula, sem os campos
 * que são apenas informação do momento do cálculo (`issqnDerivado`,
 * `deduzPisCofins`). Os dois se redescobrem a partir da competência e do que
 * está gravado, então persistí-los seria duplicar estado.
 */
export interface BaseIbsCbsPersistida {
  baseCentavos: Centavos;
  valorServicoCentavos: Centavos;
  descontoIncondicionadoCentavos: Centavos;
  ajusteBaseCentavos: Centavos;
  tipoAjusteBase: TipoAjusteBase | null;
  issqnCentavos: Centavos;
  pisCentavos: Centavos;
  cofinsCentavos: Centavos;
}

/**
 * Reconstrói a base a partir das colunas de `notas_fiscais`.
 *
 * Existe pelo mesmo motivo que `declaracaoDeColunas()` no grupo IBSCBS: ler
 * colunas e remontar o objeto de domínio é lógica de domínio, e lógica de
 * domínio não mora dentro da função Inngest — lá ela não teria teste e viraria
 * ponte de falha silenciosa.
 *
 * Devolve `null` quando `ibscbs_base_centavos` é NULL, que é como o banco marca
 * "nota criada antes da fórmula existir". NUNCA cair para
 * `valor_servico_centavos` nesse caso: usar o bruto como base é exatamente o
 * erro que a migration 20260806140000 foi escrita para corrigir, e o fallback
 * silencioso o reintroduziria justamente nas notas antigas.
 */
export function baseDeColunas(nota: {
  ibscbs_base_centavos: number | null;
  valor_servico_centavos: number;
  desconto_incondicionado_centavos: number;
  ajuste_base_centavos: number;
  ajuste_base_tipo: TipoAjusteBase | null;
  issqn_centavos: number;
  pis_centavos: number;
  cofins_centavos: number;
}): BaseIbsCbsPersistida | null {
  if (nota.ibscbs_base_centavos === null) return null;

  return {
    baseCentavos: nota.ibscbs_base_centavos,
    valorServicoCentavos: nota.valor_servico_centavos,
    descontoIncondicionadoCentavos: nota.desconto_incondicionado_centavos,
    ajusteBaseCentavos: nota.ajuste_base_centavos,
    tipoAjusteBase: nota.ajuste_base_tipo,
    issqnCentavos: nota.issqn_centavos,
    pisCentavos: nota.pis_centavos,
    cofinsCentavos: nota.cofins_centavos,
  };
}

export interface TributosReforma {
  regime: RegimeIbsCbs;
  cbsAliquota: number;
  ibsAliquota: number;
  cbsValorCentavos: Centavos;
  ibsValorCentavos: Centavos;
}

/** Arredonda uma fração de alíquota para 4 casas (compatível com NUMERIC(6,4)). */
function arredondar4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Calcula CBS e IBS de um serviço a partir da base (valor do serviço em
 * centavos), da competência e do regime diferenciado. Retorna alíquotas (fração)
 * e valores (centavos inteiros — regra 15).
 */
export function calcularTributosReforma(params: {
  baseCentavos: Centavos;
  competencia: string;
  regime: RegimeIbsCbs;
  /** Alíquotas publicadas depois desta implementação — ver aliquotasReferencia. */
  overridesAliquotas?: OverridesAliquotas;
}): TributosReforma {
  const { baseCentavos, competencia, regime } = params;
  if (!Number.isInteger(baseCentavos) || baseCentavos < 0) {
    throw new Error("baseCentavos deve ser inteiro >= 0 (centavos)");
  }
  const base = aliquotasReferencia(competencia, params.overridesAliquotas);
  const fator = FATOR_REGIME[regime];

  const cbsAliquota = arredondar4(base.cbs * fator);
  const ibsAliquota = arredondar4(base.ibs * fator);

  return {
    regime,
    cbsAliquota,
    ibsAliquota,
    cbsValorCentavos: Math.round(baseCentavos * cbsAliquota),
    ibsValorCentavos: Math.round(baseCentavos * ibsAliquota),
  };
}
