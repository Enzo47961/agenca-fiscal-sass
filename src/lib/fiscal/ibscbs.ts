/**
 * Domínio tributário do grupo IBSCBS (Reforma Tributária — LC 214/2025).
 * Item C5 da auditoria.
 *
 * Fonte: `ibscbs_modelagem_tecnica.md` (pesquisa de ago/2026), que consolida as
 * NT SE/CGNFS-e 004 v2.00, 007, 008 e 009 e a extração ao vivo das tabelas
 * CST-IBS/CBS e cClassTrib do Portal da Conformidade Fácil (SVRS/ENCAT).
 *
 * TRÊS DECISÕES ESTRUTURAIS QUE VÊM DA FONTE, NÃO DE PREFERÊNCIA:
 *
 * 1. Na NFS-e o grupo IBSCBS existe em DOIS lugares com semânticas diferentes:
 *    o que o prestador DECLARA na DPS (`DeclaracaoTributariaIBSCBS`) e o que o
 *    Ambiente de Dados Nacional CALCULA e devolve (`ResultadoCalculoIBSCBS`).
 *    Nós declaramos CST/cClassTrib/base; quem aplica alíquota e devolve valor é
 *    o Ambiente Nacional. Por isso os dois tipos são separados, e por isso o
 *    valor calculado é dado de auditoria — não recalculamos localmente.
 *
 * 2. CST e cClassTrib são `string` validada contra TABELA DE DOMÍNIO, nunca
 *    union type fechado. São 18 e 164 códigos hoje, mantidos por Nota Técnica —
 *    a própria pesquisa encontrou fontes divergindo sobre se o CST 220 foi
 *    removido. Enum fechado exigiria deploy a cada mudança de tabela.
 *
 * 3. O enum `RegimeIbsCbs` que já existe em `reforma.ts` NÃO é campo do XML.
 *    Ele continua válido como INTENÇÃO DE NEGÓCIO (elegibilidade, prévia de
 *    valor na UI), mas não substitui CST/cClassTrib. O mapeamento
 *    negócio → código fiscal é decisão contábil e ainda não existe — ver
 *    `PENDENCIAS_C5` no fim deste arquivo.
 */

import { z } from "zod";
import { type RegimeIbsCbs } from "./reforma";

// ---------------------------------------------------------------------------
// Tabela CST-IBS/CBS — 18 códigos
//
// Extraída ao vivo do DOM do Portal da Conformidade Fácil (SVRS/ENCAT) em
// 05/08/2026 — dado primário, a informação de maior confiança da pesquisa.
// O portal cobre 17 tipos de DF-e, NF-e e NFS-e INCLUÍDOS: é a mesma tabela
// de domínio para os dois documentos.
//
// Espelhada na migration `..._ibscbs_dominio.sql` (tabela `cst_ibscbs`). Aqui
// ela existe para validação em memória, sem I/O — o banco é a fonte para
// consulta/relatório, este objeto é a trava barata no caminho da emissão.
// ---------------------------------------------------------------------------

export interface DefinicaoCst {
  readonly codigo: string;
  readonly descricao: string;
  /** Quando false, a operação não é tributada (isenção, imunidade, monofasia...). */
  readonly exigeTributacao: boolean;
  readonly redBaseCalculo: boolean;
  readonly redAliquota: boolean;
  readonly transfCredito: boolean;
  readonly diferimento: boolean;
  readonly monofasica: boolean;
  readonly credPresZfm: boolean;
  readonly ajusteCompetencia: boolean;
}

export const TABELA_CST: readonly DefinicaoCst[] = [
  m("000", "Tributação integral", { exigeTributacao: true }),
  m("010", "Tributação com alíquotas uniformes", { exigeTributacao: true }),
  m("011", "Tributação com alíquotas uniformes reduzidas", {
    exigeTributacao: true,
    redAliquota: true,
  }),
  m("200", "Alíquota reduzida", { exigeTributacao: true, redAliquota: true }),
  m("220", "Alíquota fixa", { exigeTributacao: true }),
  m("221", "Alíquota fixa proporcional", { exigeTributacao: true }),
  m("222", "Redução de Base de Cálculo", { exigeTributacao: true, redBaseCalculo: true }),
  m("400", "Isenção", {}),
  m("410", "Imunidade e não incidência", {}),
  m("510", "Diferimento", { exigeTributacao: true, diferimento: true }),
  m("515", "Diferimento com redução de alíquota", {
    exigeTributacao: true,
    redAliquota: true,
    diferimento: true,
  }),
  m("550", "Suspensão", { exigeTributacao: true }),
  m("620", "Tributação Monofásica", { monofasica: true }),
  m("800", "Transferência de crédito", { transfCredito: true }),
  m("810", "Ajuste de IBS na ZFM", { credPresZfm: true }),
  m("811", "Ajustes", { ajusteCompetencia: true }),
  m("820", "Tributação em documento específico", {}),
  m("830", "Exclusão da Base de Cálculo", { exigeTributacao: true }),
] as const;

function m(
  codigo: string,
  descricao: string,
  flags: Partial<Omit<DefinicaoCst, "codigo" | "descricao">>,
): DefinicaoCst {
  return {
    codigo,
    descricao,
    exigeTributacao: flags.exigeTributacao ?? false,
    redBaseCalculo: flags.redBaseCalculo ?? false,
    redAliquota: flags.redAliquota ?? false,
    transfCredito: flags.transfCredito ?? false,
    diferimento: flags.diferimento ?? false,
    monofasica: flags.monofasica ?? false,
    credPresZfm: flags.credPresZfm ?? false,
    ajusteCompetencia: flags.ajusteCompetencia ?? false,
  };
}

const CST_POR_CODIGO = new Map(TABELA_CST.map((c) => [c.codigo, c]));

export function buscarCst(codigo: string): DefinicaoCst | null {
  return CST_POR_CODIGO.get(codigo) ?? null;
}

/**
 * Quantos cClassTrib cada CST tem na tabela oficial (164 no total).
 * Usada como verificação de integridade do seed: se a importação dos 164
 * códigos não bater com esta contagem, a importação está incompleta ou a
 * tabela mudou de versão — nos dois casos alguém precisa olhar.
 */
export const CCLASSTRIB_ESPERADOS_POR_CST: Readonly<Record<string, number>> = {
  "000": 5, "010": 2, "011": 5, "200": 54, "220": 3, "221": 4,
  "222": 1, "400": 2, "410": 38, "510": 1, "515": 1, "550": 25,
  "620": 7, "800": 2, "810": 1, "811": 3, "820": 9, "830": 1,
};

export const TOTAL_CCLASSTRIB_ESPERADO = 164;

/**
 * Dos 164 códigos, só 71 são aceitos em NFS-e — o portal informa, por código,
 * quais documentos fiscais o admitem. Declarar numa NFS-e um código exclusivo
 * de NF-e é rejeição certa. A migration de complemento grava isso na coluna
 * `aplica_nfse`, e a view `cclasstrib_nfse` já vem filtrada.
 */
export const TOTAL_CCLASSTRIB_NFSE = 71;

// ---------------------------------------------------------------------------
// Simples Nacional — NT-009
//
// A reforma exige declarar o regime de apuração POR TRIBUTO: uma empresa pode
// apurar CBS dentro do Simples e IBS pelo regime regular ao mesmo tempo (o
// "regime híbrido" da LC 214/2025). O `simples_por_fora` booleano que o
// projeto tem hoje não representa isso — é uma dimensão a mais, não menos.
// ---------------------------------------------------------------------------

export const SITUACAO_SIMPLES_NACIONAL = [
  "nao_optante",
  "mei",
  "me_epp",
  "optante_pendente",
] as const;
export type SituacaoSimplesNacional = (typeof SITUACAO_SIMPLES_NACIONAL)[number];

/** Código `opSimpNac` da NT-009 (1..4), na ordem da tabela oficial. */
export const OP_SIMP_NAC: Readonly<Record<SituacaoSimplesNacional, number>> = {
  nao_optante: 1,
  mei: 2,
  me_epp: 3,
  optante_pendente: 4,
};

export const REGIME_APURACAO_SN = [
  "ambos_pelo_sn",
  "cbs_sn_ibs_regular",
  "ambos_regime_regular",
] as const;
export type RegimeApuracaoIbsCbsSN = (typeof REGIME_APURACAO_SN)[number];

/** Código `regApIBSCBSSN` da NT-009 (1..3). */
export const REG_AP_IBSCBS_SN: Readonly<Record<RegimeApuracaoIbsCbsSN, number>> = {
  ambos_pelo_sn: 1,
  cbs_sn_ibs_regular: 2,
  ambos_regime_regular: 3,
};

// ---------------------------------------------------------------------------
// O que o prestador DECLARA (grupo .../DPS/infDPS/IBSCBS/valores/trib/gIBSCBS)
// ---------------------------------------------------------------------------

/** CST-IBS/CBS: exatamente 3 dígitos. Existência é validada contra a tabela. */
export const cstSchema = z.string().regex(/^\d{3}$/, "CST deve ter exatamente 3 dígitos");

/**
 * cClassTrib: exatamente 6 dígitos, e os 3 PRIMEIROS repetem o CST — regra
 * estrutural da tabela oficial, verificada em `validarDeclaracao`.
 */
export const cClassTribSchema = z
  .string()
  .regex(/^\d{6}$/, "cClassTrib deve ter exatamente 6 dígitos");

export const declaracaoIbsCbsSchema = z.object({
  cst: cstSchema,
  cClassTrib: cClassTribSchema,
  /** Código de crédito presumido (Anexo IV) — tabela própria, ainda não modelada. */
  cCredPres: z.string().regex(/^\d{2}$/).nullish(),
  /**
   * `gTribRegular`: "como seria a tributação regular" — exigido pela tabela de
   * cClassTrib em operações sob condição suspensiva/resolutória.
   */
  tribRegular: z
    .object({ cstRegular: cstSchema, cClassTribRegular: cClassTribSchema })
    .nullish(),
  /** `gDif`: percentuais de diferimento por esfera. Só cabe em CST 510 e 515. */
  diferimento: z
    .object({
      percentualUf: z.number().min(0).max(1).nullish(),
      percentualMun: z.number().min(0).max(1).nullish(),
      percentualCbs: z.number().min(0).max(1).nullish(),
    })
    .nullish(),
});

export type DeclaracaoTributariaIBSCBS = z.infer<typeof declaracaoIbsCbsSchema>;

/**
 * Intenção de negócio — NÃO vai no XML. É o que a UI e as regras de
 * elegibilidade usam para decidir qual CST/cClassTrib declarar.
 */
export interface IntencaoRegimeTributario {
  regime: RegimeIbsCbs;
  situacaoSimplesNacional: SituacaoSimplesNacional | null;
  regimeApuracaoSN: RegimeApuracaoIbsCbsSN | null;
}

/**
 * O que o Ambiente de Dados Nacional CALCULA e devolve (grupo
 * `NFSe/infNFSe/IBSCBS`). Dado de auditoria: persistir, nunca recalcular.
 * Alíquotas em fração (0.009 = 0,9%), valores em centavos (regra 15).
 */
export interface ResultadoCalculoIBSCBS {
  municipioIncidencia: { codigoIbge: string; nome: string } | null;
  baseCalculoCentavos: number;
  ibsUf: EsferaCalculada;
  ibsMun: EsferaCalculada;
  cbs: EsferaCalculada;
  ibsTotalCentavos: number;
  cbsTotalCentavos: number;
}

export interface EsferaCalculada {
  aliquotaParametrizada: number;
  percentualReducao: number;
  aliquotaEfetiva: number;
  valorCentavos: number;
}

/**
 * Fórmula confirmada por transcrição literal da NT-004:
 *   pAliqEfet = pAliqOriginal × (1 − pRedAliq) × (1 − pRedutor)
 * `pRedutor` só se aplica a compras governamentais; 0 no caso geral.
 */
export function aliquotaEfetiva(
  aliquotaOriginal: number,
  percentualReducao: number,
  percentualRedutor = 0,
): number {
  return aliquotaOriginal * (1 - percentualReducao) * (1 - percentualRedutor);
}

// ---------------------------------------------------------------------------
// Validação estrutural da declaração
//
// Cobre apenas as regras CONFIRMADAS pela pesquisa (seção 3.3): dependência de
// subgrupo por CST. A regra granular obrigatório/vedado campo a campo por CST
// está na lacuna 10 da pesquisa (documento de "Regras de Validação" não
// acessado) — não inventamos o que não foi confirmado.
// ---------------------------------------------------------------------------

export interface ResultadoValidacao {
  valido: boolean;
  erros: string[];
}

const CST_COM_DIFERIMENTO = new Set(["510", "515"]);

export function validarDeclaracao(
  declaracao: DeclaracaoTributariaIBSCBS,
  opcoes?: { cClassTribConhecidos?: ReadonlySet<string> },
): ResultadoValidacao {
  const erros: string[] = [];

  const cst = buscarCst(declaracao.cst);
  if (!cst) {
    erros.push(
      `CST "${declaracao.cst}" não existe na tabela CST-IBS/CBS (18 códigos vigentes)`,
    );
  }

  // Regra estrutural: cClassTrib = CST (3 dígitos) + sequencial (3 dígitos).
  if (!declaracao.cClassTrib.startsWith(declaracao.cst)) {
    erros.push(
      `cClassTrib "${declaracao.cClassTrib}" incompatível com o CST "${declaracao.cst}": ` +
        `os 3 primeiros dígitos do cClassTrib devem repetir o CST`,
    );
  }

  // Falha fechada: sem a tabela de domínio populada, não declaramos um código
  // que não sabemos se existe. Melhor recusar a emissão do que enviar um
  // enquadramento tributário inventado.
  const conhecidos = opcoes?.cClassTribConhecidos;
  if (conhecidos && !conhecidos.has(declaracao.cClassTrib)) {
    erros.push(
      `cClassTrib "${declaracao.cClassTrib}" não está na tabela de domínio ` +
        `(${TOTAL_CCLASSTRIB_ESPERADO} códigos oficiais) — importe a tabela antes de emitir`,
    );
  }

  // gDif: obrigatório em 510/515, vedado nos demais.
  const temDiferimento =
    declaracao.diferimento !== null && declaracao.diferimento !== undefined;
  if (cst) {
    if (CST_COM_DIFERIMENTO.has(cst.codigo) && !temDiferimento) {
      erros.push(`CST ${cst.codigo} (${cst.descricao}) exige o grupo de diferimento`);
    }
    if (!CST_COM_DIFERIMENTO.has(cst.codigo) && temDiferimento) {
      erros.push(
        `CST ${cst.codigo} (${cst.descricao}) não admite grupo de diferimento — ` +
          `só CST 510 e 515 admitem`,
      );
    }
  }

  // gTribRegular: quando presente, precisa ser internamente coerente.
  if (declaracao.tribRegular) {
    const { cstRegular, cClassTribRegular } = declaracao.tribRegular;
    if (!buscarCst(cstRegular)) {
      erros.push(`CST regular "${cstRegular}" não existe na tabela CST-IBS/CBS`);
    }
    if (!cClassTribRegular.startsWith(cstRegular)) {
      erros.push(
        `cClassTrib regular "${cClassTribRegular}" incompatível com o CST regular "${cstRegular}"`,
      );
    }
  }

  return { valido: erros.length === 0, erros };
}

// ---------------------------------------------------------------------------
// PENDÊNCIAS DO C5 — o que a pesquisa deixou EXPLICITAMENTE em aberto.
//
// Estão aqui, em código, para que ninguém trate como resolvido. Enquanto
// existirem, o grupo IBSCBS não deve ser habilitado em produção.
// ---------------------------------------------------------------------------

export const PENDENCIAS_C5 = [
  "Os 164 cClassTrib JÁ FORAM IMPORTADOS (migration de seed, conferidos " +
    "164/164 por CST). Falta ainda um serviço que leia a tabela e injete " +
    "`cClassTribConhecidos` em validarDeclaracao — hoje nenhum chamador passa " +
    "esse conjunto, então a trava de existência do código está inativa.",
  "As colunas de redução, os indicadores e o tipo de alíquota JÁ FORAM " +
    "PREENCHIDOS (migration de complemento). Falta usar `perc_reducao_ibs`/" +
    "`perc_reducao_cbs` no cálculo: hoje a redução ainda vem do enum " +
    "RegimeIbsCbs, não do cClassTrib declarado — os dois podem divergir.",
  "Só 71 dos 164 cClassTrib valem para NFS-e (coluna aplica_nfse). Nada no " +
    "código impede declarar um código exclusivo de NF-e numa NFS-e ainda.",
  "Construir o mapeamento negócio → CST/cClassTrib. O enum RegimeIbsCbs " +
    "(5 valores) não é suficiente para escolher entre 164 códigos, cada um " +
    "amarrado a um artigo da LC 214/2025. É decisão contábil, não técnica — " +
    "validar com contador antes de codificar.",
  "Confirmar o papel do NBS: a pesquisa sugere que ele é tabela de correlação " +
    "cruzada (Anexo VIII), não campo livre. Hoje é string opcional no input.",
  "Confirmar o caminho XML de opSimpNac/regApIBSCBSSN (dentro ou fora do " +
    "grupo IBSCBS) antes de montar o payload com esses campos.",
  "Confirmar se a fórmula de base de cálculo da NT-009 substitui ou coexiste " +
    "com a da NT-004.",
  "Não há data confirmada de obrigatoriedade do PREENCHIMENTO do grupo IBSCBS " +
    "na NFS-e — o Ato Conjunto 4/2026 rege a obrigatoriedade de EMISSÃO do " +
    "documento. A NF-e teve as datas de produção suspensas na NT 2025.002 " +
    "v1.51. Por isso o grupo é opcional e controlado por flag, não por data.",
  "Validar tudo contra o XSD oficial baixado fora do ambiente de pesquisa " +
    "antes de qualquer cálculo real em produção.",
] as const;
