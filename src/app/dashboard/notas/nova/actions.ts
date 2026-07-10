"use server";

import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { solicitarEmissao, solicitarEmissaoSchema } from "@/services/notas";

export interface EmissaoResult {
  ok: boolean;
  erro?: string;
  notaId?: string;
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

  // Reais ("1500,00") → centavos inteiros na fronteira (regra 15)
  const valorBruto = String(formData.get("valor") ?? "").replace(/\./g, "").replace(",", ".");
  const valorCentavos = Math.round(Number(valorBruto) * 100);

  const parse = solicitarEmissaoSchema.safeParse({
    empresaId: estado.empresaId, // SEMPRE da sessão (regra 3)
    clienteId: formData.get("clienteId"),
    descricaoServico: formData.get("descricaoServico"),
    codigoServico: String(formData.get("codigoServico") ?? "").trim().replace(",", "."),
    valorServicoCentavos: Number.isFinite(valorCentavos) ? valorCentavos : -1,
    aliquotaIss: Number(formData.get("aliquotaIss") ?? "0") / 100, // % → fração
    issRetido: formData.get("issRetido") === "on",
    competencia: new Date().toISOString().slice(0, 10),
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
