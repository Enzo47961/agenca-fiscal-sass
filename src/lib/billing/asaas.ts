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
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

const customerSchema = z.object({ id: z.string() });
const customerListSchema = z.object({ data: z.array(customerSchema) });

const paymentSchema = z.object({
  id: z.string(),
  status: z.string(),
  invoiceUrl: z.string().url().nullish(),
  value: z.number(),
  dueDate: z.string(),
});

export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
}

async function asaasFetch(
  cfg: AsaasConfig,
  caminho: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<unknown> {
  const resp = await fetch(`${cfg.baseUrl}${caminho}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: cfg.apiKey,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const corpo: unknown = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new AsaasError(`Asaas respondeu ${resp.status} em ${caminho}`, resp.status, corpo);
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
