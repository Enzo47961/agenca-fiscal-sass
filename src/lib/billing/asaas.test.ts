import { describe, it, expect } from "vitest";
import {
  AsaasError,
  EVENTOS_WEBHOOK_PAGAMENTO,
  consultarPagamento,
  criarCobranca,
  diagnosticarWebhookPagamento,
  ehTransienteAsaas,
  garantirWebhookPagamento,
  listarWebhooks,
  mensagemDeErroAsaas,
  obterOuCriarCustomer,
  type AsaasConfig,
} from "@/lib/billing/asaas";
import { referenciaNfseSchema } from "@/services/cobrancas";

// ---------------------------------------------------------------------------
// Infra de teste: fetch falso, sem rede e sem API key real.
// ---------------------------------------------------------------------------

interface RespostaFalsa {
  status: number;
  corpo: unknown;
}

interface ChamadaRegistrada {
  url: string;
  metodo: string;
  corpo: unknown;
  accessToken: string | null;
}

function ambiente(respostas: RespostaFalsa[]) {
  const chamadas: ChamadaRegistrada[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    chamadas.push({
      url: String(url),
      metodo: init?.method ?? "GET",
      corpo: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      accessToken: headers.get("access_token"),
    });
    const r = respostas[chamadas.length - 1] ?? respostas[respostas.length - 1];
    if (!r) throw new Error("ambiente() sem resposta configurada");
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.corpo } as Response;
  }) as unknown as typeof fetch;

  const cfg: AsaasConfig = {
    apiKey: "chave-de-sandbox",
    baseUrl: "https://api-sandbox.asaas.com/v3",
    fetchImpl,
  };
  return { cfg, chamadas };
}

const WEBHOOK_URL = "https://agencia.exemplo.com.br/api/webhook/pagamento";
// 32+ caracteres, como o Asaas exige em authToken.
const AUTH_TOKEN = "a".repeat(40);

// ---------------------------------------------------------------------------
// Classificação de erro
// ---------------------------------------------------------------------------

describe("classificação de erro do Asaas", () => {
  it("rede/timeout, 408, 429 e 5xx são transientes", () => {
    expect(ehTransienteAsaas(0)).toBe(true);
    expect(ehTransienteAsaas(408)).toBe(true);
    expect(ehTransienteAsaas(429)).toBe(true);
    expect(ehTransienteAsaas(500)).toBe(true);
    expect(ehTransienteAsaas(503)).toBe(true);
  });

  it("4xx de validação e credencial não são transientes", () => {
    expect(ehTransienteAsaas(400)).toBe(false);
    expect(ehTransienteAsaas(401)).toBe(false);
    expect(ehTransienteAsaas(404)).toBe(false);
  });

  it("extrai a mensagem do corpo de erro do Asaas", () => {
    expect(
      mensagemDeErroAsaas(
        { errors: [{ code: "invalid_customer", description: "Cliente não encontrado" }] },
        "fallback",
      ),
    ).toBe("invalid_customer: Cliente não encontrado");
    expect(mensagemDeErroAsaas(null, "fallback")).toBe("fallback");
    expect(mensagemDeErroAsaas({ errors: [] }, "fallback")).toBe("fallback");
  });

  it("401 vira AsaasError não transiente com a descrição do Asaas", async () => {
    const { cfg } = ambiente([
      {
        status: 401,
        corpo: { errors: [{ code: "invalid_access_token", description: "A chave de API fornecida é inválida" }] },
      },
    ]);
    const erro = await obterOuCriarCustomer(cfg, {
      nome: "X",
      cpfCnpj: "12345678901",
      email: null,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AsaasError);
    expect((erro as AsaasError).status).toBe(401);
    expect((erro as AsaasError).transiente).toBe(false);
    expect((erro as AsaasError).message).toContain("A chave de API fornecida é inválida");
  });

  it("503 vira AsaasError transiente", async () => {
    const { cfg } = ambiente([{ status: 503, corpo: null }]);
    const erro = await listarWebhooks(cfg).catch((e: unknown) => e);
    expect((erro as AsaasError).transiente).toBe(true);
  });

  it("falha de rede vira AsaasError status 0, transiente", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const erro = await listarWebhooks({
      apiKey: "k",
      baseUrl: "https://api-sandbox.asaas.com/v3",
      fetchImpl,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AsaasError);
    expect((erro as AsaasError).status).toBe(0);
    expect((erro as AsaasError).transiente).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Customers e cobranças
// ---------------------------------------------------------------------------

describe("obterOuCriarCustomer", () => {
  it("reusa o customer existente sem criar outro", async () => {
    const { cfg, chamadas } = ambiente([{ status: 200, corpo: { data: [{ id: "cus_1" }] } }]);
    const id = await obterOuCriarCustomer(cfg, {
      nome: "Cliente",
      cpfCnpj: "12345678901",
      email: "c@x.com",
    });

    expect(id).toBe("cus_1");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.metodo).toBe("GET");
    expect(chamadas[0]!.accessToken).toBe("chave-de-sandbox");
  });

  it("cria o customer quando a busca vem vazia", async () => {
    const { cfg, chamadas } = ambiente([
      { status: 200, corpo: { data: [] } },
      { status: 200, corpo: { id: "cus_novo" } },
    ]);
    const id = await obterOuCriarCustomer(cfg, {
      nome: "Cliente",
      cpfCnpj: "12345678901",
      email: null,
    });

    expect(id).toBe("cus_novo");
    expect(chamadas[1]!.metodo).toBe("POST");
    expect(chamadas[1]!.corpo).toMatchObject({ name: "Cliente", cpfCnpj: "12345678901" });
  });
});

describe("criarCobranca", () => {
  const respostaPagamento = {
    id: "pay_1",
    status: "PENDING",
    invoiceUrl: "https://sandbox.asaas.com/i/pay_1",
    value: 150.0,
    dueDate: "2026-08-10",
  };

  it("converte centavos para reais só na borda do Asaas (regra 15)", async () => {
    const { cfg, chamadas } = ambiente([{ status: 200, corpo: respostaPagamento }]);
    await criarCobranca(cfg, {
      customerId: "cus_1",
      valorCentavos: 15_000,
      vencimento: "2026-08-10",
      descricao: "Serviço",
      externalReference: "{}",
    });

    expect((chamadas[0]!.corpo as Record<string, unknown>).value).toBe(150);
  });

  it("valor quebrado não perde centavo na conversão", async () => {
    const { cfg, chamadas } = ambiente([{ status: 200, corpo: { ...respostaPagamento, value: 1234.56 } }]);
    await criarCobranca(cfg, {
      customerId: "cus_1",
      valorCentavos: 123_456,
      vencimento: "2026-08-10",
      descricao: "Serviço",
      externalReference: "{}",
    });

    expect((chamadas[0]!.corpo as Record<string, unknown>).value).toBe(1234.56);
  });

  it("devolve o link de fatura e o id do pagamento", async () => {
    const { cfg } = ambiente([{ status: 200, corpo: respostaPagamento }]);
    const r = await criarCobranca(cfg, {
      customerId: "cus_1",
      valorCentavos: 15_000,
      vencimento: "2026-08-10",
      descricao: "Serviço",
      externalReference: "{}",
    });

    expect(r).toEqual({
      pagamentoId: "pay_1",
      status: "PENDING",
      linkFatura: "https://sandbox.asaas.com/i/pay_1",
    });
  });
});

describe("consultarPagamento", () => {
  it("devolve valor em centavos e o externalReference cru", async () => {
    const { cfg } = ambiente([
      {
        status: 200,
        corpo: {
          id: "pay_1",
          status: "RECEIVED",
          value: 150.0,
          dueDate: "2026-08-10",
          externalReference: '{"empresaId":"x"}',
        },
      },
    ]);
    const r = await consultarPagamento(cfg, "pay_1");
    expect(r.valorCentavos).toBe(15_000);
    expect(r.externalReference).toBe('{"empresaId":"x"}');
  });
});

// ---------------------------------------------------------------------------
// CONTRATO externalReference — o acoplamento implícito entre criar a cobrança
// e o webhook que gera a nota. Este é o teste que a auditoria pedia.
// ---------------------------------------------------------------------------

describe("contrato externalReference (cobrança ↔ webhook)", () => {
  it("o JSON gravado na cobrança volta parseável pelo schema do webhook", async () => {
    const referencia = {
      empresaId: "11111111-1111-1111-1111-111111111111",
      clienteId: "22222222-2222-2222-2222-222222222222",
      descricaoServico: "Consultoria contábil",
      codigoServico: "01.05",
      aliquotaIss: 0.05,
      issRetido: false,
      codigoNbs: "115011000",
      regimeIbsCbs: "reducao_60" as const,
    };

    const { cfg, chamadas } = ambiente([
      { status: 200, corpo: { id: "pay_1", status: "PENDING", value: 150, dueDate: "2026-08-10" } },
    ]);
    await criarCobranca(cfg, {
      customerId: "cus_1",
      valorCentavos: 15_000,
      vencimento: "2026-08-10",
      descricao: "Consultoria contábil",
      externalReference: JSON.stringify(referenciaNfseSchema.parse(referencia)),
    });

    // Exatamente o que o webhook faz ao receber o evento:
    const enviado = (chamadas[0]!.corpo as Record<string, string>).externalReference!;
    const devolta = referenciaNfseSchema.parse(JSON.parse(enviado));

    expect(devolta).toEqual(referencia);
    // Os campos da reforma sobrevivem à ida e volta — se sumirem, a nota
    // emitida no pagamento sai com o regime errado.
    expect(devolta.regimeIbsCbs).toBe("reducao_60");
    expect(devolta.codigoNbs).toBe("115011000");
  });

  it("externalReference corrompido é rejeitado pelo schema, não aceito silenciosamente", () => {
    expect(() => referenciaNfseSchema.parse(JSON.parse('{"empresaId":"nao-uuid"}'))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Webhook: cadastro idempotente e diagnóstico
// ---------------------------------------------------------------------------

describe("garantirWebhookPagamento", () => {
  it("recusa authToken com menos de 32 caracteres (exigência do Asaas)", async () => {
    const { cfg } = ambiente([{ status: 200, corpo: { data: [] } }]);
    await expect(
      garantirWebhookPagamento(cfg, { url: WEBHOOK_URL, authToken: "curto", email: "a@b.com" }),
    ).rejects.toBeInstanceOf(AsaasError);
  });

  it("cria o webhook quando não existe, assinando os eventos que a rota trata", async () => {
    const { cfg, chamadas } = ambiente([
      { status: 200, corpo: { data: [] } },
      { status: 200, corpo: { id: "wh_1" } },
    ]);
    const r = await garantirWebhookPagamento(cfg, {
      url: WEBHOOK_URL,
      authToken: AUTH_TOKEN,
      email: "a@b.com",
    });

    expect(r).toEqual({ id: "wh_1", criado: true });
    const corpo = chamadas[1]!.corpo as Record<string, unknown>;
    expect(chamadas[1]!.metodo).toBe("POST");
    expect(corpo.events).toEqual([...EVENTOS_WEBHOOK_PAGAMENTO]);
    expect(corpo.sendType).toBe("SEQUENTIALLY");
    expect(corpo.authToken).toBe(AUTH_TOKEN);
  });

  it("é idempotente: com a URL já cadastrada, atualiza em vez de duplicar", async () => {
    const { cfg, chamadas } = ambiente([
      { status: 200, corpo: { data: [{ id: "wh_1", url: WEBHOOK_URL }] } },
      { status: 200, corpo: { id: "wh_1" } },
    ]);
    const r = await garantirWebhookPagamento(cfg, {
      url: WEBHOOK_URL,
      authToken: AUTH_TOKEN,
      email: "a@b.com",
    });

    expect(r).toEqual({ id: "wh_1", criado: false });
    expect(chamadas[1]!.metodo).toBe("PUT");
    expect(chamadas[1]!.url).toContain("/webhooks/wh_1");
  });
});

describe("diagnosticarWebhookPagamento", () => {
  const completo = {
    id: "wh_1",
    url: WEBHOOK_URL,
    enabled: true,
    interrupted: false,
    hasAuthToken: true,
    events: [...EVENTOS_WEBHOOK_PAGAMENTO],
  };

  it("aprova um webhook corretamente configurado", async () => {
    const { cfg } = ambiente([{ status: 200, corpo: { data: [completo] } }]);
    const r = await diagnosticarWebhookPagamento(cfg, WEBHOOK_URL);
    expect(r.ok).toBe(true);
    expect(r.problemas).toEqual([]);
  });

  it("aponta quando não há webhook para a URL", async () => {
    const { cfg } = ambiente([{ status: 200, corpo: { data: [] } }]);
    const r = await diagnosticarWebhookPagamento(cfg, WEBHOOK_URL);
    expect(r.ok).toBe(false);
    expect(r.problemas[0]).toContain("Nenhum webhook cadastrado");
  });

  it("aponta authToken ausente — a causa de 401 em todos os eventos", async () => {
    const { cfg } = ambiente([
      { status: 200, corpo: { data: [{ ...completo, hasAuthToken: false }] } },
    ]);
    const r = await diagnosticarWebhookPagamento(cfg, WEBHOOK_URL);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toContain("401");
  });

  it("aponta fila interrompida e evento faltando", async () => {
    const { cfg } = ambiente([
      {
        status: 200,
        corpo: { data: [{ ...completo, interrupted: true, events: ["PAYMENT_RECEIVED"] }] },
      },
    ]);
    const r = await diagnosticarWebhookPagamento(cfg, WEBHOOK_URL);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toContain("interrompida");
    expect(r.problemas.join(" ")).toContain("PAYMENT_CONFIRMED");
  });
});
