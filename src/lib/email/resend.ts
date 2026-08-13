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
// Escape de HTML (item M3)
//
// O template abaixo interpola nome do cliente, razão social e número da nota
// direto no HTML. Todos vêm do banco, preenchidos por usuário, e o e-mail vai
// para um TERCEIRO — o cliente do nosso cliente. Sem escape há dois problemas,
// um chato e um sério:
//
// - Chato: "Silva & Souza" renderiza errado, e um "<" quebra o layout.
// - Sério: um tenant cadastra cliente com HTML no nome e passa a enviar
//   conteúdo arbitrário — um link de phishing, por exemplo — dentro de um
//   e-mail que sai da NOSSA plataforma, com o nosso remetente.
// ---------------------------------------------------------------------------

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapa texto para interpolação em conteúdo OU em valor de atributo HTML. */
export function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * URL para uso em `href`. Escapar não basta em contexto de atributo: `href` é
 * executável, e `javascript:alert(1)` não tem um único caractere que o escape
 * de HTML trate. Por isso a checagem aqui é de ESQUEMA, com lista de permitidos.
 *
 * Devolve `null` quando a URL não é utilizável — o chamador omite o botão em vez
 * de renderizar um link quebrado ou perigoso.
 */
export function urlSegura(valor: string | null | undefined): string | null {
  if (!valor) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null; // relativa ou malformada — num e-mail não há base para resolver
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return escaparHtml(url.toString());
}

// ---------------------------------------------------------------------------
// Template: nota fiscal emitida
// ---------------------------------------------------------------------------

/**
 * Alerta interno de consumo da franquia do provider. Vai para NÓS, não para
 * cliente — por isso é seco e traz número, não tranquilização.
 */
export function emailFranquia(dados: {
  nivel: string;
  resumo: string;
  notasEmitidas: number;
  franquia: number;
  projecao: number;
  custoProjetadoReais: string;
  diaDoMes: number;
  diasNoMes: number;
  maiores: Array<{ nome: string; notas: number }>;
}): { assunto: string; html: string } {
  const linhas = dados.maiores
    .map(
      (m) =>
        `<tr><td style="padding:4px 12px 4px 0">${escaparHtml(m.nome)}</td>` +
        `<td style="padding:4px 0;text-align:right"><strong>${m.notas}</strong></td></tr>`,
    )
    .join("");

  return {
    assunto: `[Agência Fiscal] ${dados.resumo}`,
    html: `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1e293b">
  <h2 style="color:#1849a9;margin-bottom:4px">Franquia do provider — ${escaparHtml(dados.nivel)}</h2>
  <p style="color:#64748b;margin-top:0">Dia ${dados.diaDoMes} de ${dados.diasNoMes}</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 12px 4px 0">Emitidas até agora</td>
        <td style="padding:4px 0"><strong>${dados.notasEmitidas}</strong> de ${dados.franquia}</td></tr>
    <tr><td style="padding:4px 12px 4px 0">Projeção do mês</td>
        <td style="padding:4px 0"><strong>${dados.projecao}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0">Excedente projetado</td>
        <td style="padding:4px 0"><strong>${escaparHtml(dados.custoProjetadoReais)}</strong></td></tr>
  </table>
  ${linhas ? `<h3 style="font-size:14px;margin-bottom:4px">Maiores emissores do mês</h3>
  <table style="border-collapse:collapse;font-size:13px">${linhas}</table>` : ""}
  <p style="color:#64748b;font-size:13px;margin-top:20px">
    Se a projeção passar da franquia, negocie o plano com o provider ANTES do fim do mês —
    excedente pago não é reembolsado e, quando nenhum escritório estoura o próprio pool,
    não há o que faturar de volta.
  </p>
</div>`.trim(),
  };
}

export function emailNotaEmitida(dados: {
  nomeCliente: string;
  nomeEmpresa: string;
  numeroNfse: string;
  urlPdf: string | null;
}): { assunto: string; html: string } {
  const nomeCliente = escaparHtml(dados.nomeCliente);
  const nomeEmpresa = escaparHtml(dados.nomeEmpresa);
  const numeroNfse = escaparHtml(dados.numeroNfse);
  const href = urlSegura(dados.urlPdf);

  const botaoPdf = href
    ? `<p style="margin:24px 0"><a href="${href}" style="background:#1570ef;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Baixar nota fiscal (PDF)</a></p>`
    : "";

  return {
    // O assunto é texto puro para o cliente de e-mail: entidades HTML
    // apareceriam literalmente ("&amp;"), então aqui vão os valores originais.
    assunto: `Sua nota fiscal nº ${dados.numeroNfse} — ${dados.nomeEmpresa}`,
    html: `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="color:#1849a9">Nota fiscal emitida</h2>
  <p>Olá, ${nomeCliente}!</p>
  <p><strong>${nomeEmpresa}</strong> emitiu a nota fiscal de serviço
  <strong>nº ${numeroNfse}</strong> referente ao seu pagamento.</p>
  ${botaoPdf}
  <p style="color:#64748b;font-size:13px">Guarde este e-mail como comprovante.
  Em caso de dúvida, responda diretamente para ${nomeEmpresa}.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="color:#94a3b8;font-size:12px">Enviado automaticamente pela plataforma Agência Fiscal.</p>
</div>`.trim(),
  };
}
