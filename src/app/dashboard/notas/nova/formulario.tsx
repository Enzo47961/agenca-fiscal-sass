"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, HelpCircle, Loader2, SendHorizonal } from "lucide-react";
import { emitirNotaAction, type EmissaoResult } from "./actions";
import { REGIME_IBSCBS_LABEL } from "@/lib/fiscal/reforma";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function Ajuda({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
      <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function FormularioEmissao({ clientes }: { clientes: Array<{ id: string; nome: string }> }) {
  const [enviando, startTransition] = useTransition();
  const [resultado, setResultado] = useState<EmissaoResult | null>(null);

  if (resultado?.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-green-900">Emissão solicitada!</h2>
        <p className="mt-1 text-sm text-green-800">
          A nota entrou na fila do motor de emissão. Se a prefeitura estiver fora do ar, ele tenta
          de novo sozinho — acompanhe o status no painel.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Ver status no painel
          </Link>
          <button
            onClick={() => setResultado(null)}
            className="text-sm text-green-700 underline underline-offset-2 hover:text-green-900"
          >
            Emitir outra nota
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => setResultado(await emitirNotaAction(formData)))
      }
      className="rounded-xl border border-slate-200 bg-white p-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-slate-600">Cliente (tomador) *</span>
          <select name="clienteId" required defaultValue="" className={inputClasses}>
            <option value="" disabled>
              Selecione…
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-slate-600">Descrição do serviço *</span>
          <textarea
            name="descricaoServico"
            required
            rows={3}
            placeholder="Ex.: Desenvolvimento de website institucional, conforme contrato."
            className={inputClasses}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Valor do serviço (R$) *</span>
          <input name="valor" required inputMode="decimal" placeholder="1500,00" className={inputClasses} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Código de serviço (LC 116) *</span>
          <input name="codigoServico" required placeholder="01.05" maxLength={5} className={inputClasses} />
          <Ajuda>Formato XX.XX — confira no verificador em Configurações.</Ajuda>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Alíquota de ISS (%) *</span>
          <input
            name="aliquotaIss"
            required
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="5"
            className={inputClasses}
          />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="issRetido" className="h-4 w-4 rounded border-slate-300" />
          <span className="text-sm text-slate-600">ISS retido pelo tomador</span>
        </label>

        <div className="sm:col-span-2 mt-2 border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            Reforma tributária (CBS/IBS)
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Código NBS</span>
          <input name="codigoNbs" placeholder="Opcional por enquanto" className={inputClasses} />
          <Ajuda>Nomenclatura Brasileira de Serviços — substitui o código municipal na reforma.</Ajuda>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Regime IBS/CBS</span>
          <select name="regimeIbsCbs" defaultValue="padrao" className={inputClasses}>
            {Object.entries(REGIME_IBSCBS_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
          <Ajuda>CBS/IBS são calculados automaticamente conforme o regime e a competência.</Ajuda>
        </label>
      </div>

      {resultado && !resultado.ok && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {resultado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SendHorizonal className="h-4 w-4" aria-hidden />}
        {enviando ? "Enviando para o motor…" : "Emitir nota fiscal"}
      </button>
    </form>
  );
}
