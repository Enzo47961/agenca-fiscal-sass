import { z } from "zod";

/**
 * Validação de ambiente (regra 4 do CLAUDE.md).
 * Todo acesso a segredo passa por aqui — nunca process.env direto no código.
 * `NEXT_PUBLIC_` só para valores realmente públicos.
 */
const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /**
   * Token combinado com o Asaas para autenticar webhooks (header
   * asaas-access-token). O Asaas exige `authToken` de NO MÍNIMO 32 caracteres
   * ao cadastrar o webhook (confirmado no schema WebhookConfigSaveRequestDTO
   * da API v3) — validar menos que isso aqui só adiaria a falha para o
   * momento do cadastro. Gerar com: openssl rand -hex 32
   */
  ASAAS_WEBHOOK_TOKEN: z.string().min(32),
  /** Chave da API do Asaas (Configurações → Integrações). Opcional até ativar cobranças. */
  ASAAS_API_KEY: z.string().min(1).optional(),
  /** Produção: https://api.asaas.com/v3 — padrão é o sandbox para testes. */
  ASAAS_BASE_URL: z.string().url().default("https://api-sandbox.asaas.com/v3"),
  /** Chave da API do Resend (resend.com). Opcional: sem ela, e-mails são pulados com log. */
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Remetente dos e-mails. Domínio precisa estar verificado no Resend. */
  EMAIL_REMETENTE: z.string().default("Agência Fiscal <onboarding@resend.dev>"),
  /** Chave AES-256 (base64, 32 bytes) para criptografar certificados A1 em repouso. */
  CERT_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "CERT_ENCRYPTION_KEY deve ser 32 bytes em base64 (openssl rand -base64 32)",
    }),
  MOCK_FISCAL_TAXA_FALHA: z.string().optional(),
  /**
   * Focus NFe (provider fiscal real). Opcional aqui porque só é exigido de
   * quem tem `empresas.provider_fiscal = 'focusnfe'` — a obrigatoriedade é
   * cobrada em `focusNfeEnv()`, abaixo. Token obtido no painel da Focus
   * (Painel API → Tokens), por empresa. NUNCA hardcode (regra 4).
   */
  FOCUSNFE_TOKEN: z.string().min(1).optional(),
  /** Padrão homologação de propósito: produção exige escolha explícita. */
  FOCUSNFE_AMBIENTE: z.enum(["homologacao", "producao"]).default("homologacao"),
  /**
   * Opcional. Se definido, /api/webhook/focusnfe passa a exigir este valor no
   * header `x-focusnfe-token`. A rota NÃO depende disso para ser segura: ela
   * sempre reconsulta a API da Focus com o nosso token antes de gravar nada.
   */
  FOCUSNFE_WEBHOOK_TOKEN: z.string().min(16).optional(),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  /** Número do suporte humano, formato E.164 sem '+' (ex.: 5511999999999). */
  NEXT_PUBLIC_WHATSAPP_SUPORTE: z.string().regex(/^\d{10,15}$/),
});

/** Uso exclusivo em código server-side (route handlers, actions, Inngest). */
export function serverEnv() {
  return serverEnvSchema.parse(process.env);
}

/**
 * Config do Asaas, com a obrigatoriedade da chave cobrada só aqui — mesma
 * ideia de `focusNfeEnv()`. Retorna `null` (em vez de lançar) porque a
 * ausência da chave é um estado ESPERADO hoje: a tela de cobrança avisa o
 * usuário e o job de excedentes se pula com log, em vez de quebrar.
 */
export function asaasEnv(): { apiKey: string; baseUrl: string } | null {
  const env = serverEnv();
  if (!env.ASAAS_API_KEY) return null;
  return { apiKey: env.ASAAS_API_KEY, baseUrl: env.ASAAS_BASE_URL };
}

/** `true` quando a integração com o Asaas está utilizável. */
export function asaasConfigurado(): boolean {
  return asaasEnv() !== null;
}

/**
 * Config da Focus NFe, com a obrigatoriedade cobrada só aqui.
 * Chamada exclusivamente pela factory `focusnfe` do registry de providers,
 * então um tenant em `mock` nunca é afetado pela ausência do token.
 */
export function focusNfeEnv(): {
  token: string;
  ambiente: "homologacao" | "producao";
} {
  const env = serverEnv();
  if (!env.FOCUSNFE_TOKEN) {
    throw new Error(
      "FOCUSNFE_TOKEN não configurado: a empresa está com provider_fiscal='focusnfe' " +
        "mas o token da Focus NFe não está no ambiente. Configure-o antes de emitir.",
    );
  }
  return { token: env.FOCUSNFE_TOKEN, ambiente: env.FOCUSNFE_AMBIENTE };
}

/** Seguro em qualquer lugar — apenas valores públicos. */
export function publicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_WHATSAPP_SUPORTE: process.env.NEXT_PUBLIC_WHATSAPP_SUPORTE,
  });
}
