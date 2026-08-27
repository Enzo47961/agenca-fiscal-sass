"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";
import { EVENTO_SINCRONIZACAO_SOLICITADA } from "@/inngest/events";
import { providersDisponiveis } from "@/lib/fiscal/providers";
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

// ---------------------------------------------------------------------------
// Preparar a carteira para emissão real
// ---------------------------------------------------------------------------

export type ResultadoPreparacaoAction =
  | { ok: false; erro: string }
  | { ok: true; enfileiradas: number; jaProntas: number };

/**
 * Marca a carteira para emissão real e enfileira o cadastro no provedor fiscal.
 *
 * POR QUE É UM BOTÃO E NÃO EFEITO AUTOMÁTICO DA IMPORTAÇÃO. Cadastrar empresa
 * no provedor é efeito colateral EXTERNO, numa conta paga: uma importação de
 * teste passaria a criar CNPJs de verdade lá, e desfazer isso do nosso lado não
 * é possível. Quem decide cruzar essa fronteira é o usuário, num gesto próprio.
 *
 * O ALCANCE NÃO VEM DO CLIENTE (regra 3). A consulta abaixo roda no client de
 * SESSÃO, então a RLS já a limita à carteira de quem clicou — não há lista de
 * ids no corpo da requisição para alguém forjar. O job, que roda com o client
 * admin e ignora RLS, recebe pronta uma lista que a própria política construiu.
 */
export async function prepararCarteiraAction(): Promise<ResultadoPreparacaoAction> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  const focus = providersDisponiveis().find((p) => p.nome === "focusnfe");
  if (!focus?.disponivel) {
    return {
      ok: false,
      erro:
        focus?.motivoIndisponivel ??
        "A emissão real ainda não está configurada. Fale com o suporte antes de preparar a carteira.",
    };
  }

  const { data: empresas, error } = await db.from("empresas").select("id, provider_status");
  if (error) {
    return { ok: false, erro: `Não foi possível ler a carteira: ${error.message}` };
  }
  if (!empresas || empresas.length === 0) {
    return { ok: false, erro: "Não há empresas na carteira para preparar." };
  }

  const pendentes = empresas.filter((e) => e.provider_status !== "cadastrada");
  const jaProntas = empresas.length - pendentes.length;

  if (pendentes.length === 0) {
    return { ok: true, enfileiradas: 0, jaProntas };
  }

  const ids = pendentes.map((e) => e.id);

  // A troca para emissão real passa pela RLS: quem não for owner/admin não
  // altera dado fiscal, e a política recusa em silêncio devolvendo zero linhas.
  const { error: erroProvider } = await db
    .from("empresas")
    .update({ provider_fiscal: "focusnfe" })
    .in("id", ids);
  if (erroProvider) {
    return {
      ok: false,
      erro:
        "Não foi possível marcar as empresas para emissão real. Confira se o seu " +
        `acesso permite alterar dados fiscais. (${erroProvider.message})`,
    };
  }

  await inngest.send({
    name: EVENTO_SINCRONIZACAO_SOLICITADA,
    data: { empresaIds: ids },
  });

  revalidatePath("/dashboard/empresas/importar");
  revalidatePath("/dashboard/relatorios");

  return { ok: true, enfileiradas: ids.length, jaProntas };
}
