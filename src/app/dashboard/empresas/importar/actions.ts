"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import {
  MAX_LINHAS_IMPORTACAO,
  analisarCsv,
  importarEmpresas,
  type LinhaComErro,
} from "@/services/importacao";

export type ResultadoImportacaoAction =
  | { ok: false; erro: string; colunasFaltando?: string[] }
  | { ok: true; importadas: number; erros: LinhaComErro[]; total: number };

/**
 * Importa empresas a partir de um CSV.
 *
 * O ARQUIVO CHEGA COMO TEXTO, lido no cliente. Não subimos o arquivo para
 * storage: ele contém CNPJ e e-mail de terceiros — os clientes do escritório —
 * e guardar uma cópia de dados pessoais que já vão para o banco de forma
 * estruturada seria criar um segundo lugar de onde eles podem vazar. É a mesma
 * razão de o certificado A1 não ficar conosco.
 *
 * ANALISA TUDO, DEPOIS GRAVA. Assim o relatório de erros sai completo de uma
 * vez, em vez de um erro por rodada de tentativa.
 */
export async function importarEmpresasAction(csv: string): Promise<ResultadoImportacaoAction> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  // `sem_empresa` também vale: importar é justamente como um escritório novo
  // cria a carteira inteira, e exigir uma empresa manual antes seria burocracia.
  if (estado.tipo === "deslogado") {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  if (csv.trim().length === 0) {
    return { ok: false, erro: "Arquivo vazio." };
  }

  const analise = analisarCsv(csv);

  if (analise.colunasFaltando.length > 0) {
    return {
      ok: false,
      erro: "O arquivo não tem todas as colunas obrigatórias.",
      colunasFaltando: analise.colunasFaltando,
    };
  }

  const total = analise.validas.length + analise.erros.length;
  if (total === 0) {
    return { ok: false, erro: "Nenhuma linha de dados encontrada além do cabeçalho." };
  }
  if (total > MAX_LINHAS_IMPORTACAO) {
    return {
      ok: false,
      erro:
        `O arquivo tem ${total} linhas e o limite por importação é ${MAX_LINHAS_IMPORTACAO}. ` +
        "Divida em arquivos menores — cada empresa é criada numa transação própria.",
    };
  }

  const { importadas, erros } = await importarEmpresas(db, analise.validas);
  revalidatePath("/dashboard");

  return { ok: true, importadas, erros: [...analise.erros, ...erros], total };
}
