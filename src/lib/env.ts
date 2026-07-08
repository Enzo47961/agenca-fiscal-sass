import { z } from "zod";

/**
 * Validação de ambiente (regra 4 do CLAUDE.md).
 * Todo acesso a segredo passa por aqui — nunca process.env direto no código.
 * `NEXT_PUBLIC_` só para valores realmente públicos.
 */
const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Token combinado com o Asaas para autenticar webhooks (header asaas-access-token). */
  ASAAS_WEBHOOK_TOKEN: z.string().min(16),
  /** Chave AES-256 (base64, 32 bytes) para criptografar certificados A1 em repouso. */
  CERT_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "CERT_ENCRYPTION_KEY deve ser 32 bytes em base64 (openssl rand -base64 32)",
    }),
  MOCK_FISCAL_TAXA_FALHA: z.string().optional(),
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

/** Seguro em qualquer lugar — apenas valores públicos. */
export function publicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_WHATSAPP_SUPORTE: process.env.NEXT_PUBLIC_WHATSAPP_SUPORTE,
  });
}
