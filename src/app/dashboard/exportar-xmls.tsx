"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

/**
 * Exportação dos XMLs da competência.
 *
 * Client component por um motivo específico: a rota devolve **ou** um ZIP
 * **ou** um JSON de erro, e um `<a href>` simples não sabe distinguir os dois —
 * o navegador baixaria um arquivo chamado `.zip` contendo a mensagem de erro.
 * Buscando por `fetch`, dá para ler o status, mostrar o erro na tela e só
 * disparar o download quando a resposta é de fato um pacote.
 *
 * Os cabeçalhos `X-Notas-*` viram o aviso de pacote incompleto. Sem isso, um
 * ZIP com 498 de 500 notas entraria na contabilidade parecendo completo — e o
 * erro só apareceria no fechamento, longe daqui.
 */
export function ExportarXmls({ competenciaPadrao }: { competenciaPadrao: string }) {
  const [competencia, setCompetencia] = useState(competenciaPadrao);
  const [escopo, setEscopo] = useState<"empresa" | "carteira">("empresa");
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function exportar() {
    setBaixando(true);
    setErro(null);
    setAviso(null);
    try {
      const resp = await fetch(
        `/api/notas/exportar?competencia=${encodeURIComponent(competencia)}&escopo=${escopo}`,
      );

      if (!resp.ok) {
        const corpo: unknown = await resp.json().catch(() => null);
        const msg =
          corpo && typeof corpo === "object" && "erro" in corpo
            ? String((corpo as { erro: unknown }).erro)
            : `Falha na exportação (HTTP ${resp.status}).`;
        setErro(msg);
        return;
      }

      const semXml = Number(resp.headers.get("X-Notas-Sem-Xml") ?? 0);
      const falhas = Number(resp.headers.get("X-Notas-Falha-Download") ?? 0);
      if (semXml > 0 || falhas > 0) {
        const partes: string[] = [];
        if (semXml > 0) partes.push(`${semXml} sem XML (emissor em simulação)`);
        if (falhas > 0) partes.push(`${falhas} não baixaram do provedor`);
        setAviso(`Pacote incompleto: ${partes.join(" e ")}.`);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nfse-${competencia}-${escopo}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível conectar. Verifique sua internet e tente de novo.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">Exportar XMLs para a contabilidade</p>
      <p className="mt-1 text-xs text-slate-500">
        Baixa em um ZIP os XMLs das notas emitidas no mês — é o arquivo que entra na escrituração.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-600">Competência</span>
          <input
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-slate-600">Alcance</span>
          <select
            value={escopo}
            onChange={(e) => setEscopo(e.target.value as "empresa" | "carteira")}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="empresa">Só a empresa ativa</option>
            <option value="carteira">Carteira inteira</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => void exportar()}
          disabled={baixando || !competencia}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {baixando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {baixando ? "Preparando…" : "Baixar ZIP"}
        </button>
      </div>

      {erro && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {aviso}
        </p>
      )}
    </div>
  );
}
