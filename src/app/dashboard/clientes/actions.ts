"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { atualizarCliente, criarCliente, clienteSchema } from "@/services/clientes";

export interface ActionResult {
  ok: boolean;
  erro?: string;
}

function extrairDados(formData: FormData) {
  return clienteSchema.safeParse({
    nome: formData.get("nome"),
    cpfCnpj: String(formData.get("cpfCnpj") ?? "").replace(/\D/g, ""),
    email: formData.get("email") ?? "",
    telefone: formData.get("telefone") ?? "",
    endereco: {
      logradouro: formData.get("logradouro") || undefined,
      numero: formData.get("numero") || undefined,
      bairro: formData.get("bairro") || undefined,
      municipio: formData.get("municipio") || undefined,
      uf: formData.get("uf") || undefined,
      cep: String(formData.get("cep") ?? "").replace(/\D/g, "") || undefined,
    },
  });
}

export async function salvarClienteAction(formData: FormData): Promise<ActionResult> {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo !== "com_empresa") {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  const parse = extrairDados(formData);
  if (!parse.success) {
    return { ok: false, erro: parse.error.errors[0]?.message ?? "Dados inválidos." };
  }

  const clienteId = z.string().uuid().safeParse(formData.get("clienteId"));

  try {
    if (clienteId.success) {
      await atualizarCliente(db, {
        empresaId: estado.empresaId,
        clienteId: clienteId.data,
        dados: parse.data,
      });
    } else {
      await criarCliente(db, { empresaId: estado.empresaId, dados: parse.data });
    }
    revalidatePath("/dashboard/clientes");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao salvar." };
  }
}
