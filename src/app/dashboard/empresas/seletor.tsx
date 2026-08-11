"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { trocarEmpresaAtivaAction, type EmpresaDaCarteira } from "./actions";

/** CNPJ só com dígitos → 00.000.000/0000-00. */
function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Seletor da empresa ativa.
 *
 * Só é renderizado quando a carteira tem mais de uma empresa — quem tem uma só
 * não deve nem saber que existe troca. O nome da empresa ativa aparece SEMPRE
 * (ver `EmpresaAtiva`), porque emitir nota fiscal no CNPJ errado é o tipo de
 * engano que ninguém desfaz.
 */
export function SeletorEmpresa({
  empresas,
  empresaAtivaId,
}: {
  empresas: EmpresaDaCarteira[];
  empresaAtivaId: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [trocando, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const ativa = empresas.find((e) => e.empresaId === empresaAtivaId);

  function trocar(id: string) {
    if (id === empresaAtivaId) {
      setAberto(false);
      return;
    }
    startTransition(async () => {
      const r = await trocarEmpresaAtivaAction(id);
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível trocar de empresa.");
        return;
      }
      setAberto(false);
      setErro(null);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        disabled={trocando}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60 sm:w-auto"
      >
        <Building2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span className="flex-1 truncate font-medium">
          {ativa?.nomeFantasia || ativa?.razaoSocial || "Selecione a empresa"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>

      {aberto ? (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-1 max-h-80 w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {empresas.map((e) => {
            const ativo = e.empresaId === empresaAtivaId;
            return (
              <button
                key={e.empresaId}
                type="button"
                role="option"
                aria-selected={ativo}
                onClick={() => trocar(e.empresaId)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <Check
                  className={`mt-0.5 h-4 w-4 shrink-0 ${ativo ? "text-brand-600" : "text-transparent"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">
                    {e.nomeFantasia || e.razaoSocial}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {formatarCnpj(e.cnpj)} · {e.papel}
                  </span>
                </span>
              </button>
            );
          })}

          <div className="mt-1 border-t border-slate-100 pt-1">
            <Link
              href="/onboarding?nova=1"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Adicionar empresa
            </Link>
          </div>
        </div>
      ) : null}

      {erro ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Identificação da empresa ativa para quem tem só uma.
 *
 * Existe separado do seletor porque a informação é necessária mesmo sem troca:
 * o usuário precisa saber em nome de qual CNPJ está emitindo, e um painel sem
 * essa âncora convida ao erro assim que a segunda empresa aparecer.
 */
export function EmpresaAtiva({ empresa }: { empresa: EmpresaDaCarteira }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-slate-500">
      <Building2 className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">
        {empresa.nomeFantasia || empresa.razaoSocial}
        <span className="text-slate-400"> · {formatarCnpj(empresa.cnpj)}</span>
      </span>
    </p>
  );
}
