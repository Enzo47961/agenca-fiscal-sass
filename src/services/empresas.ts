import { createCipheriv, randomBytes } from "node:crypto";
import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type Database } from "@/types/database";

/**
 * Configurações da empresa: dados fiscais do CNPJ + certificado digital A1.
 *
 * O certificado A1 (.pfx) é criptografado com AES-256-GCM ANTES de sair da
 * memória do servidor — nunca é gravado em claro. A senha do certificado
 * também é criptografada. A chave vem de CERT_ENCRYPTION_KEY (env, regra 4).
 */

export const dadosFiscaisSchema = z.object({
  razaoSocial: z.string().min(2).max(200),
  nomeFantasia: z.string().max(200).optional(),
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos (somente números)"),
  inscricaoMunicipal: z.string().max(30).optional(),
  codigoMunicipioIbge: z.string().regex(/^\d{7}$/, "Código IBGE deve ter 7 dígitos"),
  regimeTributario: z.enum(["simples_nacional", "lucro_presumido", "lucro_real", "mei"]),
  emailContato: z.string().email(),
});

export type DadosFiscais = z.infer<typeof dadosFiscaisSchema>;

/**
 * Onboarding: cria a primeira empresa do usuário logado + vínculo owner +
 * assinatura beta, atomicamente via RPC `criar_minha_empresa` (SECURITY
 * DEFINER no banco — o usuário só consegue criar empresa para si mesmo).
 */
export async function criarEmpresaComOwner(
  db: SupabaseClient<Database>,
  dados: DadosFiscais,
): Promise<{ empresaId: string }> {
  const d = dadosFiscaisSchema.parse(dados);

  const { data, error } = await db.rpc("criar_minha_empresa", {
    p_razao_social: d.razaoSocial,
    p_cnpj: d.cnpj,
    p_codigo_municipio_ibge: d.codigoMunicipioIbge,
    p_email_contato: d.emailContato,
    p_regime_tributario: d.regimeTributario,
    p_nome_fantasia: d.nomeFantasia,
    p_inscricao_municipal: d.inscricaoMunicipal,
  });

  if (error) {
    if (error.message.includes("cnpj_ja_cadastrado")) {
      throw new Error("Este CNPJ já está cadastrado em outra conta. Fale com o suporte.");
    }
    if (error.message.includes("usuario_ja_tem_empresa")) {
      throw new Error("Sua conta já tem uma empresa vinculada. Recarregue a página.");
    }
    throw new Error(`Não foi possível criar a empresa: ${error.message}`);
  }

  return { empresaId: data };
}

export async function atualizarDadosFiscais(
  db: SupabaseClient<Database>,
  params: { empresaId: string; dados: DadosFiscais },
): Promise<void> {
  const d = dadosFiscaisSchema.parse(params.dados);

  const { error } = await db
    .from("empresas")
    .update({
      razao_social: d.razaoSocial,
      nome_fantasia: d.nomeFantasia ?? null,
      cnpj: d.cnpj,
      inscricao_municipal: d.inscricaoMunicipal ?? null,
      codigo_municipio_ibge: d.codigoMunicipioIbge,
      regime_tributario: d.regimeTributario,
      email_contato: d.emailContato,
    })
    .eq("id", params.empresaId); // RLS restringe a admins/owners da empresa

  if (error) throw new Error(`Falha ao atualizar dados fiscais: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Certificado A1
// ---------------------------------------------------------------------------

interface Cifrado {
  /** iv(12) + authTag(16) + ciphertext, base64 */
  blob: string;
}

function cifrar(dados: Buffer, chaveBase64: string): Cifrado {
  const chave = Buffer.from(chaveBase64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const ciphertext = Buffer.concat([cipher.update(dados), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { blob: Buffer.concat([iv, authTag, ciphertext]).toString("base64") };
}

export async function salvarCertificadoA1(
  db: SupabaseClient<Database>,
  params: {
    empresaId: string;
    arquivoPfx: Buffer;
    senhaPfx: string;
    chaveCriptografiaBase64: string;
  },
): Promise<void> {
  if (params.arquivoPfx.length === 0 || params.arquivoPfx.length > 512 * 1024) {
    throw new Error("Arquivo .pfx inválido (vazio ou maior que 512 KB).");
  }
  if (params.senhaPfx.length < 1) {
    throw new Error("Senha do certificado é obrigatória.");
  }

  const certificado = cifrar(params.arquivoPfx, params.chaveCriptografiaBase64);
  const senha = cifrar(Buffer.from(params.senhaPfx, "utf8"), params.chaveCriptografiaBase64);

  // Bucket privado — sem URL pública; leitura só pelo motor (service_role)
  const caminho = `${params.empresaId}/certificado-a1.enc`;

  const { error: erroUpload } = await db.storage
    .from("certificados")
    .upload(caminho, Buffer.from(JSON.stringify({ certificado: certificado.blob, senha: senha.blob })), {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (erroUpload) {
    throw new Error(`Falha ao armazenar certificado: ${erroUpload.message}`);
  }
}
