"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_EMPRESA_ATIVA, createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { criarEmpresaComOwner, dadosFiscaisSchema } from "@/services/empresas";

export interface OnboardingResult {
  ok: boolean;
  erro?: string;
}

/**
 * Cria a primeira empresa do usuário logado. Usa o client de SESSÃO (regra 2)
 * — a segurança fica na função SQL `criar_minha_empresa` (SECURITY DEFINER),
 * que só cria empresa nova em nome do próprio auth.uid().
 */
export async function criarEmpresaAction(formData: FormData): Promise<OnboardingResult> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);

  if (estado.tipo === "deslogado") {
    redirect("/login");
  }
  // Quem já tem empresa PODE criar outra: é o contador acrescentando um cliente
  // à carteira. O que impede abuso continua no banco — CNPJ único e teto por
  // usuário em `criar_minha_empresa()` —, não neste redirect.

  const parse = dadosFiscaisSchema.safeParse({
    razaoSocial: formData.get("razaoSocial"),
    nomeFantasia: formData.get("nomeFantasia") || undefined,
    cnpj: String(formData.get("cnpj") ?? "").replace(/\D/g, ""),
    inscricaoMunicipal: formData.get("inscricaoMunicipal") || undefined,
    codigoMunicipioIbge: String(formData.get("codigoMunicipioIbge") ?? "").replace(/\D/g, ""),
    regimeTributario: formData.get("regimeTributario"),
    emailContato: formData.get("emailContato"),
  });
  if (!parse.success) {
    return { ok: false, erro: parse.error.errors[0]?.message ?? "Dados inválidos." };
  }

  let empresaId: string;
  try {
    ({ empresaId } = await criarEmpresaComOwner(db, parse.data));
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao criar a empresa." };
  }

  // A empresa recém-criada vira a ativa. Sem isto, quem acabou de cadastrar
  // cairia no painel de OUTRA empresa da carteira e concluiria que o cadastro
  // falhou — ou pior, começaria a emitir no CNPJ errado.
  cookies().set(COOKIE_EMPRESA_ATIVA, empresaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
