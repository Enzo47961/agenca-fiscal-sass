import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import {
  criarCobranca,
  obterOuCriarCustomer,
  type AsaasConfig,
} from "@/lib/billing/asaas";
import {
  calcularFaturaExcedente,
  competenciaMesAnterior,
  descricaoFaturaExcedente,
  intervaloDoMes,
  vencimentoEmDias,
} from "@/services/excedente";
import { type FaturaExcedenteRef } from "@/services/faturas";

/**
 * COBRANÇA MENSAL AGREGADA DE EXCEDENTES (modelo "conta de luz").
 *
 * Roda no dia 1 de cada mês e fatura o MÊS ANTERIOR: para cada empresa com
 * assinatura cobrável, soma as notas marcadas `excedente` ainda não faturadas e
 * gera UMA cobrança Asaas agregada. Carimba as notas com a fatura para nunca
 * cobrar duas vezes.
 *
 * Idempotência em três camadas:
 *  - UNIQUE(empresa_id, competencia) em faturas_excedente;
 *  - guarda que pula empresa cuja fatura do mês já não está `falhou`;
 *  - notas carimbadas com fatura_excedente_id saem do conjunto a faturar.
 *
 * Diferente do motor de emissão, aqui o retry automático do Inngest é bem-vindo
 * (cada passo é idempotente) — não é o caso da regra 13 (retry manual).
 */

const DIAS_ATE_VENCIMENTO = 7;

function asaasConfigOuNulo(): AsaasConfig | null {
  const env = serverEnv();
  if (!env.ASAAS_API_KEY) return null;
  return { apiKey: env.ASAAS_API_KEY, baseUrl: env.ASAAS_BASE_URL };
}

export const cobrarExcedentes = inngest.createFunction(
  { id: "cobrar-excedentes-mensal", retries: 2 },
  { cron: "0 6 1 * *" }, // dia 1, 06:00 UTC (~03:00 BRT)
  async ({ step, logger }) => {
    // Congela a referência de tempo num step (replay-safe)
    const competencia = await step.run("definir-competencia", async () =>
      competenciaMesAnterior(new Date()),
    );

    const asaas = asaasConfigOuNulo();
    if (!asaas) {
      logger.warn("ASAAS_API_KEY ausente — cobrança de excedentes pulada", { competencia });
      return { status: "asaas-nao-configurado" as const, competencia };
    }

    // Assinaturas cobráveis: fora do trial e com preço de excedente definido
    const alvos = await step.run("listar-assinaturas-cobraveis", async () => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("assinaturas")
        .select("empresa_id, preco_excedente_centavos, gateway_customer_id")
        .in("status", ["ativa", "inadimplente"])
        .gt("preco_excedente_centavos", 0);
      if (error) throw new Error(`Falha ao listar assinaturas: ${error.message}`);
      return data ?? [];
    });

    const resultados: Array<{ empresaId: string; status: string; valorCentavos?: number }> = [];

    for (const alvo of alvos) {
      const r = await step.run(`cobrar-${alvo.empresa_id}`, async () =>
        processarEmpresa(asaas, {
          empresaId: alvo.empresa_id,
          precoExcedenteCentavos: alvo.preco_excedente_centavos,
          gatewayCustomerId: alvo.gateway_customer_id,
          competencia,
        }),
      );
      resultados.push(r);
    }

    const cobradas = resultados.filter((r) => r.status === "cobrada").length;
    logger.info("Cobrança de excedentes concluída", { competencia, cobradas, total: resultados.length });
    return { status: "ok" as const, competencia, cobradas, resultados };
  },
);

async function processarEmpresa(
  asaas: AsaasConfig,
  params: {
    empresaId: string;
    precoExcedenteCentavos: number;
    gatewayCustomerId: string | null;
    competencia: string;
  },
): Promise<{ empresaId: string; status: string; valorCentavos?: number }> {
  const db = createAdminClient();
  const { inicio, fimExclusivo } = intervaloDoMes(params.competencia);

  // Idempotência: fatura do mês já existe e não falhou → nada a fazer
  const { data: faturaExistente } = await db
    .from("faturas_excedente")
    .select("id, status")
    .eq("empresa_id", params.empresaId)
    .eq("competencia", inicio)
    .maybeSingle();
  if (faturaExistente && faturaExistente.status !== "falhou") {
    return { empresaId: params.empresaId, status: "ja-processada" };
  }

  // Notas excedentes do mês ainda não faturadas
  const { data: notas, error: erroNotas } = await db
    .from("notas_fiscais")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("excedente", true)
    .is("fatura_excedente_id", null)
    .gte("competencia", inicio)
    .lt("competencia", fimExclusivo);
  if (erroNotas) throw new Error(`Falha ao buscar notas excedentes: ${erroNotas.message}`);

  const idsNotas = (notas ?? []).map((n) => n.id);
  if (idsNotas.length === 0) {
    return { empresaId: params.empresaId, status: "sem-excedente" };
  }

  const calc = calcularFaturaExcedente({
    quantidadeNotas: idsNotas.length,
    precoUnitarioCentavos: params.precoExcedenteCentavos,
  });

  // Garante o customer Asaas da EMPRESA (a agência é a pagadora aqui)
  let customerId = params.gatewayCustomerId;
  if (!customerId) {
    const { data: empresa, error: erroEmpresa } = await db
      .from("empresas")
      .select("cnpj, razao_social, email_contato")
      .eq("id", params.empresaId)
      .single();
    if (erroEmpresa || !empresa) {
      throw new Error(`Empresa ${params.empresaId} não encontrada para cobrança.`);
    }
    customerId = await obterOuCriarCustomer(asaas, {
      nome: empresa.razao_social,
      cpfCnpj: empresa.cnpj,
      email: empresa.email_contato,
    });
    await db
      .from("assinaturas")
      .update({ gateway_customer_id: customerId })
      .eq("empresa_id", params.empresaId)
      .neq("status", "cancelada");
  }

  // Cria (ou reaproveita) a fatura do mês. upsert pela UNIQUE(empresa,competencia).
  const { data: fatura, error: erroFatura } = await db
    .from("faturas_excedente")
    .upsert(
      {
        empresa_id: params.empresaId,
        competencia: inicio,
        quantidade_notas: calc.quantidadeNotas,
        preco_unitario_centavos: calc.precoUnitarioCentavos,
        valor_total_centavos: calc.valorTotalCentavos,
        status: "pendente",
        erro: null,
      },
      { onConflict: "empresa_id,competencia" },
    )
    .select("id")
    .single();
  if (erroFatura || !fatura) {
    throw new Error(`Falha ao registrar fatura de excedente: ${erroFatura?.message}`);
  }

  // Referência do webhook: pagamento desta fatura NÃO gera nota (tipo tag)
  const referencia: FaturaExcedenteRef = {
    tipo: "fatura_excedente",
    faturaId: fatura.id,
    empresaId: params.empresaId,
    competencia: inicio,
  };

  try {
    const cobranca = await criarCobranca(asaas, {
      customerId,
      valorCentavos: calc.valorTotalCentavos,
      vencimento: vencimentoEmDias(new Date(), DIAS_ATE_VENCIMENTO),
      descricao: descricaoFaturaExcedente({
        quantidadeNotas: calc.quantidadeNotas,
        competencia: inicio,
      }),
      externalReference: JSON.stringify(referencia),
    });

    await db
      .from("faturas_excedente")
      .update({
        status: "cobrada",
        asaas_payment_id: cobranca.pagamentoId,
        link_fatura: cobranca.linkFatura,
        erro: null,
      })
      .eq("id", fatura.id);

    // Carimba as notas para nunca cobrar de novo
    await db
      .from("notas_fiscais")
      .update({ fatura_excedente_id: fatura.id })
      .in("id", idsNotas);

    return { empresaId: params.empresaId, status: "cobrada", valorCentavos: calc.valorTotalCentavos };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    await db
      .from("faturas_excedente")
      .update({ status: "falhou", erro: mensagem })
      .eq("id", fatura.id);
    throw new Error(`Cobrança Asaas falhou para empresa ${params.empresaId}: ${mensagem}`);
  }
}
