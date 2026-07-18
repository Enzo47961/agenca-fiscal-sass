import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { processarPagamentoConfirmado } from "@/services/pagamentos";
import { referenciaNfseSchema } from "@/services/cobrancas";
import { faturaExcedenteRefSchema, marcarFaturaExcedentePaga } from "@/services/faturas";

/**
 * Webhook de confirmação de pagamento (Asaas / Pix).
 *
 * Regra 2: admin client é permitido AQUI porque o webhook valida a assinatura
 * (token `asaas-access-token` combinado no painel do Asaas) antes de qualquer I/O.
 * Regra 5: este handler NUNCA emite NFS-e — só cria a nota `pendente` e delega
 * ao motor Inngest via evento.
 * Regra 19: payload externo validado com Zod na fronteira.
 */

const asaasWebhookSchema = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    /** Valor em reais (float do Asaas) — convertido para centavos aqui na borda. */
    value: z.number().positive(),
    billingType: z.string(),
    /**
     * Definido por nós ao criar a cobrança: JSON com o contexto da nota.
     * Único lugar de onde aceitamos IDs — a cobrança foi criada pelo nosso backend.
     */
    externalReference: z.string().min(1),
  }),
});

// Contrato compartilhado com a criação de cobrança (services/cobrancas.ts):
// os dois lados importam o MESMO schema — mudou lá, mudou aqui junto.
const referenciaSchema = referenciaNfseSchema;

const EVENTOS_PAGAMENTO_CONFIRMADO = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

export async function POST(request: NextRequest) {
  // 1. Autenticação do webhook — antes de ler o corpo
  const token = request.headers.get("asaas-access-token");
  if (!token || token !== serverEnv().ASAAS_WEBHOOK_TOKEN) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  // 2. Validação do payload na fronteira
  const corpo = asaasWebhookSchema.safeParse(await request.json());
  if (!corpo.success) {
    return NextResponse.json(
      { erro: "payload inválido", detalhes: corpo.error.flatten() },
      { status: 400 },
    );
  }

  // Eventos que não são confirmação de pagamento: ack sem ação (Asaas reenvia em não-2xx)
  if (!EVENTOS_PAGAMENTO_CONFIRMADO.has(corpo.data.event)) {
    return NextResponse.json({ ok: true, ignorado: corpo.data.event });
  }

  let referenciaBruta: unknown;
  try {
    referenciaBruta = JSON.parse(corpo.data.payment.externalReference);
  } catch {
    return NextResponse.json({ erro: "externalReference inválida" }, { status: 400 });
  }

  const db = createAdminClient();

  // 3a. Fatura de EXCEDENTE (cobrança da própria plataforma): dá baixa e encerra.
  // NÃO gera nota — é a agência pagando pelo uso acima do limite (regra 5 intacta).
  const fatura = faturaExcedenteRefSchema.safeParse(referenciaBruta);
  if (fatura.success) {
    const r = await marcarFaturaExcedentePaga(db, {
      faturaId: fatura.data.faturaId,
      empresaId: fatura.data.empresaId,
    });
    return NextResponse.json({ ok: true, faturaExcedente: fatura.data.faturaId, atualizada: r.atualizada });
  }

  // 3b. Cobrança que gera NFS-e (contrato existente)
  const referenciaParse = referenciaSchema.safeParse(referenciaBruta);
  if (!referenciaParse.success) {
    return NextResponse.json({ erro: "externalReference inválida" }, { status: 400 });
  }
  const referencia = referenciaParse.data;

  const resultado = await processarPagamentoConfirmado(db, {
    pagamentoId: corpo.data.payment.id,
    valorCentavos: Math.round(corpo.data.payment.value * 100), // regra 15
    empresaId: referencia.empresaId,
    clienteId: referencia.clienteId,
    descricaoServico: referencia.descricaoServico,
    codigoServico: referencia.codigoServico,
    aliquotaIss: referencia.aliquotaIss,
    issRetido: referencia.issRetido,
  });

  return NextResponse.json({ ok: true, notaId: resultado.notaId });
}
