import { deflateRawSync } from "node:zlib";

/**
 * Escritor de ZIP mínimo, sem dependência.
 *
 * POR QUE NÃO UMA BIBLIOTECA. O projeto tem oito dependências de runtime e nem
 * para o Resend usa SDK — fala HTTP direto. Um ZIP de arquivos pequenos é um
 * formato de cabeçalho fixo mais deflate, que já vem no Node. Trazer `archiver`
 * ou `jszip` para isso acrescentaria árvore de dependência e superfície de
 * atualização maior que o próprio código abaixo.
 *
 * ESCOPO DELIBERADAMENTE PEQUENO: arquivos na raiz, sem pastas, sem ZIP64, sem
 * senha. Um lote de XMLs de nota cabe folgado nisso — cada XML tem alguns KB, e
 * o limite de 65.535 entradas do formato clássico está muito acima do teto de
 * exportação. Se um dia precisar de ZIP64, o lugar de mudar é aqui, e o teste
 * de limite embaixo denuncia.
 */

/** Tabela de CRC-32 (polinômio 0xEDB88320), calculada uma vez. */
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/** CRC-32 do conteúdo. O ZIP exige — é como o extrator detecta corrupção. */
export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) {
    c = TABELA_CRC[(c ^ dados[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ArquivoZip {
  /** Nome dentro do ZIP. Barras são removidas — este escritor não faz pastas. */
  nome: string;
  conteudo: Uint8Array;
}

/** Nº máximo de entradas do ZIP clássico (sem ZIP64). */
export const MAX_ENTRADAS_ZIP = 65_535;

/**
 * Converte Date para o par (hora, data) do formato MS-DOS, que é o que o ZIP
 * guarda. Segundos têm resolução de 2 em 2 — limitação do formato, não nossa.
 */
function dataDos(d: Date): { hora: number; data: number } {
  const ano = Math.max(1980, d.getFullYear());
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Nome seguro dentro do ZIP: sem caminho, sem caractere de controle. */
export function nomeSeguroNoZip(nome: string): string {
  // Descarta caracteres de controle: num nome de arquivo não têm uso legítimo e
  // alguns extratores se comportam mal com eles.
  let semControle = "";
  for (const ch of nome) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x20 && c !== 0x7f) semControle += ch;
  }

  // Achata o caminho em UM nome. Segmentos que são só pontos (`.`, `..`) somem
  // em vez de virarem `_.._`: sem separador já não há travessia, então isto é
  // legibilidade — mas um nome com `..` no meio assusta quem abre o pacote.
  const plano = semControle
    .split(/[\\/]+/)
    .filter((seg) => seg.length > 0 && !/^\.+$/.test(seg))
    .join("_")
    .trim();

  return plano.length > 0 ? plano.slice(0, 200) : "arquivo";
}


/**
 * Monta um ZIP em memória.
 *
 * Em memória de propósito: o chamador já tem todos os XMLs carregados para
 * poder contá-los e nomeá-los, e o teto de exportação mantém o total na casa
 * de poucos megabytes. Streaming aqui traria complexidade sem problema para
 * resolver.
 */
export function criarZip(arquivos: readonly ArquivoZip[], agora: Date = new Date()): Buffer {
  if (arquivos.length > MAX_ENTRADAS_ZIP) {
    throw new Error(
      `ZIP com ${arquivos.length} arquivos excede o limite de ${MAX_ENTRADAS_ZIP} do formato.`,
    );
  }

  const { hora, data } = dataDos(agora);
  const locais: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const arquivo of arquivos) {
    const nome = Buffer.from(nomeSeguroNoZip(arquivo.nome), "utf8");
    const bruto = Buffer.from(arquivo.conteudo);
    const comprimido = deflateRawSync(bruto);
    const crc = crc32(bruto);

    const cabecalho = Buffer.alloc(30);
    cabecalho.writeUInt32LE(0x04034b50, 0); // assinatura
    cabecalho.writeUInt16LE(20, 4); // versão necessária
    // bit 11 = nome em UTF-8. Sem ele, acento em nome de arquivo vira lixo em
    // extrator que assume a codificação antiga (CP437).
    cabecalho.writeUInt16LE(0x0800, 6);
    cabecalho.writeUInt16LE(8, 8); // método: deflate
    cabecalho.writeUInt16LE(hora, 10);
    cabecalho.writeUInt16LE(data, 12);
    cabecalho.writeUInt32LE(crc, 14);
    cabecalho.writeUInt32LE(comprimido.length, 18);
    cabecalho.writeUInt32LE(bruto.length, 22);
    cabecalho.writeUInt16LE(nome.length, 26);
    cabecalho.writeUInt16LE(0, 28); // sem campo extra

    locais.push(cabecalho, nome, comprimido);

    const dirEntry = Buffer.alloc(46);
    dirEntry.writeUInt32LE(0x02014b50, 0);
    dirEntry.writeUInt16LE(20, 4); // versão que criou
    dirEntry.writeUInt16LE(20, 6); // versão necessária
    dirEntry.writeUInt16LE(0x0800, 8);
    dirEntry.writeUInt16LE(8, 10);
    dirEntry.writeUInt16LE(hora, 12);
    dirEntry.writeUInt16LE(data, 14);
    dirEntry.writeUInt32LE(crc, 16);
    dirEntry.writeUInt32LE(comprimido.length, 20);
    dirEntry.writeUInt32LE(bruto.length, 24);
    dirEntry.writeUInt16LE(nome.length, 28);
    dirEntry.writeUInt16LE(0, 30); // extra
    dirEntry.writeUInt16LE(0, 32); // comentário
    dirEntry.writeUInt16LE(0, 34); // disco
    dirEntry.writeUInt16LE(0, 36); // atributos internos
    dirEntry.writeUInt32LE(0, 38); // atributos externos
    dirEntry.writeUInt32LE(offset, 42); // onde está o cabeçalho local

    central.push(dirEntry, nome);
    offset += cabecalho.length + nome.length + comprimido.length;
  }

  const dirBuf = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(0, 4); // número do disco
  fim.writeUInt16LE(0, 6); // disco do diretório central
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(dirBuf.length, 12);
  fim.writeUInt32LE(offset, 16);
  fim.writeUInt16LE(0, 20); // sem comentário

  return Buffer.concat([...locais, dirBuf, fim]);
}
