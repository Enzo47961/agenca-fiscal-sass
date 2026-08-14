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
 * Alerta de saude operacional. Vai para NOS, e por isso e seco: numero primeiro,
 * diagnostico depois. Alerta que enrola atrasa a leitura de quem foi acordado.
 */
export function emailSaude(dados: {
  nivel: string;
  motivos: string[];
  falhadas: number;
  concluidas: number;
  presas: number;
}): { assunto: string; html: string } {
  const cor = dados.nivel === "critico" ? "#b42318" : dados.nivel === "atencao" ? "#b54708" : "#067647";
  const itens = dados.motivos.map((m) => `<li>${escaparHtml(m)}</li>`).join("");

  return {
    assunto: `[Agência Fiscal] Saúde operacional: ${dados.nivel.toUpperCase()}`,
    html: `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1e293b">
  <h2 style="color:${cor};margin-bottom:4px">Saúde operacional: ${escaparHtml(dados.nivel)}</h2>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:4px 12px 4px 0">Notas falhadas (24h)</td><td><strong>${dados.falhadas}</strong> de ${dados.concluidas}</td></tr>
    <tr><td style="padding:4px 12px 4px 0">Notas presas</td><td><strong>${dados.presas}</strong></td></tr>
  </table>
  ${itens ? `<ul style="font-size:14px;color:#334155">${itens}</ul>` : "<p>Voltou ao normal.</p>"}
  <p style="color:#64748b;font-size:13px;margin-top:20px">
    Este aviso só é enviado quando o nível MUDA — não se repete de hora em hora.
  </p>
</div>`.trim(),
  };
}

/**
 * Convite para entrar numa empresa.
 *
 * O link carrega uma credencial, então o texto diz o prazo e o que fazer se o
 * convite não era esperado — quem recebe convite que não pediu precisa saber
 * que basta ignorar, e que o link morre sozinho.
 */
export function emailConvite(dados: {
  nomeEmpresa: string;
  papelLabel: string;
  papelDescricao: string;
  convidadoPor: string;
  url: string;
  dias: number;
}): { assunto: string; html: string } {
  const empresa = escaparHtml(dados.nomeEmpresa);
  const href = urlSegura(dados.url);

  return {
    assunto: `Convite para acessar ${dados.nomeEmpresa} na Agência Fiscal`,
    html: `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="color:#1849a9">Você foi convidado</h2>
  <p><strong>${escaparHtml(dados.convidadoPor)}</strong> convidou você a acessar
  <strong>${empresa}</strong> na plataforma Agência Fiscal, como
  <strong>${escaparHtml(dados.papelLabel)}</strong>.</p>
  <p style="color:#475569;font-size:14px">${escaparHtml(dados.papelDescricao)}</p>
  ${
    href
      ? `<p style="margin:24px 0"><a href="${href}" style="background:#1570ef;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Aceitar convite</a></p>`
      : ""
  }
  <p style="color:#64748b;font-size:13px">O convite vale por ${dados.dias} dias e só funciona
  para este endereço de e-mail. Se você não esperava este convite, ignore esta mensagem — o
  link deixa de valer sozinho.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="color:#94a3b8;font-size:12px">Enviado automaticamente pela plataforma Agência Fiscal.</p>
</div>`.trim(),
  };
}

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
  /**
   * XML da nota. O e-mail levava só o PDF, embora o XML já viesse do provider e
   * estivesse gravado. Quem recebe serviço sendo PJ precisa do XML para a
   * própria escrituração — e, com a Reforma, o crédito de IBS/CBS se apoia no
   * documento, não no PDF. O PDF é para ler; o XML é o documento.
   *
   * Isto NÃO é cumprimento de obrigação legal: a pesquisa nas fontes oficiais
   * não encontrou, para NFS-e, dever do prestador de enviar o XML ao tomador —
   * o Ambiente de Dados Nacional já o disponibiliza às partes da nota. É
   * conveniência, e está escrito aqui para ninguém depois transformar isso em
   * "o sistema cumpre a obrigação de entrega".
   */
  urlXml?: string | null;
}): { assunto: string; html: string } {
  const nomeCliente = escaparHtml(dados.nomeCliente);
  const nomeEmpresa = escaparHtml(dados.nomeEmpresa);
  const numeroNfse = escaparHtml(dados.numeroNfse);
  const href = urlSegura(dados.urlPdf);
  const hrefXml = urlSegura(dados.urlXml);

  const botaoPdf = href
    ? `<p style="margin:24px 0 8px"><a href="${href}" style="background:#1570ef;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Baixar nota fiscal (PDF)</a></p>`
    : "";

  const linkXml = hrefXml
    ? `<p style="margin:${href ? "0 0 24px" : "24px 0"};font-size:13px"><a href="${hrefXml}" style="color:#1570ef">Baixar o arquivo XML</a> <span style="color:#64748b">— necessário para escrituração contábil.</span></p>`
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
  ${linkXml}
  <p style="color:#64748b;font-size:13px">Guarde este e-mail como comprovante.
  Em caso de dúvida, responda diretamente para ${nomeEmpresa}.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="color:#94a3b8;font-size:12px">Enviado automaticamente pela plataforma Agência Fiscal.</p>
</div>`.trim(),
  };
}
