"use client";

import { useState, useTransition } from "react";
import { ArrowRight, HelpCircle, Loader2 } from "lucide-react";
import { criarEmpresaAction, type OnboardingResult } from "./actions";

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

export function FormularioOnboarding({ emailSugerido }: { emailSugerido: string }) {
  const [salvando, startTransition] = useTransition();
  const [resultado, setResultado] = useState<OnboardingResult | null>(null);

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const r = await criarEmpresaAction(formData);
          // Em caso de sucesso a action redireciona; só chega aqui com erro
          setResultado(r);
        })
      }
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-slate-600">Razão social *</span>
          <input name="razaoSocial" required className={inputClasses} />
          <Ajuda>Exatamente como está no cartão CNPJ da Receita Federal.</Ajuda>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Nome fantasia</span>
          <input name="nomeFantasia" className={inputClasses} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">CNPJ *</span>
          <input
            name="cnpj"
            required
            inputMode="numeric"
            pattern="\d{14}"
            maxLength={14}
            placeholder="00000000000000"
            className={inputClasses}
          />
          <Ajuda>Somente os 14 números, sem pontos ou barras.</Ajuda>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Código do município (IBGE) *</span>
          <input
            name="codigoMunicipioIbge"
            required
            inputMode="numeric"
            pattern="\d{7}"
            maxLength={7}
            placeholder="3550308"
            className={inputClasses}
          />
          <Ajuda>7 dígitos — busque &quot;código IBGE + sua cidade&quot; no Google.</Ajuda>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Inscrição municipal</span>
          <input name="inscricaoMunicipal" className={inputClasses} />
          <Ajuda>Se não tiver em mãos, deixe em branco — dá para preencher depois.</Ajuda>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Regime tributário *</span>
          <select name="regimeTributario" defaultValue="simples_nacional" className={inputClasses}>
            <option value="simples_nacional">Simples Nacional</option>
            <option value="mei">MEI</option>
            <option value="lucro_presumido">Lucro Presumido</option>
            <option value="lucro_real">Lucro Real</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">E-mail de contato *</span>
          <input
            name="emailContato"
            type="email"
            required
            defaultValue={emailSugerido}
            className={inputClasses}
          />
        </label>
      </div>

      {resultado && !resultado.ok && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {resultado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={salvando}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {salvando ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="h-4 w-4" aria-hidden />
        )}
        {salvando ? "Criando sua empresa…" : "Concluir cadastro e entrar no painel"}
      </button>

      <p className="mt-3 text-center text-xs text-slate-400">
        Você poderá editar tudo depois em Configurações — inclusive enviar o certificado A1.
      </p>
    </form>
  );
}
