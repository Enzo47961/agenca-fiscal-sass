#!/usr/bin/env node
/**
 * Sincroniza a tabela oficial de CST/cClassTrib com a fonte da SVRS.
 *
 * POR QUE ESTE SCRIPT EXISTE. As tabelas fiscais mudam sem aviso e sem
 * changelog: a SVRS republica a página e quem consome descobre por acidente —
 * ou não descobre. Reimportar cegamente (apagar e recriar) esconde exatamente
 * a informação que interessa, que é O QUE mudou. Aqui o diff vem primeiro e a
 * escrita é opcional.
 *
 * FONTE OFICIAL
 *   https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria
 *   A página embarca a base inteira num `var dadosOriginais = [...]`, com CST,
 *   cClassTrib, indicadores por documento fiscal, reduções e vigências.
 *
 * USO
 *   node scripts/sync-tabelas-fiscais.mjs            # dry-run: só mostra o diff
 *   node scripts/sync-tabelas-fiscais.mjs --apply    # grava as diferenças
 *   node scripts/sync-tabelas-fiscais.mjs --json     # diff em JSON (p/ CI)
 *   node scripts/sync-tabelas-fiscais.mjs --arquivo caminho.html
 *
 * IDEMPOTENTE: rodar duas vezes seguidas com --apply não muda nada na segunda
 * vez, e não cria linha nova em `fiscal_fonte_versao` (UNIQUE por hash).
 *
 * SAÍDA: 0 = sem diferenças · 10 = há diferenças (dry-run) · 1 = erro.
 * O código 10 serve para um job de CI falhar quando a fonte muda.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const FONTE = "svrs_cclasstrib";
const URL_FONTE = "https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria";

const args = process.argv.slice(2);
const opt = {
  apply: args.includes("--apply"),
  json: args.includes("--json"),
  arquivo: (() => {
    const i = args.indexOf("--arquivo");
    return i >= 0 ? args[i + 1] : null;
  })(),
};

// ---------------------------------------------------------------------------
// Ambiente. O script é local e precisa do service_role para escrever nas
// tabelas de domínio (elas não são de tenant, mas estão sob RLS).
// ---------------------------------------------------------------------------
function carregarEnv() {
  for (const arquivo of [".env.local", ".env"]) {
    if (!existsSync(arquivo)) continue;
    for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
      if (!m) continue;
      const valor = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = valor;
    }
  }
}

// ---------------------------------------------------------------------------
// Extração. A página é HTML; o dado vive num literal JS. Varredura equilibrando
// colchetes em vez de regex: descrições contêm colchetes e aspas, e um `.*?`
// cortaria no lugar errado sem avisar.
// ---------------------------------------------------------------------------
function extrairJson(html) {
  const marca = html.indexOf("var dadosOriginais");
  if (marca < 0) {
    throw new Error(
      "`var dadosOriginais` não encontrado na página da SVRS. O portal provavelmente " +
        "mudou de formato — NÃO tente adivinhar o novo: confira a página antes.",
    );
  }
  const inicio = html.indexOf("[", marca);
  let prof = 0;
  let emTexto = false;
  let escape = false;
  for (let i = inicio; i < html.length; i++) {
    const ch = html[i];
    if (emTexto) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') emTexto = false;
      continue;
    }
    if (ch === '"') emTexto = true;
    else if (ch === "[") prof++;
    else if (ch === "]" && --prof === 0) return html.slice(inicio, i + 1);
  }
  throw new Error("JSON da SVRS termina de forma inesperada (colchete não fechado).");
}

// ---------------------------------------------------------------------------
// Validação. Fronteira externa = Zod (regra 19). `passthrough` de propósito:
// a fonte acrescenta indicadores novos a cada nota técnica, e recusar o
// documento inteiro por causa de um campo novo seria pior que ignorá-lo.
// ---------------------------------------------------------------------------
const classificacaoSchema = z
  .object({
    CodClassTrib: z.string().regex(/^\d{6}$/),
    Cst: z.string().regex(/^\d{3}$/),
    NomeClassTrib: z.string().min(1),
    NomeReduzido: z.string().nullish(),
    PercRedIbs: z.number(),
    PercRedCbs: z.number(),
    IndTribRegular: z.boolean(),
    IndPermiteCredPres: z.boolean(),
    IndEstornoCred: z.boolean().nullish(),
    IndNfse: z.boolean(),
    TipoAliq: z.number().int(),
    DthIniVig: z.string().nullish(),
    DthFimVig: z.string().nullish(),
    DthPublicacao: z.string().nullish(),
    TexUrlLegislacao: z.string().nullish(),
  })
  .passthrough();

const fonteSchema = z
  .array(
    z
      .object({
        Cst: z.string().regex(/^\d{3}$/),
        NomeCst: z.string().min(1),
        ClassificacoesTributarias: z.array(classificacaoSchema),
      })
      .passthrough(),
  )
  .min(1);

const dia = (v) => (v ? String(v).slice(0, 10) : null);

/** Fração é o que o código consome; a fonte publica percentual. */
const fracao = (percentual) => Math.round(Number(percentual) * 1e3) / 1e5;

function normalizar(bruto) {
  const linhas = [];
  for (const cst of bruto) {
    for (const c of cst.ClassificacoesTributarias) {
      linhas.push({
        codigo: c.CodClassTrib,
        cst: c.Cst,
        descricao_oficial: c.NomeClassTrib,
        nome_reduzido: c.NomeReduzido ?? null,
        perc_reducao_ibs: fracao(c.PercRedIbs),
        perc_reducao_cbs: fracao(c.PercRedCbs),
        perc_reducao_ibs_oficial: Number(c.PercRedIbs),
        perc_reducao_cbs_oficial: Number(c.PercRedCbs),
        ind_trib_regular: c.IndTribRegular,
        ind_cred_pres: c.IndPermiteCredPres,
        ind_estorno_cred: Boolean(c.IndEstornoCred),
        aplica_nfse: c.IndNfse,
        tipo_aliquota: c.TipoAliq,
        vigencia_inicio: dia(c.DthIniVig),
        vigencia_fim: dia(c.DthFimVig),
        publicado_em: dia(c.DthPublicacao),
        url_legislacao: c.TexUrlLegislacao ?? null,
      });
    }
  }
  linhas.sort((a, b) => a.codigo.localeCompare(b.codigo));
  return linhas;
}

// Campos comparados no diff. Ficam listados em vez de derivados do objeto para
// que acrescentar um campo seja uma decisão, não um efeito colateral.
const CAMPOS = [
  "cst",
  "descricao_oficial",
  "nome_reduzido",
  "perc_reducao_ibs",
  "perc_reducao_cbs",
  "perc_reducao_ibs_oficial",
  "perc_reducao_cbs_oficial",
  "ind_trib_regular",
  "ind_cred_pres",
  "ind_estorno_cred",
  "aplica_nfse",
  "tipo_aliquota",
  "vigencia_inicio",
  "vigencia_fim",
  "publicado_em",
  "url_legislacao",
];

const igual = (a, b) =>
  typeof a === "number" || typeof b === "number"
    ? Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 1e-6
    : (a ?? null) === (b ?? null);

function diffLogico(atuais, novas) {
  const porCodigo = new Map(atuais.map((r) => [r.codigo, r]));
  const novos = [];
  const alterados = [];
  const vigenciaMudou = [];

  for (const n of novas) {
    const a = porCodigo.get(n.codigo);
    if (!a) {
      novos.push(n);
      continue;
    }
    const campos = CAMPOS.filter((c) => !igual(a[c], n[c])).map((c) => ({
      campo: c,
      de: a[c],
      para: n[c],
    }));
    if (campos.length) {
      const alvo = campos.some((c) => c.campo.startsWith("vigencia"))
        ? vigenciaMudou
        : alterados;
      alvo.push({ codigo: n.codigo, campos });
    }
  }

  const vindos = new Set(novas.map((r) => r.codigo));
  const removidos = atuais.filter((r) => !vindos.has(r.codigo)).map((r) => r.codigo);
  return { novos, alterados, vigenciaMudou, removidos };
}

function imprimir(diff, meta) {
  const n = (x) => x.length;
  console.log(`\nFonte      : ${URL_FONTE}`);
  console.log(`Publicação : ${meta.publicado_em ?? "(não informada)"}`);
  console.log(`SHA-256    : ${meta.hash}`);
  console.log(`Registros  : ${meta.registros} cClassTrib (${meta.nfse} aplicáveis a NFS-e)\n`);

  const total =
    n(diff.novos) + n(diff.alterados) + n(diff.vigenciaMudou) + n(diff.removidos);
  if (total === 0) {
    console.log("Nenhuma diferença: o banco já reflete esta versão da fonte.");
    return;
  }

  if (n(diff.novos)) {
    console.log(`NOVOS (${n(diff.novos)})`);
    for (const r of diff.novos) {
      console.log(`  + ${r.codigo}  CST ${r.cst}  nfse=${r.aplica_nfse}  ${r.descricao_oficial.slice(0, 88)}`);
    }
  }
  if (n(diff.vigenciaMudou)) {
    console.log(`\nVIGÊNCIA ALTERADA (${n(diff.vigenciaMudou)}) — atenção: muda o que pode ser declarado`);
    for (const r of diff.vigenciaMudou) {
      for (const c of r.campos) {
        console.log(`  ~ ${r.codigo}  ${c.campo}: ${c.de ?? "—"} -> ${c.para ?? "—"}`);
      }
    }
  }
  if (n(diff.alterados)) {
    console.log(`\nALTERADOS (${n(diff.alterados)})`);
    for (const r of diff.alterados) {
      for (const c of r.campos) {
        console.log(`  ~ ${r.codigo}  ${c.campo}`);
        for (const [rotulo, valor] of [
          ["de  ", c.de],
          ["para", c.para],
        ]) {
          // Texto longo vai em linha própria e INTEIRO. Truncar os dois lados
          // em 60 caracteres escondia justamente a mudança quando ela estava
          // depois disso — numa ferramenta cujo trabalho é mostrar mudanças.
          console.log(`      ${rotulo}: ${valor ?? "—"}`);
        }
      }
    }
  }
  if (n(diff.removidos)) {
    console.log(`\nAUSENTES NA FONTE (${n(diff.removidos)}) — informativo, não conta como pendência`);
    console.log("  NÃO são apagados: código já declarado em nota emitida precisa continuar");
    console.log("  resolvível. Confira manualmente se a fonte realmente os retirou.");
    for (const c of diff.removidos) console.log(`  ? ${c}`);
  }
}

/**
 * Diferenças que uma execução com `--apply` de fato resolve.
 *
 * Ausentes ficam DE FORA: eles nunca são apagados, então contá-los deixaria o
 * código de saída travado em 10 para sempre depois que a fonte retirasse
 * qualquer registro — e um portão de CI preso em vermelho é um portão que
 * ninguém mais lê.
 */
function pendencias(diff) {
  return diff.novos.length + diff.alterados.length + diff.vigenciaMudou.length;
}

async function main() {
  carregarEnv();

  const html = opt.arquivo
    ? readFileSync(opt.arquivo, "utf8")
    : await fetch(URL_FONTE, { redirect: "follow" }).then((r) => {
        if (!r.ok) throw new Error(`SVRS respondeu HTTP ${r.status}`);
        return r.text();
      });

  const cru = extrairJson(html);
  const bruto = fonteSchema.parse(JSON.parse(cru));
  const novas = normalizar(bruto);

  const meta = {
    hash: createHash("sha256").update(cru).digest("hex"),
    registros: novas.length,
    nfse: novas.filter((r) => r.aplica_nfse).length,
    publicado_em: novas.reduce(
      (max, r) => (r.publicado_em && r.publicado_em > (max ?? "") ? r.publicado_em : max),
      null,
    ),
  };

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias (veja .env.local).",
    );
  }
  const db = createClient(url, chave, { auth: { persistSession: false } });

  const { data: atuais, error } = await db
    .from("cclasstrib_ibscbs")
    .select(["codigo", ...CAMPOS].join(","))
    .order("codigo");
  if (error) throw new Error(`Falha ao ler cclasstrib_ibscbs: ${error.message}`);

  const diff = diffLogico(atuais ?? [], novas);
  const total = pendencias(diff);

  if (opt.json) {
    console.log(JSON.stringify({ meta, diff, pendencias: total }, null, 2));
  } else {
    imprimir(diff, meta);
  }

  if (!opt.apply) {
    if (total > 0 && !opt.json) {
      console.log("\n(dry-run — nada foi gravado. Use --apply para aplicar.)");
    }
    // `process.exitCode` e não `process.exit()`: encerrar de imediato com os
    // handles do cliente HTTP ainda abertos dispara uma assertion do libuv no
    // Windows ("!(handle->flags & UV_HANDLE_CLOSING)") e o processo morre com
    // 0xC0000409 — engolindo justamente o código que queríamos comunicar ao CI.
    process.exitCode = total > 0 ? 10 : 0;
    return;
  }

  if (total === 0) {
    if (!opt.json) console.log("\nNada a aplicar.");
    return;
  }

  // Grava só o que mudou, e separa INSERT de UPDATE de propósito.
  //
  // Um `upsert` do lote inteiro parece mais simples e não funciona: o PostgREST
  // monta INSERT ... ON CONFLICT, então a linha precisa satisfazer os NOT NULL
  // mesmo quando o desfecho é UPDATE — e `descricao` (nosso rótulo curto) não
  // vem da fonte. O upsert quebrava com "null value in column descricao".
  //
  // A separação também protege o que é nosso: em código já existente,
  // `descricao` NÃO é tocada. A fonte manda no texto oficial, nós mandamos no
  // rótulo curto.
  const alterar = [...diff.alterados, ...diff.vigenciaMudou].map((d) => d.codigo);
  const porCodigo = new Map(novas.map((r) => [r.codigo, r]));

  for (const codigo of alterar) {
    const { codigo: _pk, ...campos } = porCodigo.get(codigo);
    const { error: e } = await db.from("cclasstrib_ibscbs").update(campos).eq("codigo", codigo);
    if (e) throw new Error(`Falha ao atualizar ${codigo}: ${e.message}`);
  }

  if (diff.novos.length) {
    // Código novo não tem rótulo curto nosso — o texto oficial é o único
    // honesto para `descricao` até alguém encurtá-lo conscientemente.
    const inserir = diff.novos.map((r) => ({ ...r, descricao: r.descricao_oficial }));
    const { error: e } = await db.from("cclasstrib_ibscbs").insert(inserir);
    if (e) throw new Error(`Falha ao inserir códigos novos: ${e.message}`);
  }

  // Ausentes NÃO são apagados de propósito: um código já declarado numa nota
  // emitida precisa continuar resolvível para a nota permanecer legível.

  const { error: erroVersao } = await db.from("fiscal_fonte_versao").upsert(
    {
      fonte: FONTE,
      url: URL_FONTE,
      versao: meta.publicado_em ? `pub-${meta.publicado_em}` : null,
      publicado_em: meta.publicado_em,
      hash_conteudo: meta.hash,
      registros: meta.registros,
    },
    { onConflict: "fonte,hash_conteudo", ignoreDuplicates: true },
  );
  if (erroVersao) throw new Error(`Falha ao registrar versão: ${erroVersao.message}`);

  if (!opt.json) console.log(`\nAplicado. ${total} diferença(s) gravada(s).`);
}

main().catch((e) => {
  console.error(`\nERRO: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
