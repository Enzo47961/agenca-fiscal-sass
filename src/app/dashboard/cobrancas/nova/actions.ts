"use server";

import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { criarCobrancaParaCliente, novaCobrancaSchema } from "@/services/cobrancas";

export interface CobrancaResult {
  ok: boolean;
  erro?: string;
  linkFatura?: string | null;
  pagamentoId?: string;
}

export async function criarCobrancaAction(formData: FormData): Promise<CobrancaResult> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo !== "com_empresa") {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  const env = serverEnv();
  if (!env.ASAAS_API_KEY) {
    return {
      ok: false,
      erro: "Integração com o Asaas não configurada: adicione ASAAS_API_KEY nas variáveis de ambiente.",
    };
  }

  // Valor chega em reais ("199,90") → centavos inteiros na fronteira (regra 15)
  const valorBruto = String(formData.get("valor") ?? "").replace(/\./g, "").replace(",", ".");
  const valorCentavos = Math.round(Number(valorBruto) * 100);

  const parse = novaCobrancaSchema.safeParse({
    clienteId: formData.get("clienteId"),
    descricaoServico: formData.get("descricaoServico"),
    codigoServico: String(formData.get("codigoServico") ?? "").trim().replace(",", "."),
    valorCentavos: Number.isFinite(valorCentavos) ? valorCentavos : -1,
    vencimento: formData.get("vencimento"),
    aliquotaIss: Number(formData.get("aliquotaIss") ?? "0") / 100, // % → fração
    issRetido: formData.get("issRetido") === "on",
    codigoNbs: (formData.get("codigoNbs") as string | null)?.trim() || undefined,
    regimeIbsCbs: (formData.get("regimeIbsCbs") as string | null) || undefined,
  });
  if (!parse.success) {
    return { ok: false, erro: parse.error.errors[0]?.message ?? "Dados inválidos." };
  }

  try {
    const cobranca = await criarCobrancaParaCliente(
      db,
      { apiKey: env.ASAAS_API_KEY, baseUrl: env.ASAAS_BASE_URL },
      { empresaId: estado.empresaId, dados: parse.data },
    );
    return { ok: true, linkFatura: cobranca.linkFatura, pagamentoId: cobranca.pagamentoId };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao criar cobrança." };
  }
}
