"use server";

import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { dataCivilBr } from "@/lib/data-br";
import { solicitarEmissao, solicitarEmissaoSchema } from "@/services/notas";
import { correlacaoDoItem } from "@/services/dominio-fiscal";
import { type CorrelacaoItem } from "@/lib/fiscal/correlacao";

/**
 * Correlação oficial (Anexo VIII) do item de serviço digitado.
 *
 * Consultada sob demanda em vez de embarcada na página: são 281 correlações em
 * 207 itens, e o formulário precisa de UMA delas. Mandar a tabela inteira para
 * o browser a cada carregamento pagaria o custo de todas para usar uma.
 */
export async function consultarCorrelacaoAction(
  codigoServico: string,
): Promise<{ ok: true; correlacao: CorrelacaoItem } | { ok: false; erro: string }> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo !== "com_empresa") {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }
  try {
    return { ok: true, correlacao: await correlacaoDoItem(db, codigoServico) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao consultar a correlação." };
  }
}

export interface EmissaoResult {
  ok: boolean;
  erro?: string;
  notaId?: string;
}

/**
 * Reais digitados ("1.500,00") → centavos inteiros (regra 15).
 *
 * Campo VAZIO devolve `undefined`, não zero. A diferença importa: no ISSQN,
 * ausência manda derivar pela alíquota e zero manda não deduzir nada. Achatar
 * os dois em zero mudaria a base de cálculo sem ninguém pedir.
 */
function reaisParaCentavos(valor: FormDataEntryValue | null): number | undefined {
  const texto = String(valor ?? "").trim();
  if (texto === "") return undefined;
  const numero = Number(texto.replace(/\./g, "").replace(",", "."));
  // NaN vira -1 para que o schema recuse com mensagem de campo, em vez de
  // virar 0 em silêncio e emitir uma nota com base errada.
  return Number.isFinite(numero) ? Math.round(numero * 100) : -1;
}

/**
 * Emissão manual: cria a nota `pendente` e dispara o motor Inngest,
 * sem passar pelo fluxo de cobrança do Asaas (regra 5: nunca síncrono).
 */
export async function emitirNotaAction(formData: FormData): Promise<EmissaoResult> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo !== "com_empresa") {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  const valorCentavos = reaisParaCentavos(formData.get("valor"));

  const parse = solicitarEmissaoSchema.safeParse({
    empresaId: estado.empresaId, // SEMPRE da sessão (regra 3)
    clienteId: formData.get("clienteId"),
    descricaoServico: formData.get("descricaoServico"),
    codigoServico: String(formData.get("codigoServico") ?? "").trim().replace(",", "."),
    valorServicoCentavos: valorCentavos ?? -1,
    aliquotaIss: Number(formData.get("aliquotaIss") ?? "0") / 100, // % → fração
    issRetido: formData.get("issRetido") === "on",
    // Competência (B4). Duas correções num campo só:
    //
    // 1. FUSO. Era `new Date().toISOString().slice(0, 10)` — UTC. O Brasil está
    //    em UTC−3, então das 21h à meia-noite o "hoje" já era amanhã: uma nota
    //    das 22h de 31/08 nascia com competência 2026-09-01, no mês errado de
    //    apuração. `dataCivilBr()` lê o calendário de quem emite.
    //
    // 2. ESCOLHA. Era sempre "hoje", sem alternativa. Emitir no dia 2 uma nota
    //    do serviço prestado no mês anterior era impossível — e isso é rotina
    //    de escritório de contabilidade, não caso raro. Agora o formulário
    //    manda o valor; ausente, cai em hoje, que continua sendo o caso comum.
    competencia: String(formData.get("competencia") ?? "").trim() || dataCivilBr(),
    codigoNbs: (formData.get("codigoNbs") as string | null)?.trim() || undefined,
    regimeIbsCbs: (formData.get("regimeIbsCbs") as string | null) || undefined,
    // Componentes da base de cálculo (B7). Campo em branco → `undefined`, que
    // o schema resolve: zero nos que têm default, derivação no ISSQN.
    descontoIncondicionadoCentavos: reaisParaCentavos(formData.get("descontoIncondicionado")),
    // Lista de objetos aninhados: viaja como JSON porque FormData e plano. O
    // parse solto devolve `undefined` para o schema recusar com mensagem de
    // campo, em vez de derrubar a action com SyntaxError.
    documentosAjusteBase: (() => {
      const bruto = String(formData.get("documentosAjusteBase") ?? "").trim();
      if (!bruto) return undefined;
      try {
        return JSON.parse(bruto) as unknown;
      } catch {
        return undefined;
      }
    })(),
    tipoAjusteBase: (formData.get("tipoAjusteBase") as string | null) || undefined,
    issqnCentavos: reaisParaCentavos(formData.get("issqn")),
    pisCentavos: reaisParaCentavos(formData.get("pis")),
    cofinsCentavos: reaisParaCentavos(formData.get("cofins")),
    // C7: o checkbox vem do formulário, mas QUEM confirmou vem da sessão
    // (regra 3) — aceitar o autor do cliente permitiria atribuir a
    // confirmação a outra pessoa.
    confirmacaoRegimeDiferenciado: formData.get("confirmacaoRegime") === "on",
    confirmadoPorUserId: estado.userId,
    // Grupo IBSCBS escolhido na tela. Ausente = o serviço decide: preenche
    // sozinho se a correlação oficial for da categoria A, e deixa em branco
    // nos demais casos.
    declaracaoIbsCbs: (() => {
      const cClassTrib = String(formData.get("ibscbsCClassTrib") ?? "").trim();
      if (!cClassTrib) return undefined;
      // Os 3 primeiros dígitos do cClassTrib SÃO o CST — regra estrutural da
      // tabela oficial. Derivar evita que a tela mande um par incoerente.
      const cClassTribRegular = String(formData.get("ibscbsCClassTribReg") ?? "").trim();
      return {
        cst: cClassTrib.slice(0, 3),
        cClassTrib,
        // Tributação regular: informada à mão por quem emite, pela mesma regra
        // estrutural. O sistema não deduz o par — ver o comentário em
        // `solicitarEmissao`.
        tribRegular: cClassTribRegular
          ? { cstRegular: cClassTribRegular.slice(0, 3), cClassTribRegular }
          : undefined,
      };
    })(),
  });
  if (!parse.success) {
    return { ok: false, erro: parse.error.errors[0]?.message ?? "Dados inválidos." };
  }

  try {
    const { notaId } = await solicitarEmissao(db, parse.data);
    return { ok: true, notaId };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao solicitar emissão." };
  }
}
