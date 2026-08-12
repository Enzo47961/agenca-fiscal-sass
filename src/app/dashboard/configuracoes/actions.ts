"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient, empresaDaSessao } from "@/lib/supabase/server";
import {
  atualizarDadosFiscais,
  atualizarProviderFiscal,
  dadosFiscaisSchema,
  enviarCertificadoA1,
} from "@/services/empresas";
import { nomesDeProvidersDisponiveis, resolverProvider } from "@/lib/fiscal/providers";

export interface ActionResult {
  ok: boolean;
  erro?: string;
  /** Informação útil no sucesso — hoje, a validade do certificado enviado. */
  aviso?: string;
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
    // A6. O bloco de apuração some da tela fora do Simples, então os dois
    // campos chegam ausentes nesses regimes — `undefined` é o valor certo,
    // e o schema recusa a combinação incoerente de qualquer forma.
    situacaoSimplesNacional: formData.get("situacaoSimplesNacional") ?? undefined,
    regimeApuracaoSN: formData.get("regimeApuracaoSN") ?? undefined,
    dataOpcaoRegimeRegular: formData.get("dataOpcaoRegimeRegular") || undefined,
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

export async function salvarProviderFiscalAction(formData: FormData): Promise<ActionResult> {
  const db = createSessionClient();
  const sessao = await empresaDaSessao(db);
  if (!sessao) return { ok: false, erro: "Sessão expirada. Faça login novamente." };

  const provider = String(formData.get("providerFiscal") ?? "");

  try {
    await atualizarProviderFiscal(db, {
      empresaId: sessao.empresaId,
      provider,
      disponiveis: nomesDeProvidersDisponiveis(),
    });
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
    // O provider da empresa e quem vai GUARDAR o certificado — nos apenas
    // repassamos. `resolverProvider` recebe as dependencias vazias porque o
    // envio de certificado nao precisa da tabela de dominio fiscal.
    const { data: empresa } = await db
      .from("empresas")
      .select("provider_fiscal")
      .eq("id", sessao.empresaId)
      .single();

    const { validoAte } = await enviarCertificadoA1(
      db,
      resolverProvider(empresa?.provider_fiscal ?? "mock", {}),
      {
        empresaId: sessao.empresaId,
        arquivoPfx: Buffer.from(await arquivo.arrayBuffer()),
        senhaPfx: senha,
      },
    );
    revalidatePath("/dashboard/configuracoes");
    return {
      ok: true,
      aviso: validoAte ? `Certificado válido até ${validoAte}.` : undefined,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro no envio." };
  }
}
