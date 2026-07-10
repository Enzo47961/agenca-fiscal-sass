"use server";

import { redirect } from "next/navigation";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
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
  if (estado.tipo === "com_empresa") {
    redirect("/dashboard"); // já tem empresa — nada a fazer aqui
  }

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

  try {
    await criarEmpresaComOwner(db, parse.data);
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao criar a empresa." };
  }

  redirect("/dashboard");
}
