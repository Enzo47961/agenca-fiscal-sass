"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { baixarCsvAction } from "./actions";
import type { Periodo } from "@/services/relatorios";

const input =
  "rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

/**
 * Período na URL, não em estado local.
 *
 * Assim o relatório é compartilhável e sobrevive ao F5: o contador manda o link
 * do fechamento de agosto para o sócio e os dois veem a mesma coisa. Guardado
 * em `useState`, o mesmo endereço mostraria períodos diferentes para cada um.
 */
export function FiltroPeriodo({ periodo }: { periodo: Periodo }) {
  const router = useRouter();
  const params = useSearchParams();
  const [inicio, setInicio] = useState(periodo.inicio);
  const [fim, setFim] = useState(periodo.fim);
  const [indo, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const novo = new URLSearchParams(params.toString());
        novo.set("inicio", inicio);
        novo.set("fim", fim);
        startTransition(() => router.push(`/dashboard/relatorios?${novo.toString()}`));
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs text-slate-600">De</span>
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-600">Até</span>
        <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={input} />
      </label>
      <button
        type="submit"
        disabled={indo}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
      >
        {indo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
        Aplicar
      </button>
    </form>
  );
}

/**
 * Baixa o CSV.
 *
 * Server Action devolvendo texto, e o download montado no cliente: a alternativa
 * seria uma rota que refaz a consulta, e aí o arquivo poderia divergir da tela
 * se alguém emitisse uma nota entre um e outro.
 */
export function BaixarCsv({ periodo }: { periodo: Periodo }) {
  const [baixando, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={baixando}
        onClick={() =>
          startTransition(async () => {
            setErro(null);
            const r = await baixarCsvAction(periodo);
            if (!r.ok) {
              setErro(r.erro);
              return;
            }
            const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `carteira-${periodo.inicio}-a-${periodo.fim}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          })
        }
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {baixando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
        Baixar planilha
      </button>
      {erro && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
