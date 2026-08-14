import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, BarChart3 } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { formatarCentavos } from "@/types/domain";
import { PAPEL_LABEL } from "@/lib/papeis";
import {
  periodoPadrao,
  periodoSchema,
  relatorioDaCarteira,
  totalizar,
} from "@/services/relatorios";
import { BaixarCsv, FiltroPeriodo } from "./controles";

export const dynamic = "force-dynamic";

/**
 * Painel de parceiro: a carteira inteira num lugar só.
 *
 * O alcance NÃO vem da URL. `relatorio_carteira()` usa os vínculos do usuário —
 * não há parâmetro de empresa para forjar, e o pior que alguém consegue
 * mexendo no endereço é ver a própria carteira com outro período.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: { inicio?: string; fim?: string };
}) {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") redirect("/login");
  if (estado.tipo === "sem_empresa") redirect("/onboarding");

  const padrao = periodoPadrao();
  const parse = periodoSchema.safeParse({
    inicio: searchParams.inicio ?? padrao.inicio,
    fim: searchParams.fim ?? padrao.fim,
  });
  // Período inválido cai no padrão em vez de dar erro: quem mexeu na URL vê o
  // mês corrente, com o aviso, e não uma tela quebrada.
  const periodo = parse.success ? parse.data : padrao;
  const avisoPeriodo = parse.success ? null : parse.error.errors[0]?.message;

  const linhas = await relatorioDaCarteira(db, periodo);
  const t = totalizar(linhas);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar ao painel
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 className="h-6 w-6 text-brand-600" aria-hidden />
            Relatório da carteira
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Todas as empresas que você gerencia, no período escolhido.
          </p>
        </div>
        <BaixarCsv periodo={periodo} />
      </div>

      <section className="mt-6">
        <FiltroPeriodo periodo={periodo} />
        {avisoPeriodo && (
          <p role="alert" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {avisoPeriodo} Mostrando o mês corrente.
          </p>
        )}
      </section>

      <section aria-label="Totais" className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Cartao rotulo="Empresas na carteira" valor={String(t.empresas)} />
        <Cartao rotulo="Notas emitidas" valor={String(t.emitidas)} />
        <Cartao rotulo="Faturado no período" valor={formatarCentavos(t.faturadoCentavos)} />
        {/*
          Destaque em ambar quando ha empresa parada: e o unico numero desta
          tela sobre o qual da para AGIR. Cliente que nao emitiu no mes e
          cliente prestes a sair, e ele desapareceria num relatorio que so
          listasse quem teve movimento.
        */}
        <Cartao
          rotulo="Sem emissão no período"
          valor={String(t.empresasSemEmissao)}
          alerta={t.empresasSemEmissao > 0}
        />
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Acesso</th>
              <th className="px-4 py-3 text-right">Emitidas</th>
              <th className="px-4 py-3 text-right">Canceladas</th>
              <th className="px-4 py-3 text-right">Falhadas</th>
              <th className="px-4 py-3 text-right">Faturado</th>
              <th className="px-4 py-3">Última emissão</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma empresa na carteira ainda.
                </td>
              </tr>
            ) : (
              linhas.map((l) => (
                <tr key={l.empresaId} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.nomeFantasia ?? l.razaoSocial}</p>
                    <p className="text-xs tabular-nums text-slate-500">{l.cnpj}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {PAPEL_LABEL[l.papel] ?? l.papel}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${l.emitidas === 0 ? "text-amber-700" : ""}`}>
                    {l.emitidas}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{l.canceladas}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${l.falhadas > 0 ? "text-red-700" : "text-slate-500"}`}>
                    {l.falhadas}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatarCentavos(l.faturadoCentavos)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {l.ultimaEmissao
                      ? new Date(l.ultimaEmissao).toLocaleDateString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <p className="mt-4 text-xs text-slate-500">
        Faturado conta apenas notas <strong>emitidas</strong>. Cancelada e falhada aparecem em
        coluna própria e não somam — misturá-las daria um número que não bate com o que foi
        recebido.
      </p>
    </main>
  );
}

function Cartao({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        alerta ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${alerta ? "text-amber-900" : ""}`}>{valor}</p>
    </div>
  );
}
