"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Copy, ExternalLink, HelpCircle, Loader2, Send } from "lucide-react";
import { criarCobrancaAction, type CobrancaResult } from "./actions";

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

export function FormularioCobranca({
  clientes,
  clientePreSelecionado,
}: {
  clientes: Array<{ id: string; nome: string }>;
  clientePreSelecionado?: string;
}) {
  const [enviando, startTransition] = useTransition();
  const [resultado, setResultado] = useState<CobrancaResult | null>(null);
  const [copiado, setCopiado] = useState(false);

  const hoje = new Date();
  hoje.setDate(hoje.getDate() + 3);
  const vencimentoPadrao = hoje.toISOString().slice(0, 10);

  async function copiarLink(link: string) {
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (resultado?.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-green-900">Cobrança criada!</h2>
        <p className="mt-1 text-sm text-green-800">
          Envie o link para o cliente. Assim que ele pagar, a nota fiscal sai automaticamente.
        </p>
        {resultado.linkFatura && (
          <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <a
              href={resultado.linkFatura}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Abrir fatura
            </a>
            <button
              onClick={() => void copiarLink(resultado.linkFatura ?? "")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" aria-hidden />
              {copiado ? "Copiado!" : "Copiar link"}
            </button>
          </div>
        )}
        <button
          onClick={() => setResultado(null)}
          className="mt-4 text-sm text-green-700 underline underline-offset-2 hover:text-green-900"
        >
          Criar outra cobrança
        </button>
      </div>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => setResultado(await criarCobrancaAction(formData)))
      }
      className="rounded-xl border border-slate-200 bg-white p-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-slate-600">Cliente *</span>
          <select
            name="clienteId"
            required
            defaultValue={clientePreSelecionado ?? ""}
            className={inputClasses}
          >
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
          <input
            name="descricaoServico"
            required
            placeholder="Ex.: Consultoria de marketing — julho/2026"
            className={inputClasses}
          />
          <Ajuda>Este texto sai na fatura e na nota fiscal.</Ajuda>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Valor (R$) *</span>
          <input
            name="valor"
            required
            inputMode="decimal"
            placeholder="1500,00"
            className={inputClasses}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Vencimento *</span>
          <input
            name="vencimento"
            type="date"
            required
            defaultValue={vencimentoPadrao}
            className={inputClasses}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Código de serviço (LC 116) *</span>
          <input
            name="codigoServico"
            required
            placeholder="01.05"
            maxLength={5}
            className={inputClasses}
          />
          <Ajuda>O mesmo código que você confere nas Configurações (formato XX.XX).</Ajuda>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Alíquota de ISS (%) *</span>
          <input
            name="aliquotaIss"
            required
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="5"
            className={inputClasses}
          />
          <Ajuda>Confira a alíquota do seu serviço no site da prefeitura (geralmente 2% a 5%).</Ajuda>
        </label>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="issRetido" className="h-4 w-4 rounded border-slate-300" />
          <span className="text-sm text-slate-600">ISS retido pelo tomador</span>
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
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        {enviando ? "Criando cobrança…" : "Criar cobrança e gerar link"}
      </button>
    </form>
  );
}
