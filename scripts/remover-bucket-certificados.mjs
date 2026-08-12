#!/usr/bin/env node
/**
 * Remove o bucket `certificados` — o armazenamento que deixou de existir quando
 * o certificado A1 passou a ficar com o provider fiscal.
 *
 * POR QUE UM SCRIPT E NÃO UMA MIGRATION. O Postgres do Supabase recusa
 * `DELETE FROM storage.buckets` com "Direct deletion from storage tables is not
 * allowed. Use the Storage API instead." (SQLSTATE 42501). Bucket é objeto da
 * Storage API, não do schema — então sai daqui.
 *
 * A migration 20260812120000 já derruba a policy do bucket, o que o torna
 * inacessível. Este script é higiene: tira o objeto vazio do caminho.
 *
 * USO
 *   node scripts/remover-bucket-certificados.mjs          # mostra o que existe
 *   node scripts/remover-bucket-certificados.mjs --apply  # apaga
 *
 * Lista os objetos ANTES de apagar de propósito: se houver certificado ali, a
 * pessoa que rodar precisa ver isso antes, não depois.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "certificados";
const aplicar = process.argv.includes("--apply");

function carregarEnv() {
  for (const arquivo of [".env.local", ".env"]) {
    if (!existsSync(arquivo)) continue;
    for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  carregarEnv();
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias (.env.local).");
  }
  const db = createClient(url, chave, { auth: { persistSession: false } });

  const { data: buckets, error: erroLista } = await db.storage.listBuckets();
  if (erroLista) throw new Error(`Falha ao listar buckets: ${erroLista.message}`);

  if (!buckets.some((b) => b.name === BUCKET)) {
    console.log(`Bucket "${BUCKET}" não existe — nada a fazer.`);
    return;
  }

  const { data: objetos, error: erroObj } = await db.storage.from(BUCKET).list("", { limit: 1000 });
  if (erroObj) throw new Error(`Falha ao listar objetos: ${erroObj.message}`);

  console.log(`Bucket "${BUCKET}" existe, com ${objetos?.length ?? 0} entrada(s) na raiz.`);
  for (const o of objetos ?? []) console.log(`  · ${o.name}`);

  if (!aplicar) {
    console.log("\n(dry-run — nada foi apagado. Use --apply para remover.)");
    process.exitCode = objetos?.length ? 10 : 0;
    return;
  }

  const { error: erroEsvaziar } = await db.storage.emptyBucket(BUCKET);
  if (erroEsvaziar) throw new Error(`Falha ao esvaziar: ${erroEsvaziar.message}`);

  const { error: erroApagar } = await db.storage.deleteBucket(BUCKET);
  if (erroApagar) throw new Error(`Falha ao remover o bucket: ${erroApagar.message}`);

  console.log(`\nBucket "${BUCKET}" removido. Certificado A1 agora fica só com o provider.`);
}

main().catch((e) => {
  console.error(`\nERRO: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
