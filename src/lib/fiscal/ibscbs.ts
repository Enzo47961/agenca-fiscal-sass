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

/**
 * Rótulos para UI. Descrevem o que a escolha FAZ (onde cada tributo é apurado),
 * sem prometer valor de crédito ao tomador — a regra de crédito do Simples sob
 * a LC 214/2025 ainda não está definida, e a tela já prometeu isso uma vez
 * sem nada por trás (item A6).
 */
export const REGIME_APURACAO_SN_LABEL: Record<RegimeApuracaoIbsCbsSN, string> = {
  ambos_pelo_sn: "IBS e CBS pelo Simples Nacional (padrão)",
  cbs_sn_ibs_regular: "CBS pelo Simples, IBS pelo regime regular (híbrido)",
  ambos_regime_regular: "IBS e CBS pelo regime regular",
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

/**
 * Reconstrói a declaração a partir das colunas de `notas_fiscais`.
 *
 * É a ponte entre o que foi PERSISTIDO na criação e o que é DECLARADO na
 * emissão. Se ela errar, a declaração fica gravada no banco e some no caminho
 * para a prefeitura — falha silenciosa, sem erro nenhum. Por isso vive aqui,
 * no domínio puro, e não dentro da função Inngest: assim é testável sem mock.
 *
 * `null` quando o CST não foi declarado — o caso normal hoje. O par
 * CST/cClassTrib é garantido por CHECK no banco, então se um existe o outro
 * também existe; a checagem dupla abaixo é defensiva.
 */
export function declaracaoDeColunas(nota: {
  ibscbs_cst: string | null;
  ibscbs_cclasstrib: string | null;
  ibscbs_ccredpres: string | null;
  ibscbs_trib_reg_cst: string | null;
  ibscbs_trib_reg_cclasstrib: string | null;
  ibscbs_dif_perc_uf: number | null;
  ibscbs_dif_perc_mun: number | null;
  ibscbs_dif_perc_cbs: number | null;
}): DeclaracaoTributariaIBSCBS | null {
  if (!nota.ibscbs_cst || !nota.ibscbs_cclasstrib) return null;

  const temDiferimento =
    nota.ibscbs_dif_perc_uf !== null ||
    nota.ibscbs_dif_perc_mun !== null ||
    nota.ibscbs_dif_perc_cbs !== null;

  return {
    cst: nota.ibscbs_cst,
    cClassTrib: nota.ibscbs_cclasstrib,
    cCredPres: nota.ibscbs_ccredpres,
    tribRegular:
      nota.ibscbs_trib_reg_cst && nota.ibscbs_trib_reg_cclasstrib
        ? {
            cstRegular: nota.ibscbs_trib_reg_cst,
            cClassTribRegular: nota.ibscbs_trib_reg_cclasstrib,
          }
        : null,
    diferimento: temDiferimento
      ? {
          percentualUf: nota.ibscbs_dif_perc_uf,
          percentualMun: nota.ibscbs_dif_perc_mun,
          percentualCbs: nota.ibscbs_dif_perc_cbs,
        }
      : null,
  };
}

/**
 * Monta a intenção de regime tributário de uma nota (item A6).
 *
 * Aqui mora o efeito que `simples_por_fora` prometia e não tinha: a escolha do
 * regime de apuração deixa de ser um campo guardado e passa a acompanhar a
 * nota até o provider.
 *
 * VIGÊNCIA é o ponto delicado. A opção pelo regime regular é um ato com data, e
 * o que vale para uma nota é o regime na COMPETÊNCIA dela — não o que está
 * marcado hoje. Uma nota de competência anterior à opção sai como
 * `ambos_pelo_sn`, senão uma opção feita em junho reescreveria retroativamente
 * a apuração de janeiro a maio.
 *
 * Quando a data é desconhecida (`null`), a opção é honrada sem recorte
 * temporal. É o estado de quem já usava a marcação booleana antiga, que a
 * migration não teve como datar sem inventar vigência. Ignorar a escolha nesse
 * caso seria pior: descartaria em silêncio uma declaração explícita do
 * contribuinte.
 *
 * Função pura e testada de propósito — reconstruir isto dentro da função
 * Inngest é a armadilha 1 do HANDOFF.
 */
export function intencaoDeColunas(params: {
  regime: RegimeIbsCbs;
  /** Competência da nota, ISO `yyyy-mm-dd`. */
  competencia: string;
  situacaoSimplesNacional: SituacaoSimplesNacional;
  regimeApuracaoSN: RegimeApuracaoIbsCbsSN | null;
  dataOpcaoRegimeRegular: string | null;
}): IntencaoRegimeTributario {
  // Quem não é optante não tem regime de apuração do Simples a declarar:
  // apura pelo regime regular por definição.
  if (params.situacaoSimplesNacional === "nao_optante") {
    return {
      regime: params.regime,
      situacaoSimplesNacional: "nao_optante",
      regimeApuracaoSN: null,
    };
  }

  const declarado = params.regimeApuracaoSN ?? "ambos_pelo_sn";
  const envolveRegimeRegular =
    declarado === "cbs_sn_ibs_regular" || declarado === "ambos_regime_regular";

  // Comparação de datas ISO como string funciona porque `yyyy-mm-dd` é
  // lexicograficamente ordenado — e evita fuso horário, que aqui só teria como
  // introduzir erro de um dia na virada da competência.
  const aindaNaoVigente =
    envolveRegimeRegular &&
    params.dataOpcaoRegimeRegular !== null &&
    params.competencia < params.dataOpcaoRegimeRegular;

  return {
    regime: params.regime,
    situacaoSimplesNacional: params.situacaoSimplesNacional,
    regimeApuracaoSN: aindaNaoVigente ? "ambos_pelo_sn" : declarado,
  };
}

// ---------------------------------------------------------------------------
// PENDÊNCIAS DO C5 — o que a pesquisa deixou EXPLICITAMENTE em aberto.
//
// Estão aqui, em código, para que ninguém trate como resolvido. Enquanto
// existirem, o grupo IBSCBS não deve ser habilitado em produção.
// ---------------------------------------------------------------------------

export const PENDENCIAS_C5 = [
  "O caminho de dados do grupo IBSCBS está COMPLETO da API ao provider. " +
    "Falta a UI: nenhum formulário coleta CST/cClassTrib ainda. Quando for " +
    "feita, usar a view `cclasstrib_nfse` para oferecer só os 71 códigos " +
    "válidos, em vez dos 164.",
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
  // RESOLVIDA em 06/08/2026 pela leitura das duas NTs na fonte oficial
  // (gov.br/nfse). Mantida no array em vez de apagada, para registrar a
  // resposta — quem ler depois não deve precisar refazer a mesma dúvida.
  "RESOLVIDA — NT-004 vs NT-009 na base de cálculo: não há divergência nem " +
    "coexistência a resolver. A NT-009 ATUALIZA a NT-004 (mesma estrutura, com " +
    "`vCalcReeRepRes` renomeado para `vCalcAjusteBCIBSCBS` e a alternativa " +
    "`vCalcAjusteBCLocImoveis` acrescentada, para locação de imóveis). " +
    "Implementada em calcularBaseIbsCbs() na redação da NT-009.",
  // RESOLVIDA em 10/08/2026 (B7, segunda metade). Mantida no array em vez de
  // apagada, pelo mesmo motivo da anterior: registrar o que mudou.
  "RESOLVIDA — o vBC está LIGADO ao fluxo: solicitarEmissaoSchema recebe os " +
    "seis componentes, solicitarEmissao chama calcularBaseIbsCbs() e grava " +
    "resultado e termos nas colunas, o formulário de emissão manual os coleta " +
    "e o motor manda a base ao provider via baseCalculo. O destaque de CBS/IBS " +
    "passou a incidir sobre o vBC, não mais sobre o valor bruto.",
  // RESOLVIDA em 10/08/2026 pela referência de campos da Focus para NFS-e
  // nacional, cruzada com o leiaute do Anexo VI.
  "RESOLVIDA — o vBC NÃO deve ser enviado, e não é: no Anexo VI ele mora em " +
    "NFSe/infNFSe/IBSCBS/valores/vBC, lado NFS-e, calculado pelo Ambiente de " +
    "Dados Nacional. A DPS manda os COMPONENTES, e agora mandamos: CST, " +
    "cCredPres, desconto incondicionado, PIS, COFINS, opSimpNac e regApTribSN. " +
    "O CST tem campo próprio (`ibs_cbs_situacao_tributaria`) — a suposição " +
    "anterior de que a Focus não o expunha estava errada.",
  "O ajuste de base (vCalcAjusteBCIBSCBS / vCalcAjusteBCLocImoveis) não aparece " +
    "na referência de campos da Focus. Segue sem ser enviado: quem trabalha com " +
    "reembolso/repasse ou locação de imóvel terá o ajuste ignorado pelo Fisco " +
    "até o nome do campo ser confirmado na homologação.",
  "Códigos com exigeGrupoTributacaoRegular (550016 Reidi, 550022 Rehidro) são " +
    "RECUSADOS na criação da nota: o grupo gTribRegular é obrigatório para eles " +
    "(RN 733/734, E0964/E0965) e nenhuma fonte diz qual par CSTReg/cClassTribReg " +
    "declarar. É enquadramento, não regra técnica. Nenhum dos dois é " +
    "correlacionado pelo Anexo VIII, então a UI nunca os oferece.",
  "O lado CALCULADO do retorno (gTribSN com pIBSSN/vIBSSN/pCBSSN, e " +
    "vReceitaBrutaSN) é o que prova quanto de crédito o tomador aproveita — " +
    "art. 47 §9º II da LC 214/2025. Os campos existem no Anexo VI, mas a " +
    "referência de RETORNO da Focus respondeu HTTP 403 e não deu para descobrir " +
    "os nomes na resposta deles. NENHUMA coluna foi criada para isso: coluna sem " +
    "quem a preencha é exatamente o defeito que o A6 corrigiu.",
  "As alíquotas de 2027+ NÃO estão fixadas por Resolução do Senado. " +
    "aliquotasReferencia() agora lança AliquotaNaoFixadaError nesses anos, em " +
    "vez de devolver o par de teste de 2026 — mas isso significa que a emissão " +
    "PARA a partir de 01/01/2027 até alguém configurar o valor publicado.",
  "Não há data confirmada de obrigatoriedade do PREENCHIMENTO do grupo IBSCBS " +
    "na NFS-e — o Ato Conjunto 4/2026 rege a obrigatoriedade de EMISSÃO do " +
    "documento. A NF-e teve as datas de produção suspensas na NT 2025.002 " +
    "v1.51. Por isso o grupo é opcional e controlado por flag, não por data.",
  "Validar tudo contra o XSD oficial baixado fora do ambiente de pesquisa " +
    "antes de qualquer cálculo real em produção.",
] as const;
