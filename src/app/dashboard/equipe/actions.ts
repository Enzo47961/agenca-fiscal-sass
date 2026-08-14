"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { emailConfigurado, emailConvite, enviarEmail } from "@/lib/email/resend";
import {
  DIAS_VALIDADE_CONVITE,
  PAPEL_DESCRICAO,
  PAPEL_LABEL,
  criarConvite,
  criarConviteSchema,
  revogarConvite,
  urlDoConvite,
} from "@/services/convites";

export type ResultadoConvite = { ok: true; aviso?: string } | { ok: false; erro: string };

/**
 * Origem (esquema + host) da requisição atual, para montar o link do convite.
 *
 * Derivada dos cabeçalhos em vez de uma `NEXT_PUBLIC_SITE_URL`: uma variável
 * pública nova e obrigatória repetiria o defeito que derrubou o deploy em
 * agosto — build quebrado por variável ausente. E, derivada, o link sai sempre
 * no domínio em que o usuário realmente está, inclusive em preview.
 *
 * `x-forwarded-proto` é o que a Vercel preenche; o fallback para `https` vale
 * porque produção nunca é http, e em desenvolvimento o host começa com
 * `localhost`, tratado à parte.
 */
function origemDaRequisicao(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Convida alguém para a empresa ATIVA.
 *
 * `empresaId` vem da sessão, nunca do formulário (regra 3) — aceitar do cliente
 * permitiria convidar para uma empresa alheia. E mesmo que passasse, o banco
 * recusaria: `criar_convite()` confere o papel de quem chama.
 */
export async function convidarAction(formData: FormData): Promise<ResultadoConvite> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo !== "com_empresa") {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  const parse = criarConviteSchema.safeParse({
    empresaId: estado.empresaId,
    email: String(formData.get("email") ?? "").trim(),
    papel: String(formData.get("papel") ?? ""),
  });
  if (!parse.success) {
    return { ok: false, erro: parse.error.errors[0]?.message ?? "Dados inválidos." };
  }

  let token: string;
  try {
    ({ token } = await criarConvite(db, parse.data));
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível convidar." };
  }

  // Daqui para baixo o convite JÁ EXISTE. Falha de e-mail não pode desfazê-lo
  // nem virar erro: o convite é válido e o administrador pode reenviar. O que
  // não se pode é dizer "convidado" quando o e-mail não saiu — por isso volta
  // como aviso, com o link para envio manual.
  const { data: empresa } = await db
    .from("empresas")
    .select("razao_social, nome_fantasia")
    .eq("id", estado.empresaId)
    .maybeSingle();

  const url = urlDoConvite(origemDaRequisicao(), token);
  revalidatePath("/dashboard/equipe");

  if (!emailConfigurado()) {
    return { ok: true, aviso: `E-mail não configurado. Envie este link ao convidado: ${url}` };
  }

  try {
    const template = emailConvite({
      nomeEmpresa: empresa?.nome_fantasia ?? empresa?.razao_social ?? "sua empresa",
      papelLabel: PAPEL_LABEL[parse.data.papel] ?? parse.data.papel,
      papelDescricao: PAPEL_DESCRICAO[parse.data.papel] ?? "",
      convidadoPor: "Um administrador da empresa",
      url,
      dias: DIAS_VALIDADE_CONVITE,
    });
    await enviarEmail({ para: parse.data.email, assunto: template.assunto, html: template.html });
    return { ok: true };
  } catch {
    return { ok: true, aviso: `Convite criado, mas o e-mail falhou. Envie este link: ${url}` };
  }
}

export async function revogarConviteAction(conviteId: string): Promise<ResultadoConvite> {
  const db = createSessionClient();
  try {
    await revogarConvite(db, conviteId);
    revalidatePath("/dashboard/equipe");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível revogar." };
  }
}
