"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, Mail, Trash2 } from "lucide-react";
import { convidarAction, revogarConviteAction } from "./actions";
// De `lib/papeis`, nao de `services/convites`: este e client component e o
// service importa node:crypto, que nao existe no browser.
import { PAPEL_DESCRICAO, PAPEL_LABEL, type ConvitePendente } from "@/lib/papeis";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export function FormularioConvite() {
  const [enviando, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      className="rounded-xl border border-slate-200 bg-white p-4"
      action={(fd) =>
        startTransition(async () => {
          setErro(null);
          setAviso(null);
          setOk(false);
          const r = await convidarAction(fd);
          if (r.ok) {
            setOk(true);
            if (r.aviso) setAviso(r.aviso);
          } else {
            setErro(r.erro);
          }
        })
      }
    >
      <p className="text-sm font-medium text-slate-700">Convidar para esta empresa</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-600">E-mail</span>
          <input type="email" name="email" required placeholder="pessoa@empresa.com.br" className={input} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-slate-600">Nível de acesso</span>
          <select name="papel" defaultValue="operador" className={input}>
            <option value="operador">{PAPEL_LABEL.operador}</option>
            <option value="admin">{PAPEL_LABEL.admin}</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {enviando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Mail className="h-4 w-4" aria-hidden />
          )}
          Convidar
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">{PAPEL_DESCRICAO.operador}</p>

      {ok && !aviso && (
        <p role="status" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Convite enviado. Vale por 7 dias e só funciona para o e-mail informado.
        </p>
      )}
      {/*
        O aviso existe para o caso em que o convite foi criado mas o e-mail nao
        saiu. Dizer apenas "convidado" ali seria mentira operacional: ninguem
        receberia nada e o administrador so descobriria pela cobranca do outro
        lado. Com o link em maos, ele resolve na hora.
      */}
      {aviso && (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 break-all">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {erro}
        </p>
      )}
    </form>
  );
}

export function ListaConvites({ convites }: { convites: ConvitePendente[] }) {
  const [revogando, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (convites.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
        Nenhum convite pendente.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-medium">Convites pendentes</h2>
      </div>
      <ul>
        {convites.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
            <div className="min-w-0">
              <p className="truncate text-sm">{c.email}</p>
              <p className="text-xs text-slate-500">
                {PAPEL_LABEL[c.papel] ?? c.papel} ·{" "}
                {c.expirado ? (
                  <span className="text-red-600">expirado</span>
                ) : (
                  <>expira em {new Date(c.expiraEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</>
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={revogando}
              onClick={() =>
                startTransition(async () => {
                  setErro(null);
                  const r = await revogarConviteAction(c.id);
                  if (!r.ok) setErro(r.erro);
                })
              }
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:border-red-300 hover:text-red-700 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Revogar
            </button>
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="border-t border-slate-100 px-4 py-2 text-xs text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
