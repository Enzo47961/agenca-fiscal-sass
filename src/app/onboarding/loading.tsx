/**
 * `/onboarding` é a última rota dinâmica fora de `/dashboard`, e por isso não
 * era coberta pelo `loading.tsx` do painel.
 *
 * Chega-se a ela por redirecionamento depois do cadastro, não por clique — mas
 * o travamento é o mesmo, e aqui ele custa mais caro: é a PRIMEIRA tela de quem
 * acabou de criar conta. Alguns segundos de tela parada, logo depois de
 * confirmar o e-mail, parecem cadastro que não funcionou.
 *
 * Esqueleto de formulário, não de tabela, porque é o que a página de fato
 * mostra — um esqueleto que não corresponde ao conteúdo desloca tudo quando o
 * real chega, e o salto incomoda mais que a espera.
 */
export default function CarregandoOnboarding() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      <div className="animate-pulse">
        <div className="h-7 w-64 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-full max-w-sm rounded bg-slate-100" />

        <div className="mt-8 space-y-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-3.5 w-32 rounded bg-slate-100" />
              <div className="mt-1.5 h-10 w-full rounded-lg bg-slate-100" />
            </div>
          ))}
          <div className="h-11 w-full rounded-lg bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
