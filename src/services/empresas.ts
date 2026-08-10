import { createCipheriv, randomBytes } from "node:crypto";
import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type Database } from "@/types/database";
import { REGIMES_TRIBUTARIOS } from "@/lib/fiscal/regimes";
import {
  REGIME_APURACAO_SN,
  SITUACAO_SIMPLES_NACIONAL,
  type SituacaoSimplesNacional,
} from "@/lib/fiscal/ibscbs";

/**
 * Configurações da empresa: dados fiscais do CNPJ + certificado digital A1.
 *
 * O certificado A1 (.pfx) é criptografado com AES-256-GCM ANTES de sair da
 * memória do servidor — nunca é gravado em claro. A senha do certificado
 * também é criptografada. A chave vem de CERT_ENCRYPTION_KEY (env, regra 4).
 */

/**
 * REGIME DE APURAÇÃO NO SIMPLES NACIONAL (item A6).
 *
 * O que existia aqui era um booleano `simplesPorFora`, e ele foi removido —
 * não por refinamento, mas porque não representava o que precisa ser
 * representado. A NT-009 exige declarar o regime de apuração POR TRIBUTO: uma
 * empresa pode apurar CBS dentro do Simples e IBS pelo regime regular ao mesmo
 * tempo (o regime híbrido da LC 214/2025). São DUAS dimensões — situação no
 * Simples (`opSimpNac`) × regime de apuração (`regApIBSCBSSN`) —, e um booleano
 * não carrega nenhuma delas por inteiro.
 *
 * A opção pelo regime regular também tem VIGÊNCIA: o que vale para uma nota é o
 * regime na competência dela, não o que está marcado hoje. Daí
 * `dataOpcaoRegimeRegular`.
 *
 * O QUE ISTO NÃO FAZ: não calcula crédito para o tomador. A regra de crédito do
 * Simples sob a LC 214/2025 é decisão contábil e segue pendente. A tela deixou
 * de PROMETER o crédito justamente por isso — prometer efeito que não existe faz
 * o tenant repassar informação errada ao cliente B2B dele.
 *
 * PENDENTE (normativo, não técnico), herdado do A5 e ainda em pé: confirmar com
 * contador se o MEI pode, em alguma hipótese, optar pelo regime regular de
 * IBS/CBS. Até lá, `mei` fica preso a `ambos_pelo_sn` — a mesma proteção que o
 * booleano dava, agora expressa no modelo novo. Se a resposta vier "pode", o
 * caminho é liberar a combinação aqui, não afrouxar a coerência.
 */
export const dadosFiscaisSchema = z
  .object({
    razaoSocial: z.string().min(2).max(200),
    nomeFantasia: z.string().max(200).optional(),
    cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos (somente números)"),
    inscricaoMunicipal: z.string().max(30).optional(),
    codigoMunicipioIbge: z.string().regex(/^\d{7}$/, "Código IBGE deve ter 7 dígitos"),
    // Lista em `lib/fiscal/regimes.ts` porque a tela precisa dos mesmos valores
    // e não pode importar este módulo, que puxa `node:crypto`.
    regimeTributario: z.enum(REGIMES_TRIBUTARIOS),
    emailContato: z.string().email(),
    // Reforma tributária: CNAE (base do enquadramento) e regime de apuração
    cnae: z
      .string()
      .regex(/^\d{7}$/, "CNAE deve ter 7 dígitos (somente números)")
      .optional(),
    situacaoSimplesNacional: z.enum(SITUACAO_SIMPLES_NACIONAL).default("nao_optante"),
    regimeApuracaoSN: z.enum(REGIME_APURACAO_SN).nullish(),
    dataOpcaoRegimeRegular: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de opção deve estar no formato AAAA-MM-DD")
      .nullish(),
  })
  .superRefine((d, ctx) => {
    const optante = d.situacaoSimplesNacional !== "nao_optante";

    // 1. Situação no Simples × regime tributário declarado. Os dois campos
    //    respondem à mesma pergunta por ângulos diferentes; divergirem é o
    //    estado que produz nota com enquadramento contraditório.
    const esperado: Record<(typeof REGIMES_TRIBUTARIOS)[number], readonly SituacaoSimplesNacional[]> =
      {
        mei: ["mei"],
        simples_nacional: ["me_epp", "optante_pendente"],
        lucro_presumido: ["nao_optante"],
        lucro_real: ["nao_optante"],
      };
    if (!esperado[d.regimeTributario].includes(d.situacaoSimplesNacional)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["situacaoSimplesNacional"],
        message:
          `Situação no Simples Nacional incompatível com o regime "${d.regimeTributario}". ` +
          `Esperado: ${esperado[d.regimeTributario].join(" ou ")}.`,
      });
    }

    // 2. Regime de apuração só existe para quem está no Simples. Quem não é
    //    optante apura pelo regime regular por definição, e preencher o campo
    //    sugeriria uma escolha que não existe. Espelha o CHECK do banco.
    if (optante && !d.regimeApuracaoSN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["regimeApuracaoSN"],
        message: "Optante pelo Simples Nacional precisa declarar o regime de apuração de IBS/CBS.",
      });
    }
    if (!optante && d.regimeApuracaoSN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["regimeApuracaoSN"],
        message:
          "Regime de apuração do Simples não se aplica a quem não é optante — nesses " +
          "regimes o IBS/CBS já é apurado pelo regime regular.",
      });
    }

    // 3. A proteção do A5, no modelo novo. Enquanto a dúvida normativa não for
    //    respondida, MEI não sai de `ambos_pelo_sn`.
    if (d.situacaoSimplesNacional === "mei" && d.regimeApuracaoSN && d.regimeApuracaoSN !== "ambos_pelo_sn") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["regimeApuracaoSN"],
        message:
          "MEI não pode optar por apurar IBS/CBS pelo regime regular. A opção é do " +
          "optante ME/EPP pelo Simples Nacional.",
      });
    }

    // 4. Data de opção sem opção é dado órfão. O inverso — optar sem informar a
    //    data — é permitido de propósito: é o estado de quem já usava a
    //    marcação antiga, que a migration não teve como preencher sem inventar
    //    uma vigência falsa.
    const optouPeloRegular =
      d.regimeApuracaoSN === "cbs_sn_ibs_regular" || d.regimeApuracaoSN === "ambos_regime_regular";
    if (d.dataOpcaoRegimeRegular && !optouPeloRegular) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataOpcaoRegimeRegular"],
        message:
          "Data de opção só faz sentido para quem apura IBS e/ou CBS pelo regime regular.",
      });
    }
  });

/** Entrada aceita: `situacaoSimplesNacional` tem default, então é opcional para quem chama. */
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
      // A6. `regimeApuracaoSN` é NULL por regra para quem não é optante — o
      // CHECK do banco recusa a combinação contrária. A data fica NULL quando
      // a empresa não optou pelo regime regular: vigência inventada mudaria a
      // apuração de períodos inteiros.
      situacao_simples_nacional: d.situacaoSimplesNacional,
      regime_apuracao_ibscbs_sn: d.regimeApuracaoSN ?? null,
      data_opcao_regime_regular: d.dataOpcaoRegimeRegular ?? null,
      // Salvar esta tela com o bloco de apuração visível É a manifestação: o
      // usuário viu o seletor, viu o prazo e submeteu. Só marca para optante —
      // quem não é não tem escolha a fazer, e carimbar confirmação ali seria
      // registrar decisão que não existe.
      //
      // NÃO registra a comunicação ao Fisco, que acontece fora do sistema. O
      // que a coluna separa é "nunca decidiu" de "decidiu", para o aviso do
      // prazo não incomodar quem já resolveu.
      regime_apuracao_confirmado_em:
        d.situacaoSimplesNacional === "nao_optante" ? null : new Date().toISOString(),
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
