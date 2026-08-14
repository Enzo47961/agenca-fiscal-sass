"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { importarEmpresasAction, type ResultadoImportacaoAction } from "./actions";

/**
 * O arquivo é lido NO NAVEGADOR e enviado como texto.
 *
 * Não sobe para storage de propósito: o CSV traz CNPJ e e-mail dos clientes do
 * escritório, e guardar uma cópia desses dados num bucket criaria um segundo
 * lugar de onde eles podem vazar — sendo que eles já vão para o banco de forma
 * estruturada. Mesma razão de o certificado A1 não ficar conosco.
 */
export function FormularioImportacao() {
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [csv, setCsv] = useState<string>("");
  const [resultado, setResultado] = useState<ResultadoImportacaoAction | null>(null);
  const [enviando, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Arquivo CSV</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setResultado(null);
            if (!f) {
              setCsv("");
              setNomeArquivo(null);
              return;
            }
            setNomeArquivo(f.name);
            setCsv(await f.text());
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        />
      </label>

      <button
        type="button"
        disabled={!csv || enviando}
        onClick={() =>
          startTransition(async () => {
            setResultado(await importarEmpresasAction(csv));
          })
        }
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {enviando ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-4 w-4" aria-hidden />
        )}
        {enviando ? "Importando…" : "Importar"}
      </button>

      {nomeArquivo && !resultado && (
        <p className="mt-2 text-xs text-slate-500">Selecionado: {nomeArquivo}</p>
      )}

      {resultado && !resultado.ok && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-900">
          <p className="font-medium">{resultado.erro}</p>
          {resultado.colunasFaltando && (
            <p className="mt-1">Faltando: {resultado.colunasFaltando.join(", ")}.</p>
          )}
        </div>
      )}

      {resultado?.ok && (
        <div className="mt-4 space-y-3">
          <p
            role="status"
            className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
              resultado.importadas > 0 ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"
            }`}
          >
            {resultado.importadas > 0 ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>
              <strong>{resultado.importadas}</strong> de {resultado.total} empresa(s) importada(s).
            </span>
          </p>

          {/*
            O relatorio lista TODAS as linhas com problema, nao a primeira. Um
            arquivo de 300 linhas com 20 erros levaria 20 rodadas de tentativa
            se mostrasse um por vez.
          */}
          {resultado.erros.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              <p className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                {resultado.erros.length} linha(s) não importada(s)
              </p>
              <ul className="max-h-72 overflow-y-auto text-xs">
                {resultado.erros.map((e) => (
                  <li
                    key={`${e.linha}-${e.cnpj}`}
                    className="flex gap-3 border-b border-slate-100 px-3 py-2 last:border-0"
                  >
                    <span className="shrink-0 font-medium text-slate-500">Linha {e.linha}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{e.cnpj || "—"}</span>
                    <span className="text-red-800">{e.erro}</span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                Corrija estas linhas num arquivo novo e importe de novo. As que já entraram não
                serão duplicadas — o CNPJ repetido é recusado.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
