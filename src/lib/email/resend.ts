import { z } from "zod";
import { serverEnv } from "@/lib/env";

/**
 * E-mail transacional via Resend (https://resend.com), pela API HTTP —
 * sem dependência de SDK. Resposta validada com Zod (regra 19).
 *
 * Sem RESEND_API_KEY configurada, `emailConfigurado()` retorna false e o
 * chamador decide pular o envio (útil no beta, antes de verificar domínio).
 */

const respostaSchema = z.object({ id: z.string() });

export function emailConfigurado(): boolean {
  return Boolean(serverEnv().RESEND_API_KEY);
}

export interface EnviarEmailInput {
  para: string;
  assunto: string;
  html: string;
}

export async function enviarEmail(input: EnviarEmailInput): Promise<{ emailId: string }> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada — envio de e-mail indisponível.");
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_REMETENTE,
      to: [input.para],
      subject: input.assunto,
      html: input.html,
    }),
    cache: "no-store",
  });

  const corpo: unknown = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error(`Resend respondeu ${resp.status}: ${JSON.stringify(corpo)}`);
  }
  return { emailId: respostaSchema.parse(corpo).id };
}

// ---------------------------------------------------------------------------
// Template: nota fiscal emitida
// ---------------------------------------------------------------------------

export function emailNotaEmitida(dados: {
  nomeCliente: string;
  nomeEmpresa: string;
  numeroNfse: string;
  urlPdf: string | null;
}): { assunto: string; html: string } {
  const botaoPdf = dados.urlPdf
    ? `<p style="margin:24px 0"><a href="${dados.urlPdf}" style="background:#1570ef;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Baixar nota fiscal (PDF)</a></p>`
    : "";

  return {
    assunto: `Sua nota fiscal nº ${dados.numeroNfse} — ${dados.nomeEmpresa}`,
    html: `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="color:#1849a9">Nota fiscal emitida</h2>
  <p>Olá, ${dados.nomeCliente}!</p>
  <p><strong>${dados.nomeEmpresa}</strong> emitiu a nota fiscal de serviço
  <strong>nº ${dados.numeroNfse}</strong> referente ao seu pagamento.</p>
  ${botaoPdf}
  <p style="color:#64748b;font-size:13px">Guarde este e-mail como comprovante.
  Em caso de dúvida, responda diretamente para ${dados.nomeEmpresa}.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="color:#94a3b8;font-size:12px">Enviado automaticamente pela plataforma Agência Fiscal.</p>
</div>`.trim(),
  };
}
