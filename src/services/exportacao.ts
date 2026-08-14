import { z } from "zod";

/**
 * EXPORTAÇÃO DE XMLs POR COMPETÊNCIA
 *
 * O escritório de contabilidade não quer baixar nota por nota: ele quer o lote
 * do mês para importar no sistema contábil dele. Entregar o XML unitário — o
 * que já fazemos no painel e no e-mail — resolve o caso avulso e não resolve o
 * fechamento mensal, que é o trabalho de verdade.
 *
 * As funções puras vivem aqui, fora do route handler, para terem teste sem
 * rede nem banco (regra 20).
 */

/** Competência de exportação: mês inteiro, no formato AAAA-MM. */
export const competenciaExportacaoSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência deve ser AAAA-MM (ex.: 2026-08).");

export type EscopoExportacao = "empresa" | "carteira";
export const escopoExportacaoSchema = z.enum(["empresa", "carteira"]).default("empresa");

/**
 * Teto de notas por exportação.
 *
 * Não é limite do ZIP (que aguenta 65.535) nem do formato: é do TEMPO. Cada XML
 * é buscado no provider por HTTP, e uma função serverless tem prazo para
 * responder. Melhor recusar com uma mensagem que ensina a estreitar o filtro do
 * que devolver um ZIP truncado — que pareceria completo e entraria incompleto
 * na contabilidade.
 */
export const TETO_EXPORTACAO = 500;

/** Primeiro dia e primeiro dia do mês seguinte — intervalo [início, fim). */
export function intervaloDaCompetencia(competencia: string): { inicio: string; fimExclusivo: string } {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 1));
  return {
    inicio: inicio.toISOString(),
    fimExclusivo: fim.toISOString(),
  };
}

export interface NotaExportavel {
  numeroNfse: string | null;
  cnpjEmpresa: string;
  urlXml: string | null;
}

/**
 * Nome do arquivo dentro do ZIP.
 *
 * Leva o CNPJ porque na exportação da carteira inteira convivem notas de
 * empresas diferentes, e número de NFS-e é sequencial POR prestador — dois
 * clientes do escritório podem ter, ambos, a nota nº 1. Sem o CNPJ, uma
 * sobrescreveria a outra na hora de extrair.
 *
 * O índice desempata o resto: nota sem número (caso raro, provider que não
 * devolveu) não pode colidir com outra igualmente sem número.
 */
export function nomeArquivoXml(nota: NotaExportavel, indice: number): string {
  const cnpj = nota.cnpjEmpresa.replace(/\D/g, "") || "sem-cnpj";
  const numero = (nota.numeroNfse ?? "").replace(/[^\w-]/g, "") || `sem-numero-${indice + 1}`;
  return `${cnpj}-nfse-${numero}.xml`;
}

/** Nome do ZIP entregue ao usuário. */
export function nomeDoPacote(competencia: string, escopo: EscopoExportacao): string {
  return `nfse-${competencia}-${escopo}.zip`;
}

export interface ResumoExportacao {
  /** Notas emitidas na competência. */
  total: number;
  /** Quantas tinham XML disponível — as que entram no pacote. */
  comXml: number;
  /** Emitidas sem XML: provider de simulação, ou emissão antiga. */
  semXml: number;
}

export function resumirExportacao(notas: readonly NotaExportavel[]): ResumoExportacao {
  const comXml = notas.filter((n) => Boolean(n.urlXml)).length;
  return { total: notas.length, comXml, semXml: notas.length - comXml };
}

/**
 * Baixa os XMLs com paralelismo limitado.
 *
 * O limite existe dos dois lados: não abrir centenas de conexões de uma vez
 * contra o provider (que pode nos limitar por taxa) e não estourar memória.
 *
 * Falha de UM arquivo não derruba o lote: ela vira ausência, contada no
 * resultado. Um ZIP com 498 de 500 notas e um aviso claro é mais útil que erro
 * seco — e o aviso é o que permite descobrir a nota problemática.
 */
export async function baixarXmls(
  notas: readonly NotaExportavel[],
  buscar: (url: string) => Promise<Uint8Array>,
  paralelismo = 8,
): Promise<{ arquivos: Array<{ nome: string; conteudo: Uint8Array }>; falhas: number }> {
  const comXml = notas
    .map((nota, indice) => ({ nota, indice }))
    .filter(({ nota }) => Boolean(nota.urlXml));

  const arquivos: Array<{ nome: string; conteudo: Uint8Array }> = [];
  let falhas = 0;

  for (let i = 0; i < comXml.length; i += paralelismo) {
    const lote = comXml.slice(i, i + paralelismo);
    const resultados = await Promise.all(
      lote.map(async ({ nota, indice }) => {
        try {
          const conteudo = await buscar(nota.urlXml as string);
          return { nome: nomeArquivoXml(nota, indice), conteudo };
        } catch {
          return null;
        }
      }),
    );
    for (const r of resultados) {
      if (r) arquivos.push(r);
      else falhas += 1;
    }
  }

  return { arquivos, falhas };
}
