/**
 * Leitor de CSV mínimo, sem dependência.
 *
 * POR QUE NÃO UMA BIBLIOTECA: mesma razão do `lib/zip.ts`. O projeto tem oito
 * dependências de runtime e o formato aqui é pequeno o bastante para ser
 * escrito e testado — e grande o bastante para `split(",")` estar errado.
 *
 * O QUE ELE TRATA, e cada item é um jeito real de um CSV de escritório quebrar:
 *
 *   aspas          "Silva, Souza & Cia" — a vírgula dentro não separa coluna
 *   aspas escapadas  "Ele disse ""oi""" vira: Ele disse "oi"
 *   quebra de linha dentro do campo (endereço colado de planilha)
 *   CRLF do Windows e LF do resto
 *   BOM do Excel — o Excel brasileiro grava UTF-8 com BOM, e sem remover o
 *                  primeiro cabeçalho vira "﻿cnpj" e nenhuma coluna casa
 *   ponto e vírgula — o Excel em português usa `;` por padrão, e um CSV
 *                  salvo aqui não abre com vírgula
 *
 * Este último é o que mais aparece na prática: o contador exporta do Excel em
 * pt-BR e o arquivo sai com `;`. Detectar em vez de exigir evita um suporte
 * inteiro.
 */

export interface LinhaCsv {
  /** Número da linha no arquivo, contando o cabeçalho. Para a mensagem de erro. */
  numero: number;
  valores: Record<string, string>;
}

/** Descobre o separador olhando a primeira linha: `;` do Excel pt-BR ou `,`. */
export function detectarSeparador(texto: string): "," | ";" {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
  const virgulas = (primeira.match(/,/g) ?? []).length;
  const pontoEVirgula = (primeira.match(/;/g) ?? []).length;
  return pontoEVirgula > virgulas ? ";" : ",";
}

/** Divide respeitando aspas. Devolve as linhas já em campos. */
export function dividirCsv(texto: string, separador: string): string[][] {
  // BOM do Excel: invisível, e sem remover ele gruda no primeiro cabeçalho.
  const limpo = texto.replace(/^﻿/, "");

  const linhas: string[][] = [];
  let campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i]!;

    if (dentroDeAspas) {
      if (c === '"') {
        // Aspas duplicadas dentro de campo entre aspas = uma aspa literal.
        if (limpo[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeAspas = true;
    } else if (c === separador) {
      campos.push(atual);
      atual = "";
    } else if (c === "\n" || c === "\r") {
      // CRLF conta como uma quebra só.
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      campos.push(atual);
      linhas.push(campos);
      campos = [];
      atual = "";
    } else {
      atual += c;
    }
  }

  // Última linha sem quebra no fim do arquivo.
  if (atual.length > 0 || campos.length > 0) {
    campos.push(atual);
    linhas.push(campos);
  }

  return linhas.filter((l) => l.some((v) => v.trim().length > 0));
}

/** Normaliza cabeçalho: minúsculo, sem acento e sem separador de palavras. */
export function normalizarCabecalho(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    // NFD separa a letra do acento; `\p{Diacritic}` remove os acentos soltos.
    // Propriedade Unicode em vez de um intervalo de caracteres literais: os
    // combinantes, escritos direto no fonte, grudam no caractere anterior e
    // deixam a linha ilegível no editor.
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s_-]+/g, "");
}

export interface ResultadoCsv {
  linhas: LinhaCsv[];
  /** Cabeçalhos normalizados, na ordem do arquivo. */
  colunas: string[];
}

/**
 * Lê o CSV em linhas indexadas pelo cabeçalho NORMALIZADO.
 *
 * A normalização existe porque ninguém digita cabeçalho igual: "CNPJ", "cnpj",
 * "C.N.P.J" e "Razão Social" contra "razao_social" são o mesmo campo para quem
 * preencheu a planilha. Exigir grafia exata transformaria a importação num jogo
 * de adivinhação.
 */
export function lerCsv(texto: string): ResultadoCsv {
  const separador = detectarSeparador(texto);
  const bruto = dividirCsv(texto, separador);
  if (bruto.length === 0) return { linhas: [], colunas: [] };

  const colunas = (bruto[0] ?? []).map(normalizarCabecalho);

  const linhas: LinhaCsv[] = bruto.slice(1).map((campos, i) => {
    const valores: Record<string, string> = {};
    colunas.forEach((col, j) => {
      if (col.length > 0) valores[col] = (campos[j] ?? "").trim();
    });
    // +2: o cabeçalho é a linha 1, e o índice começa em 0.
    return { numero: i + 2, valores };
  });

  return { linhas, colunas };
}
