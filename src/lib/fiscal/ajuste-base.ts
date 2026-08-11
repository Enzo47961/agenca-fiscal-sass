import { z } from "zod";
import { type Centavos } from "@/types/domain";

/**
 * DOCUMENTOS QUE AJUSTAM A BASE DE CÁLCULO DO IBS/CBS.
 *
 * O ajuste de base NÃO é um valor que se digita. A DPS referencia os
 * DOCUMENTOS que originam o reembolso, repasse ou ressarcimento — um a um, com
 * tipo, identificação e valor — e o Ambiente de Dados Nacional soma, produzindo
 * `vCalcAjusteBCIBSCBS` do lado NFS-e. O prefixo `vCalc` é a pista: valor
 * calculado, como o vBC.
 *
 * Foi essa descoberta que derrubou a modelagem anterior, em que `ajusteBase`
 * era um total digitado. Um total não vira lista, e mandá-lo sozinho faria a
 * nota sair com base maior que a prévia, em silêncio.
 *
 * DUAS REDAÇÕES OFICIAIS, MESMO FATO. O Anexo VI V1.04.00 (NT-009) unificou o
 * grupo em `vAjusteBC/documentos/docAjusteBC`, com `tpAjusteBC`, `vTotDoc` e
 * `vAjuteAplic`. A referência de campos da Focus ainda expõe a redação anterior
 * (NT-004): `documentos_referenciados`, coleção de 1 a 100, com `tpReeRepRes` e
 * `vlrReeRepRes`.
 *
 * Modelamos a redação da FOCUS, não a da NT-009, e a razão é prática: é ela que
 * de fato transmite. Modelar o que não temos como enviar seria repetir o erro
 * que estamos corrigindo. Quando a Focus migrar para a redação nova, o mapa
 * muda no provider e este módulo continua válido — os conceitos são os mesmos.
 *
 * FONTE: campos.focusnfe.com.br/nfse_nacional/EmissaoDPSXml.html (grupo
 * `documentos_referenciados`) e Anexo VI V1.04.00 do portal da NFS-e.
 */

/** `tpReeRepRes` — domínio oficial, transcrito da referência de campos. */
export const TIPO_AJUSTE_DOC = ["01", "02", "03", "04", "99"] as const;
export type TipoAjusteDoc = (typeof TIPO_AJUSTE_DOC)[number];

export const TIPO_AJUSTE_DOC_LABEL: Record<TipoAjusteDoc, string> = {
  "01": "Repasse de remuneração por intermediação de imóveis a demais corretores envolvidos na operação",
  "02": "Repasse de valores a fornecedor relativo a fornecimento intermediado por agência de turismo",
  "03": "Reembolso ou ressarcimento recebido por agência de propaganda e publicidade por valores pagos relativos a serviços de produção externa por conta e ordem de terceiro",
  "04": "Reembolso ou ressarcimento recebido por agência de propaganda e publicidade por valores pagos relativos a serviços de mídia por conta e ordem de terceiro",
  "99": "Outros reembolsos ou ressarcimentos recebidos por valores pagos relativos a operações por conta e ordem de terceiro",
};

/** `tipoChaveDFe` — qual documento do Repositório Nacional a chave referencia. */
export const TIPO_CHAVE_DFE = ["1", "2", "3", "9"] as const;
export type TipoChaveDFe = (typeof TIPO_CHAVE_DFE)[number];

export const TIPO_CHAVE_DFE_LABEL: Record<TipoChaveDFe, string> = {
  "1": "NFS-e",
  "2": "NF-e",
  "3": "CT-e",
  "9": "Outro",
};

/**
 * Como o documento é identificado. São três caminhos EXCLUDENTES, e a exclusão
 * é do próprio leiaute: um documento está no Repositório Nacional (e aí tem
 * chave), ou é fiscal e está fora dele (município + número), ou não é fiscal
 * (número + descrição).
 */
const dfeNacionalSchema = z.object({
  forma: z.literal("dfe_nacional"),
  tipoChaveDFe: z.enum(TIPO_CHAVE_DFE),
  /** `xTipoChaveDFe` — exigido só quando o tipo é "9 = Outro". */
  descricaoTipoChave: z.string().max(255).nullish(),
  chaveDFe: z.string().min(1).max(50),
});

const docFiscalOutroSchema = z.object({
  forma: z.literal("doc_fiscal_outro"),
  codigoMunicipio: z.string().regex(/^\d{7}$/, "Código IBGE deve ter 7 dígitos"),
  numero: z.string().min(1).max(255),
  descricao: z.string().min(1).max(255),
});

const docNaoFiscalSchema = z.object({
  forma: z.literal("doc_nao_fiscal"),
  numero: z.string().min(1).max(255),
  descricao: z.string().min(1).max(255),
});

export const documentoAjusteBaseSchema = z
  .object({
    tipo: z.enum(TIPO_AJUSTE_DOC),
    /** `xTpReeRepRes` — exigido quando o tipo é "99 = Outros". */
    descricaoTipo: z.string().max(255).nullish(),
    /** `vlrReeRepRes`, em centavos (regra 15). */
    valorCentavos: z.number().int().positive(),
    identificacao: z.discriminatedUnion("forma", [
      dfeNacionalSchema,
      docFiscalOutroSchema,
      docNaoFiscalSchema,
    ]),
  })
  .superRefine((d, ctx) => {
    // "99 = Outros" sem descrição é documento que ninguém consegue auditar
    // depois — e a própria referência marca `xTpReeRepRes` como exigido aí.
    if (d.tipo === "99" && !d.descricaoTipo?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["descricaoTipo"],
        message: 'Tipo "99 — Outros" exige a descrição do reembolso ou ressarcimento.',
      });
    }
    if (
      d.identificacao.forma === "dfe_nacional" &&
      d.identificacao.tipoChaveDFe === "9" &&
      !d.identificacao.descricaoTipoChave?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identificacao", "descricaoTipoChave"],
        message: 'Tipo de chave "9 — Outro" exige a descrição do documento.',
      });
    }
  });

export type DocumentoAjusteBase = z.infer<typeof documentoAjusteBaseSchema>;

/** A coleção é de 1 a 100 documentos na referência da Focus. */
export const MAX_DOCUMENTOS_AJUSTE = 100;

export const documentosAjusteBaseSchema = z
  .array(documentoAjusteBaseSchema)
  .max(
    MAX_DOCUMENTOS_AJUSTE,
    `A nota aceita no máximo ${MAX_DOCUMENTOS_AJUSTE} documentos de ajuste.`,
  )
  .default([]);

/**
 * Total do ajuste — a soma dos documentos, nunca um número digitado.
 *
 * Existe como função (e não como `reduce` espalhado) porque é ela que define o
 * contrato: se algum dia o cálculo deixar de ser soma simples, muda aqui e o
 * resto acompanha.
 */
export function somarAjusteBase(documentos: readonly DocumentoAjusteBase[]): Centavos {
  return documentos.reduce((total, d) => total + d.valorCentavos, 0);
}

/**
 * Reconstrói a lista a partir da coluna JSONB de `notas_fiscais`.
 *
 * Mesmo papel de `declaracaoDeColunas` e `baseDeColunas`, e pela mesma razão
 * (armadilha 1 do HANDOFF): ler a coluna e devolver domínio é lógica de
 * domínio, e no motor ela não teria teste.
 *
 * Revalida com o schema em vez de confiar no JSONB. Não é paranoia: a coluna
 * aceita qualquer array, e um documento gravado por versão anterior — ou por
 * uma escrita fora do serviço — chegaria aqui malformado e viraria payload
 * inválido lá na frente, longe da causa. Documento que não valida é DESCARTADO
 * com o resto preservado: perder um item é ruim, mas derrubar a emissão inteira
 * de uma nota já criada é pior, e o total gravado continua sendo a referência
 * de conferência contra o que o Fisco devolver.
 */
export function documentosAjusteDeColuna(coluna: unknown): DocumentoAjusteBase[] {
  if (!Array.isArray(coluna)) return [];
  const validos: DocumentoAjusteBase[] = [];
  for (const item of coluna) {
    const r = documentoAjusteBaseSchema.safeParse(item);
    if (r.success) validos.push(r.data);
  }
  return validos;
}

/**
 * Rótulo curto para tela e para o resumo da nota. O texto oficial do tipo passa
 * de 150 caracteres e não cabe numa linha de lista.
 */
export function resumoDocumento(d: DocumentoAjusteBase): string {
  const id = d.identificacao;
  switch (id.forma) {
    case "dfe_nacional":
      return `${TIPO_CHAVE_DFE_LABEL[id.tipoChaveDFe]} ${id.chaveDFe}`;
    case "doc_fiscal_outro":
      return `Doc. fiscal ${id.numero} (município ${id.codigoMunicipio})`;
    case "doc_nao_fiscal":
      return `Doc. não fiscal ${id.numero}`;
  }
}
