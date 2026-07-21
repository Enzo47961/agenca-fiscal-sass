"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient, empresaDaSessao } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import {
  atualizarDadosFiscais,
  dadosFiscaisSchema,
  salvarCertificadoA1,
} from "@/services/empresas";

export interface ActionResult {
  ok: boolean;
  erro?: string;
}

/**
 * Server Actions da tela de configurações. Zero lógica de negócio aqui (só
 * autenticação, validação de fronteira e delegação a services/ — regra 20).
 * Tenant SEMPRE derivado da sessão (regra 3).
 */

export async function salvarDadosFiscaisAction(formData: FormData): Promise<ActionResult> {
  const db = createSessionClient();
  const sessao = await empresaDaSessao(db);
  if (!sessao) return { ok: false, erro: "Sessão expirada. Faça login novamente." };

  const parse = dadosFiscaisSchema.safeParse({
    razaoSocial: formData.get("razaoSocial"),
    nomeFantasia: formData.get("nomeFantasia") || undefined,
    cnpj: String(formData.get("cnpj") ?? "").replace(/\D/g, ""),
    inscricaoMunicipal: formData.get("inscricaoMunicipal") || undefined,
    codigoMunicipioIbge: String(formData.get("codigoMunicipioIbge") ?? "").replace(/\D/g, ""),
    regimeTributario: formData.get("regimeTributario"),
    emailContato: formData.get("emailContato"),
    cnae: String(formData.get("cnae") ?? "").replace(/\D/g, "") || undefined,
    simplesPorFora: formData.get("simplesPorFora") === "on",
  });
  if (!parse.success) {
    return { ok: false, erro: parse.error.errors[0]?.message ?? "Dados inválidos." };
  }

  try {
    await atualizarDadosFiscais(db, { empresaId: sessao.empresaId, dados: parse.data });
    revalidatePath("/dashboard/configuracoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao salvar." };
  }
}

export async function uploadCertificadoAction(formData: FormData): Promise<ActionResult> {
  const db = createSessionClient();
  const sessao = await empresaDaSessao(db);
  if (!sessao) return { ok: false, erro: "Sessão expirada. Faça login novamente." };

  const arquivo = formData.get("certificado");
  const senha = formData.get("senhaCertificado");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Selecione o arquivo .pfx do certificado A1." };
  }
  if (!arquivo.name.toLowerCase().endsWith(".pfx") && !arquivo.name.toLowerCase().endsWith(".p12")) {
    return { ok: false, erro: "O certificado deve ser um arquivo .pfx ou .p12." };
  }
  if (typeof senha !== "string" || senha.length === 0) {
    return { ok: false, erro: "Informe a senha do certificado." };
  }

  try {
    await salvarCertificadoA1(db, {
      empresaId: sessao.empresaId,
      arquivoPfx: Buffer.from(await arquivo.arrayBuffer()),
      senhaPfx: senha,
      chaveCriptografiaBase64: serverEnv().CERT_ENCRYPTION_KEY,
    });
    revalidatePath("/dashboard/configuracoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro no upload." };
  }
}
