import { z } from "zod";
import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";
import { lerCsv, type LinhaCsv } from "@/lib/csv";
import { REGIMES_TRIBUTARIOS } from "@/lib/fiscal/regimes";

/**
 * IMPORTAÇÃO EM MASSA DE EMPRESAS
 *
 * Cadastrar 600 CNPJs um a um é o que trava a implantação numa carteira grande —
 * e é a primeira pergunta prática que um escritório faz depois de dizer sim.
 *
 * TRÊS DECISÕES QUE DEFINEM O COMPORTAMENTO
 *
 * 1. NÃO É TUDO OU NADA. Um arquivo de 600 linhas terá erros de digitação; se
 *    um CNPJ inválido na linha 417 abortasse tudo, o escritório entraria num
 *    ciclo de tentar-corrigir-tentar. Importa quem dá, relata quem não deu.
 *
 * 2. VALIDA TUDO ANTES DE GRAVAR QUALQUER COISA. O relatório de erros sai
 *    completo na primeira passada. Validar durante a gravação mostraria o
 *    primeiro erro, o usuário corrigiria, e o segundo apareceria na rodada
 *    seguinte — 20 rodadas para 20 erros.
 *
 * 3. CNPJ COM DÍGITO VERIFICADOR CONFERIDO. Aceitar 14 dígitos quaisquer deixa
 *    o erro passar para a prefeitura, que recusa a nota depois — longe da
 *    planilha onde o erro nasceu e de quem podia corrigi-lo.
 */

/** Teto por arquivo. Cada linha é uma transação no banco; acima disso, o tempo
 *  de resposta da função serverless vira o limite real. */
export const MAX_LINHAS_IMPORTACAO = 300;

/**
 * Valida CNPJ pelos dois dígitos verificadores (módulo 11).
 *
 * Rejeita também os repetidos (00000000000000, 11111111111111...): eles passam
 * no cálculo e não existem. É o erro clássico de planilha preenchida com
 * placeholder.
 */
export function cnpjValido(valor: string): boolean {
  const n = valor.replace(/\D/g, "");
  if (n.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(n)) return false;

  const digito = (base: string, pesos: readonly number[]): number => {
    const soma = base
      .split("")
      .reduce((acc, c, i) => acc + Number(c) * (pesos[i] as number), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

  const d1 = digito(n.slice(0, 12), p1);
  if (d1 !== Number(n[12])) return false;
  return digito(n.slice(0, 13), p2) === Number(n[13]);
}

/** Colunas aceitas, já normalizadas (minúsculas, sem acento nem separador). */
export const COLUNAS_ESPERADAS = {
  razaoSocial: ["razaosocial", "razao", "empresa", "nome"],
  cnpj: ["cnpj"],
  codigoMunicipioIbge: ["codigomunicipioibge", "municipioibge", "codigoibge", "ibge", "municipio"],
  emailContato: ["emailcontato", "email", "eqmail"],
  regimeTributario: ["regimetributario", "regime"],
  nomeFantasia: ["nomefantasia", "fantasia"],
  inscricaoMunicipal: ["inscricaomunicipal", "im", "inscricao"],
} as const;

/** Modelo para o usuário baixar — os nomes que a importação reconhece de cara. */
export const CABECALHO_MODELO =
  "razao_social,cnpj,codigo_municipio_ibge,email_contato,regime_tributario,nome_fantasia,inscricao_municipal";

const REGIMES_ACEITOS = new Map<string, string>([
  ...REGIMES_TRIBUTARIOS.map((r) => [r, r] as [string, string]),
  ["simples", "simples_nacional"],
  ["simplesnacional", "simples_nacional"],
  ["lucropresumido", "lucro_presumido"],
  ["presumido", "lucro_presumido"],
  ["lucroreal", "lucro_real"],
  ["real", "lucro_real"],
]);

export const empresaImportadaSchema = z.object({
  razaoSocial: z.string().trim().min(2, "Razão social muito curta").max(200),
  cnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 14, "CNPJ precisa ter 14 dígitos")
    .refine(cnpjValido, "CNPJ inválido (dígito verificador não confere)"),
  codigoMunicipioIbge: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 7, "Código IBGE do município deve ter 7 dígitos"),
  emailContato: z.string().trim().email("E-mail de contato inválido"),
  regimeTributario: z
    .string()
    .transform((v) => REGIMES_ACEITOS.get(v.trim().toLowerCase().replace(/[\s_-]+/g, "")) ?? v)
    .pipe(z.enum(REGIMES_TRIBUTARIOS, { errorMap: () => ({ message: "Regime tributário desconhecido" }) })),
  nomeFantasia: z.string().trim().max(200).optional(),
  inscricaoMunicipal: z.string().trim().max(50).optional(),
});

export type EmpresaImportada = z.infer<typeof empresaImportadaSchema>;

/** Pega o valor da linha aceitando qualquer um dos apelidos da coluna. */
function valorDe(linha: LinhaCsv, apelidos: readonly string[]): string {
  for (const a of apelidos) {
    const v = linha.valores[a];
    if (v !== undefined && v.length > 0) return v;
  }
  return "";
}

export interface LinhaComErro {
  linha: number;
  cnpj: string;
  erro: string;
}

export interface AnaliseImportacao {
  validas: Array<{ linha: number; dados: EmpresaImportada }>;
  erros: LinhaComErro[];
  /** Colunas obrigatórias que não foram encontradas no cabeçalho. */
  colunasFaltando: string[];
}

/**
 * Lê e valida o arquivo INTEIRO sem tocar no banco.
 *
 * Duplicata dentro do próprio arquivo é erro reportado, não segunda tentativa:
 * o mesmo CNPJ duas vezes na planilha quase sempre é linha copiada por engano,
 * e importar duas empresas idênticas seria pior que recusar.
 */
export function analisarCsv(texto: string): AnaliseImportacao {
  const { linhas, colunas } = lerCsv(texto);

  const faltando: string[] = [];
  for (const [campo, apelidos] of Object.entries(COLUNAS_ESPERADAS)) {
    const opcional = campo === "nomeFantasia" || campo === "inscricaoMunicipal";
    if (opcional) continue;
    if (!apelidos.some((a) => colunas.includes(a))) faltando.push(campo);
  }
  if (faltando.length > 0) {
    return { validas: [], erros: [], colunasFaltando: faltando };
  }

  const validas: AnaliseImportacao["validas"] = [];
  const erros: LinhaComErro[] = [];
  const vistos = new Map<string, number>();

  for (const linha of linhas) {
    const bruto = {
      razaoSocial: valorDe(linha, COLUNAS_ESPERADAS.razaoSocial),
      cnpj: valorDe(linha, COLUNAS_ESPERADAS.cnpj),
      codigoMunicipioIbge: valorDe(linha, COLUNAS_ESPERADAS.codigoMunicipioIbge),
      emailContato: valorDe(linha, COLUNAS_ESPERADAS.emailContato),
      regimeTributario: valorDe(linha, COLUNAS_ESPERADAS.regimeTributario),
      nomeFantasia: valorDe(linha, COLUNAS_ESPERADAS.nomeFantasia) || undefined,
      inscricaoMunicipal: valorDe(linha, COLUNAS_ESPERADAS.inscricaoMunicipal) || undefined,
    };

    const parse = empresaImportadaSchema.safeParse(bruto);
    if (!parse.success) {
      const e = parse.error.errors[0];
      erros.push({
        linha: linha.numero,
        cnpj: bruto.cnpj,
        erro: `${e?.path.join(".") ?? "campo"}: ${e?.message ?? "inválido"}`,
      });
      continue;
    }

    const anterior = vistos.get(parse.data.cnpj);
    if (anterior !== undefined) {
      erros.push({
        linha: linha.numero,
        cnpj: parse.data.cnpj,
        erro: `CNPJ repetido no arquivo (já aparece na linha ${anterior})`,
      });
      continue;
    }

    vistos.set(parse.data.cnpj, linha.numero);
    validas.push({ linha: linha.numero, dados: parse.data });
  }

  return { validas, erros, colunasFaltando: [] };
}

export interface ResultadoImportacao {
  importadas: number;
  erros: LinhaComErro[];
}

/**
 * Grava as linhas válidas, uma a uma, por `criar_minha_empresa()`.
 *
 * Uma chamada por linha, e não um INSERT em lote, porque a função faz TRÊS
 * inserções atômicas — empresa, vínculo de owner e assinatura. Um lote direto
 * na tabela criaria empresas órfãs, sem dono e sem plano.
 *
 * Falha de uma linha NÃO derruba as outras: vira erro no relatório. É aqui que
 * aparece o CNPJ já cadastrado, que a análise não tem como saber sozinha.
 */
export async function importarEmpresas(
  db: SupabaseClient<Database>,
  validas: AnaliseImportacao["validas"],
): Promise<ResultadoImportacao> {
  const erros: LinhaComErro[] = [];
  let importadas = 0;

  for (const { linha, dados } of validas) {
    const { error } = await db.rpc("criar_minha_empresa", {
      p_razao_social: dados.razaoSocial,
      p_cnpj: dados.cnpj,
      p_codigo_municipio_ibge: dados.codigoMunicipioIbge,
      p_email_contato: dados.emailContato,
      p_regime_tributario: dados.regimeTributario,
      p_nome_fantasia: dados.nomeFantasia,
      p_inscricao_municipal: dados.inscricaoMunicipal,
    });

    if (error) {
      erros.push({
        linha,
        cnpj: dados.cnpj,
        erro: /duplicate key|unique/i.test(error.message)
          ? "CNPJ já cadastrado na plataforma"
          : error.message,
      });
      continue;
    }
    importadas += 1;
  }

  return { importadas, erros };
}
