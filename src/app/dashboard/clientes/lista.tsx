"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, Receipt, Save, X } from "lucide-react";
import { salvarClienteAction, type ActionResult } from "./actions";
import { type ClienteResumo } from "@/services/clientes";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export function ListaClientes({ clientes }: { clientes: ClienteResumo[] }) {
  const [editando, setEditando] = useState<ClienteResumo | "novo" | null>(null);
  const [salvando, startTransition] = useTransition();
  const [resultado, setResultado] = useState<ActionResult | null>(null);

  function abrirFormulario(alvo: ClienteResumo | "novo") {
    setResultado(null);
    setEditando(alvo);
  }

  function enviar(formData: FormData) {
    startTransition(async () => {
      const r = await salvarClienteAction(formData);
      setResultado(r);
      if (r.ok) setEditando(null);
    });
  }

  const emEdicao = editando !== null && editando !== "novo" ? editando : null;

  return (
    <div className="space-y-6">
      {editando === null ? (
        <button
          onClick={() => abrirFormulario("novo")}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Novo cliente
        </button>
      ) : (
        <form action={enviar} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">
              {emEdicao ? `Editando: ${emEdicao.nome}` : "Novo cliente"}
            </h2>
            <button
              type="button"
              onClick={() => setEditando(null)}
              aria-label="Fechar formulário"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {emEdicao && <input type="hidden" name="clienteId" value={emEdicao.id} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm text-slate-600">Nome / Razão social *</span>
              <input name="nome" required defaultValue={emEdicao?.nome} className={inputClasses} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">CPF ou CNPJ (só números) *</span>
              <input
                name="cpfCnpj"
                required
                inputMode="numeric"
                maxLength={14}
                defaultValue={emEdicao?.cpfCnpj}
                className={inputClasses}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">E-mail</span>
              <input name="email" type="email" defaultValue={emEdicao?.email ?? ""} className={inputClasses} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Telefone</span>
              <input name="telefone" defaultValue={emEdicao?.telefone ?? ""} className={inputClasses} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">CEP</span>
              <input name="cep" inputMode="numeric" maxLength={9} className={inputClasses} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm text-slate-600">Endereço (rua, número)</span>
              <div className="grid grid-cols-3 gap-2">
                <input name="logradouro" placeholder="Rua" className={`${inputClasses} col-span-2`} />
                <input name="numero" placeholder="Nº" className={inputClasses} />
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Bairro</span>
              <input name="bairro" className={inputClasses} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Cidade / UF</span>
              <div className="grid grid-cols-3 gap-2">
                <input name="municipio" placeholder="Cidade" className={`${inputClasses} col-span-2`} />
                <input name="uf" placeholder="UF" maxLength={2} className={inputClasses} />
              </div>
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
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {emEdicao ? "Salvar alterações" : "Cadastrar cliente"}
          </button>
        </form>
      )}

      {resultado?.ok && editando === null && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Cliente salvo com sucesso.
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        {clientes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Nenhum cliente ainda. Cadastre o primeiro para poder criar cobranças e emitir notas.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">CPF/CNPJ</th>
                <th className="px-5 py-3 font-medium">E-mail</th>
                <th className="px-5 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-medium">{c.nome}</td>
                  <td className="px-5 py-3 tabular-nums">{c.cpfCnpj}</td>
                  <td className="px-5 py-3 text-slate-500">{c.email ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => abrirFormulario(c)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                      >
                        <Pencil className="h-3 w-3" aria-hidden />
                        Editar
                      </button>
                      <Link
                        href={`/dashboard/cobrancas/nova?cliente=${c.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
                      >
                        <Receipt className="h-3 w-3" aria-hidden />
                        Cobrar
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
