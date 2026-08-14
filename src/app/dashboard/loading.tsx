/**
 * ESTADO DE CARREGAMENTO DO PAINEL
 *
 * O PROBLEMA QUE ELE RESOLVE. Todas as páginas do painel são `force-dynamic` —
 * correto, porque status de nota muda a cada retry e não pode vir de cache. Mas
 * sem um `loading.tsx` o App Router não tem fronteira de Suspense na navegação:
 * o browser fica parado na tela ANTIGA até o servidor terminar de renderizar,
 * queries incluídas. Para quem clicou, o botão simplesmente não respondeu, e a
 * reação natural é clicar de novo.
 *
 * Com este arquivo, o Next envolve o segmento em Suspense e pinta isto na hora,
 * enquanto o servidor trabalha e faz stream do conteúdo real. A navegação passa
 * a ser instantânea de verdade — não "mais rápida", instantânea: a primeira
 * pintura não espera mais o banco.
 *
 * Fica em `/dashboard` e não em cada rota de propósito: assim vale para toda
 * página do painel, inclusive as que ainda não existem. Um `loading.tsx` por
 * pasta deixaria a próxima página nova sem cobertura — o mesmo raciocínio da
 * faixa de simulação no layout.
 *
 * `animate-pulse` no lugar de spinner porque o esqueleto mostra ONDE o conteúdo
 * vai aparecer, o que reduz o salto de layout quando ele chega.
 */
export default function CarregandoPainel() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      <div className="animate-pulse">
        <div className="h-7 w-56 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-80 rounded bg-slate-100" />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="h-4 w-24 rounded bg-slate-100" />
              <div className="mt-3 h-7 w-16 rounded bg-slate-200" />
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="h-4 w-40 rounded bg-slate-100" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-slate-50 px-4 py-3.5">
              <div className="h-4 flex-1 rounded bg-slate-100" />
              <div className="h-4 w-24 rounded bg-slate-100" />
              <div className="h-6 w-20 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
