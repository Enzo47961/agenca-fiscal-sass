import { z } from "zod";

/**
 * Client mínimo da API do Asaas (cobranças Pix/boleto).
 * Respostas validadas com Zod na fronteira (regra 19).
 * Docs: https://docs.asaas.com
 */

export class AsaasError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly corpo: unknown = null,
    /**
     * Vale a pena tentar de novo mais tarde? Segue a mesma lógica de
     * classificação do provider fiscal (regra 8): 408/429/5xx e falha de rede
     * são transientes; 4xx de validação e credencial inválida, não.
     * Quem consome (job de excedentes) decide o que fazer com isso.
     */
    public readonly transiente: boolean = false,
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

/** Classificação de erro por status HTTP. `0` = falha de rede/timeout. */
export function ehTransienteAsaas(status: number): boolean {
  if (status === 0) return true; // rede/timeout
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

/** Corpo de erro do Asaas: `{ errors: [{ code, description }] }`. */
const erroAsaasSchema = z.object({
  errors: z
    .array(z.object({ code: z.string().nullish(), description: z.string().nullish() }))
    .nullish(),
});

/** Extrai uma mensagem legível do corpo de erro; cai no fallback se não houver. */
export function mensagemDeErroAsaas(corpo: unknown, fallback: string): string {
  const parse = erroAsaasSchema.safeParse(corpo);
  const itens = parse.success ? (parse.data.errors ?? []) : [];
  const texto = itens
    .map((e) => [e.code, e.description].filter(Boolean).join(": "))
    .filter((s) => s.length > 0)
    .join(" | ");
  return texto.length > 0 ? texto : fallback;
}

const customerSchema = z.object({ id: z.string() });
const customerListSchema = z.object({ data: z.array(customerSchema) });

const paymentSchema = z.object({
  id: z.string(),
  status: z.string(),
  invoiceUrl: z.string().url().nullish(),
  value: z.number(),
  dueDate: z.string(),
  externalReference: z.string().nullish(),
});

export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
  /** Injetável para teste (default: fetch global). */
  fetchImpl?: typeof fetch;
  /** Timeout por request. */
  timeoutMs?: number;
}

async function asaasFetch(
  cfg: AsaasConfig,
  caminho: string,
  init?: { method?: "GET" | "POST" | "PUT"; body?: unknown },
): Promise<unknown> {
  const executar = cfg.fetchImpl ?? fetch;
  let resp: Response;
  try {
    resp = await executar(`${cfg.baseUrl}${caminho}`, {
      method: init?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        access_token: cfg.apiKey,
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000),
      cache: "no-store",
    });
  } catch (e) {
    throw new AsaasError(
      `Falha de rede ao chamar o Asaas em ${caminho}: ${e instanceof Error ? e.message : String(e)}`,
      0,
      null,
      true,
    );
  }

  const corpo: unknown = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new AsaasError(
      mensagemDeErroAsaas(corpo, `Asaas respondeu ${resp.status} em ${caminho}`),
      resp.status,
      corpo,
      ehTransienteAsaas(resp.status),
    );
  }
  return corpo;
}

/** Busca cliente no Asaas pelo CPF/CNPJ; cria se não existir. Retorna o customer id. */
export async function obterOuCriarCustomer(
  cfg: AsaasConfig,
  cliente: { nome: string; cpfCnpj: string; email: string | null },
): Promise<string> {
  const busca = customerListSchema.parse(
    await asaasFetch(cfg, `/customers?cpfCnpj=${encodeURIComponent(cliente.cpfCnpj)}`),
  );
  const existente = busca.data[0];
  if (existente) return existente.id;

  const criado = customerSchema.parse(
    await asaasFetch(cfg, "/customers", {
      method: "POST",
      body: {
        name: cliente.nome,
        cpfCnpj: cliente.cpfCnpj,
        email: cliente.email ?? undefined,
        notificationDisabled: false,
      },
    }),
  );
  return criado.id;
}

export interface CriarCobrancaInput {
  customerId: string;
  /** Valor em CENTAVOS (regra 15) — convertido para reais só na borda do Asaas. */
  valorCentavos: number;
  vencimento: string; // yyyy-mm-dd
  descricao: string;
  /** JSON string no formato exato que /api/webhook/pagamento espera. */
  externalReference: string;
}

export interface CobrancaCriada {
  pagamentoId: string;
  status: string;
  linkFatura: string | null;
}

export async function criarCobranca(
  cfg: AsaasConfig,
  input: CriarCobrancaInput,
): Promise<CobrancaCriada> {
  const pagamento = paymentSchema.parse(
    await asaasFetch(cfg, "/payments", {
      method: "POST",
      body: {
        customer: input.customerId,
        billingType: "UNDEFINED", // cliente escolhe: Pix, boleto ou cartão
        value: input.valorCentavos / 100,
        dueDate: input.vencimento,
        description: input.descricao,
        externalReference: input.externalReference,
      },
    }),
  );

  return {
    pagamentoId: pagamento.id,
    status: pagamento.status,
    linkFatura: pagamento.invoiceUrl ?? null,
  };
}

/**
 * Consulta uma cobrança pelo id. Usada para reconciliar um pagamento com a
 * nota gerada (e para verificar, em sandbox, que o `externalReference` que
 * gravamos é exatamente o que o webhook vai receber de volta).
 */
export async function consultarPagamento(
  cfg: AsaasConfig,
  pagamentoId: string,
): Promise<{
  pagamentoId: string;
  status: string;
  valorCentavos: number;
  externalReference: string | null;
}> {
  const p = paymentSchema.parse(
    await asaasFetch(cfg, `/payments/${encodeURIComponent(pagamentoId)}`),
  );
  return {
    pagamentoId: p.id,
    status: p.status,
    // Asaas trabalha em reais (float); o domínio é centavos (regra 15).
    valorCentavos: Math.round(p.value * 100),
    externalReference: p.externalReference ?? null,
  };
}

// ---------------------------------------------------------------------------
// Configuração de webhook
//
// Os eventos abaixo são EXATAMENTE os que /api/webhook/pagamento trata como
// confirmação de pagamento (EVENTOS_PAGAMENTO_CONFIRMADO). Se a rota passar a
// tratar outro evento, ele entra aqui também — os dois lados andam juntos.
// ---------------------------------------------------------------------------

export const EVENTOS_WEBHOOK_PAGAMENTO = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"] as const;

const webhookSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  url: z.string().nullish(),
  enabled: z.boolean().nullish(),
  interrupted: z.boolean().nullish(),
  hasAuthToken: z.boolean().nullish(),
  events: z.array(z.string()).nullish(),
});
const webhookListSchema = z.object({ data: z.array(webhookSchema) });

export type WebhookAsaas = z.infer<typeof webhookSchema>;

/** Lista os webhooks cadastrados na conta. */
export async function listarWebhooks(cfg: AsaasConfig): Promise<WebhookAsaas[]> {
  return webhookListSchema.parse(await asaasFetch(cfg, "/webhooks?limit=100")).data;
}

export interface GarantirWebhookInput {
  /** URL pública da rota: https://SEU-DOMINIO/api/webhook/pagamento */
  url: string;
  /** Vai no header `asaas-access-token`. O Asaas exige no MÍNIMO 32 caracteres. */
  authToken: string;
  /** E-mail que recebe os avisos de falha de entrega do Asaas. */
  email: string;
  nome?: string;
}

/**
 * Cria (ou atualiza) o webhook de pagamento de forma IDEMPOTENTE: procura um
 * webhook já apontando para a mesma URL e, se existir, corrige-o em vez de
 * criar um segundo — rodar duas vezes não duplica a entrega de eventos.
 *
 * `sendType: SEQUENTIALLY` de propósito: a ordem dos eventos de um mesmo
 * pagamento importa para o nosso fluxo (criado → confirmado → recebido).
 */
export async function garantirWebhookPagamento(
  cfg: AsaasConfig,
  input: GarantirWebhookInput,
): Promise<{ id: string; criado: boolean }> {
  if (input.authToken.length < 32) {
    throw new AsaasError(
      `authToken do webhook precisa ter no mínimo 32 caracteres (recebeu ${input.authToken.length}) — exigência do Asaas`,
      422,
      null,
      false,
    );
  }

  const corpo = {
    name: input.nome ?? "Agência Fiscal — pagamento confirmado",
    url: input.url,
    email: input.email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: input.authToken,
    sendType: "SEQUENTIALLY",
    events: [...EVENTOS_WEBHOOK_PAGAMENTO],
  };

  const existente = (await listarWebhooks(cfg)).find((w) => w.url === input.url);

  if (existente) {
    const atualizado = webhookSchema.parse(
      await asaasFetch(cfg, `/webhooks/${encodeURIComponent(existente.id)}`, {
        method: "PUT",
        body: corpo,
      }),
    );
    return { id: atualizado.id, criado: false };
  }

  const criado = webhookSchema.parse(
    await asaasFetch(cfg, "/webhooks", { method: "POST", body: corpo }),
  );
  return { id: criado.id, criado: true };
}

/**
 * Diagnóstico legível do webhook de pagamento — o "checklist" que a validação
 * final vai rodar assim que a API key existir. Não altera nada.
 */
export async function diagnosticarWebhookPagamento(
  cfg: AsaasConfig,
  url: string,
): Promise<{ ok: boolean; problemas: string[]; webhook: WebhookAsaas | null }> {
  const webhook = (await listarWebhooks(cfg)).find((w) => w.url === url) ?? null;
  if (!webhook) {
    return { ok: false, problemas: [`Nenhum webhook cadastrado apontando para ${url}`], webhook: null };
  }

  const problemas: string[] = [];
  if (webhook.enabled === false) problemas.push("Webhook está desabilitado");
  if (webhook.interrupted === true) {
    problemas.push("Fila de entrega interrompida (o Asaas pausa após falhas seguidas)");
  }
  if (webhook.hasAuthToken !== true) {
    problemas.push("Sem authToken: a rota vai recusar todos os eventos com 401");
  }
  for (const evento of EVENTOS_WEBHOOK_PAGAMENTO) {
    if (!(webhook.events ?? []).includes(evento)) {
      problemas.push(`Evento ${evento} não está assinado`);
    }
  }

  return { ok: problemas.length === 0, problemas, webhook };
}
