import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type PaginaDeClientes } from "@/services/clientes";

/**
 * Controle de paginação da lista de clientes (item A8).
 *
 * Server Component com links de verdade em vez de estado no cliente: assim a
 * página é compartilhável, o botão "voltar" do navegador funciona e a lista
 * continua renderizando no servidor.
 *
 * A contagem ("51–100 de 1.240") não é enfeite. Ela é o que impede a paginação
 * de virar truncamento silencioso: sem o total, uma lista cortada em 50 é
 * visualmente indistinguível de um tenant que só tem 50 clientes.
 */
export function Paginacao({ pagina, busca }: { pagina: PaginaDeClientes; busca?: string }) {
  const { total, porPagina, itens } = pagina;
  if (total <= porPagina) return null;

  const primeiro = (pagina.pagina - 1) * porPagina + 1;
  const ultimo = primeiro + itens.length - 1;
  const ultimaPagina = Math.max(1, Math.ceil(total / porPagina));

  const href = (n: number) => {
    const qs = new URLSearchParams();
    qs.set("pagina", String(n));
    if (busca) qs.set("busca", busca);
    return `/dashboard/clientes?${qs.toString()}`;
  };

  const botao = "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm";
  const ativo = `${botao} border-slate-300 text-slate-700 hover:bg-slate-50`;
  const inativo = `${botao} border-slate-200 text-slate-300 pointer-events-none`;

  return (
    <nav
      aria-label="Paginação de clientes"
      className="mt-4 flex items-center justify-between gap-4"
    >
      <p className="text-sm text-slate-500">
        {primeiro}–{ultimo} de {total.toLocaleString("pt-BR")}
      </p>

      <div className="flex items-center gap-2">
        <Link
          href={href(pagina.pagina - 1)}
          className={pagina.pagina > 1 ? ativo : inativo}
          aria-disabled={pagina.pagina <= 1}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Anterior
        </Link>
        <span className="text-sm text-slate-400">
          {pagina.pagina} / {ultimaPagina}
        </span>
        <Link
          href={href(pagina.pagina + 1)}
          className={pagina.temMais ? ativo : inativo}
          aria-disabled={!pagina.temMais}
        >
          Próxima
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}
