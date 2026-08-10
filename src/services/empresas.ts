import { createCipheriv, randomBytes } from "node:crypto";
import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type Database } from "@/types/database";
import { REGIME_COM_SIMPLES_POR_FORA, REGIMES_TRIBUTARIOS } from "@/lib/fiscal/regimes";

/**
 * Configurações da empresa: dados fiscais do CNPJ + certificado digital A1.
 *
 * O certificado A1 (.pfx) é criptografado com AES-256-GCM ANTES de sair da
 * memória do servidor — nunca é gravado em claro. A senha do certificado
 * também é criptografada. A chave vem de CERT_ENCRYPTION_KEY (env, regra 4).
 */

/**
 * Por que `REGIME_COM_SIMPLES_POR_FORA` existe e o que ele barra.
 *
 * "Simples por fora" é a opção do optante pelo Simples Nacional de apurar IBS e
 * CBS pelo regime regular, destacando os tributos na nota para que o cliente
 * B2B possa se creditar (LC 214/2025, no desenho da EC 132/2023).
 *
 * Nos demais regimes a marcação não tem para onde ir:
 *
 * - `lucro_presumido` / `lucro_real` — já apuram pelo regime regular por
 *   definição. Aceitar a marcação não muda nada e ainda cria a expectativa
 *   falsa de que mudou.
 * - `mei` — no nosso modelo é um valor SEPARADO de `simples_nacional`, com
 *   tratamento próprio. Oferecer a opção ali promete ao microempreendedor um
 *   comportamento que o resto do sistema não implementa.
 *
 * PENDENTE (normativo, não técnico): confirmar com contador se o MEI pode, em
 * alguma hipótese, optar pelo regime regular de IBS/CBS. Até que isso esteja
 * respondido, a regra aqui é de consistência do MODELO — `mei` e
 * `simples_nacional` são valores distintos do enum, e a marcação pertence a um
 * só deles. Se a resposta vier "pode", o caminho é desmembrar o regime, não
 * afrouxar esta validação.
 */
export const dadosFiscaisSchema = z
  .object({
    razaoSocial: z.string().min(2).max(200),
    nomeFantasia: z.string().max(200).optional(),
    cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos (somente números)"),
    inscricaoMunicipal: z.string().max(30).optional(),
    codigoMunicipioIbge: z.string().regex(/^\d{7}$/, "Código IBGE deve ter 7 dígitos"),
    // Lista em `lib/fiscal/regimes.ts` pelo mesmo motivo do
    // REGIME_COM_SIMPLES_POR_FORA: a tela precisa dos mesmos valores e não pode
    // importar este módulo, que puxa `node:crypto`.
    regimeTributario: z.enum(REGIMES_TRIBUTARIOS),
    emailContato: z.string().email(),
    // Reforma tributária: CNAE (base do enquadramento) e escolha do Simples
    cnae: z
      .string()
      .regex(/^\d{7}$/, "CNAE deve ter 7 dígitos (somente números)")
      .optional(),
    simplesPorFora: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    if (!d.simplesPorFora || d.regimeTributario === REGIME_COM_SIMPLES_POR_FORA) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["simplesPorFora"],
      message:
        d.regimeTributario === "mei"
          ? 'MEI não pode marcar "Simples Nacional por fora". A opção de apurar IBS/CBS ' +
            "pelo regime regular é do optante pelo Simples Nacional."
          : 'A opção "Simples Nacional por fora" só existe para optantes pelo Simples ' +
            "Nacional. No lucro presumido e no lucro real o IBS/CBS já é apurado pelo " +
            "regime regular.",
    });
  });

/** Entrada aceita: `simplesPorFora` tem default, então é opcional para quem chama. */
export type DadosFiscaisInput = z.input<typeof dadosFiscaisSchema>;
export type DadosFiscais = z.infer<typeof dadosFiscaisSchema>;

/**
 * Onboarding: cria a primeira empresa do usuário logado + vínculo owner +
 * assinatura beta, atomicamente via RPC `criar_minha_empresa` (SECURITY
 * DEFINER no banco — o usuário só consegue criar empresa para si mesmo).
 */
export async function criarEmpresaComOwner(
  db: SupabaseClient<Database>,
  dados: DadosFiscaisInput,
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
  params: { empresaId: string; dados: DadosFiscaisInput },
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
      cnae: d.cnae ?? null,
      simples_por_fora: d.simplesPorFora,
    })
    .eq("id", params.empresaId); // RLS restringe a admins/owners da empresa

  if (error) throw new Error(`Falha ao atualizar dados fiscais: ${error.message}`);
}

/**
 * Troca o provider fiscal da empresa.
 *
 * `disponiveis` vem por parâmetro (regra 20) porque quem sabe quais providers
 * têm credencial configurada é o ambiente, e este service é lógica pura. A
 * validação é a parte que importa: sem ela, o tenant poderia salvar
 * "focusnfe" sem token e só descobrir o problema quando a primeira nota
 * falhasse dentro do motor, minutos depois.
 */
export async function atualizarProviderFiscal(
  db: SupabaseClient<Database>,
  params: { empresaId: string; provider: string; disponiveis: readonly string[] },
): Promise<void> {
  if (!params.disponiveis.includes(params.provider)) {
    throw new Error(
      `Provider fiscal "${params.provider}" não está disponível. ` +
        `Opções configuradas: ${params.disponiveis.join(", ") || "nenhuma"}.`,
    );
  }

  const { error } = await db
    .from("empresas")
    .update({ provider_fiscal: params.provider })
    .eq("id", params.empresaId); // RLS restringe a admins/owners da empresa

  if (error) throw new Error(`Falha ao trocar o provider fiscal: ${error.message}`);
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

/**
 * Checagem de magic bytes do .pfx (item M1).
 *
 * Um PKCS#12 é uma estrutura DER: começa com 0x30 (SEQUENCE) seguido de um byte
 * de comprimento em forma longa (0x81/0x82/0x83 — um certificado real tem
 * sempre mais de 255 bytes, então nunca é forma curta).
 *
 * O QUE ISTO PEGA: .pem, .cer, .crt, PDF, imagem, ZIP, ou qualquer arquivo
 * renomeado para .pfx. Sem a checagem, o arquivo é criptografado e guardado sem
 * reclamação, e a falha só aparece muito depois — dentro do motor, na hora de
 * assinar, como erro opaco, com o usuário longe da tela de configurações.
 *
 * O QUE ISTO **NÃO** FAZ: não valida o certificado, não confere a senha, não
 * checa validade nem cadeia. Isso exigiria parse de ASN.1 (node-forge/openssl) e
 * fica para quando houver o fluxo de assinatura. Aqui é rejeição barata e
 * imediata do que é obviamente não-PFX — não é atestado de que o arquivo presta.
 */
export function pareceArquivoPfx(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer[0] !== 0x30) return false;
  const comprimento = buffer[1];
  return comprimento === 0x81 || comprimento === 0x82 || comprimento === 0x83;
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
  if (!pareceArquivoPfx(params.arquivoPfx)) {
    throw new Error(
      "O arquivo enviado não parece um certificado A1 (.pfx/.p12). Certificados em " +
        ".pem, .cer ou .crt não servem: o A1 precisa conter a chave privada. " +
        "Baixe o arquivo .pfx original entregue pela sua certificadora.",
    );
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
