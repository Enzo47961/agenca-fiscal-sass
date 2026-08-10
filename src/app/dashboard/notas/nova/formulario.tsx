"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, HelpCircle, Loader2, SendHorizonal } from "lucide-react";
import { emitirNotaAction, type EmissaoResult } from "./actions";
import { REGIME_IBSCBS_LABEL, TIPO_AJUSTE_BASE_LABEL } from "@/lib/fiscal/reforma";
import { REGIMES_NBS_SOB_DUVIDA } from "@/lib/fiscal/regimes";

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

export function FormularioEmissao({
  clientes,
  regimeTributario,
}: {
  clientes: Array<{ id: string; nome: string }>;
  regimeTributario: string | null;
}) {
  const [enviando, startTransition] = useTransition();
  const [resultado, setResultado] = useState<EmissaoResult | null>(null);
  // C7: a confirmação só faz sentido — e só é exigida — fora do regime padrão.
  const [regime, setRegime] = useState<string>("padrao");
  const regimeDiferenciado = regime !== "padrao";

  const nbsSobDuvida = REGIMES_NBS_SOB_DUVIDA.some((r) => r === regimeTributario);

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
          {/*
            O texto anterior afirmava que o NBS "substitui o código municipal na
            reforma". Não é o que a pesquisa sustenta: o papel do NBS ainda é
            pendência aberta (P3 em PENDENCIAS_C5 — o Anexo VIII, de correlação,
            não pôde ser lido). Prometer substituição levaria o usuário a parar
            de preencher o código de serviço, que continua obrigatório.
          */}
          <Ajuda>
            Nomenclatura Brasileira de Serviços. Opcional hoje e <strong>não substitui</strong> o
            código de serviço da LC 116 — preencha os dois quando tiver o NBS.
          </Ajuda>
          {/*
            A7. O NBS segue OPCIONAL para todos os regimes — as fontes divergem
            sobre a exigência no lucro presumido/real, e bloquear o envio com
            base em fonte não confirmada impediria alguém de faturar. O aviso
            informa sem impedir; se a norma se confirmar, vira validação.
          */}
          {nbsSobDuvida ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No seu regime, há indicação de que o NBS venha a ser exigido — as fontes ainda
              divergem e não estamos bloqueando. Se você já tem o código, preencha.
            </p>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Regime IBS/CBS</span>
          <select
            name="regimeIbsCbs"
            value={regime}
            onChange={(e) => setRegime(e.target.value)}
            className={inputClasses}
          >
            {Object.entries(REGIME_IBSCBS_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
          <Ajuda>CBS/IBS são calculados automaticamente conforme o regime e a competência.</Ajuda>
        </label>

        {/*
          C7. Regime diferenciado era escolha livre: qualquer operador marcava
          "redução de 60%" em qualquer nota, sem vínculo com a atividade. Isto
          NÃO valida elegibilidade — validar exige a correlação atividade ↔
          regime, que é decisão contábil e ainda não existe. O que faz é tirar o
          "cliquei sem ver" e registrar quem confirmou, na própria nota.

          `required` no checkbox: o navegador barra antes do envio, e o schema
          barra de novo no servidor — a UI não é a validação.
        */}
        {regimeDiferenciado ? (
          <div className="sm:col-span-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                name="confirmacaoRegime"
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-400"
              />
              <span className="text-sm text-amber-900">
                Confirmo que esta atividade se enquadra em{" "}
                <strong>{REGIME_IBSCBS_LABEL[regime as keyof typeof REGIME_IBSCBS_LABEL]}</strong>.
                <span className="mt-1 block text-xs text-amber-800">
                  A confirmação fica registrada nesta nota com seu usuário e a data. Em caso de
                  dúvida sobre o enquadramento, consulte seu contador antes de emitir — a partir de
                  2027 o enquadramento indevido vira recolhimento a menor.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {/*
          Deduções da base (NT-009). Recolhidas num <details> porque a nota
          comum não tem nenhuma delas: quem não abrir isto emite com
          base = valor − ISSQN, que é o caso normal do prestador de serviço.
          Deixar os seis campos sempre visíveis sugeriria que precisam ser
          preenchidos.
        */}
        <details className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Deduções da base de cálculo (opcional)
          </summary>

          <p className="mt-2 text-xs text-slate-500">
            A base do IBS/CBS é o valor do serviço menos estas deduções — não o valor bruto.
            Deixe em branco o que não se aplica.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Desconto incondicionado (R$)</span>
              <input name="descontoIncondicionado" inputMode="decimal" placeholder="0,00" className={inputClasses} />
              <Ajuda>Só o incondicionado — desconto por pagamento antecipado não entra.</Ajuda>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">ISSQN (R$)</span>
              <input name="issqn" inputMode="decimal" placeholder="calculado pela alíquota" className={inputClasses} />
              <Ajuda>
                Em branco, é calculado como (valor − desconto) × alíquota de ISS. Informe
                <strong> 0</strong> se não há ISSQN a deduzir — é diferente de deixar vazio.
              </Ajuda>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Ajuste de base (R$)</span>
              <input name="ajusteBase" inputMode="decimal" placeholder="0,00" className={inputClasses} />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Tipo do ajuste</span>
              <select name="tipoAjusteBase" defaultValue="" className={inputClasses}>
                <option value="">Nenhum</option>
                {Object.entries(TIPO_AJUSTE_BASE_LABEL).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
              <Ajuda>Obrigatório quando há ajuste: cada tipo sai numa tag diferente da nota.</Ajuda>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">PIS (R$)</span>
              <input name="pis" inputMode="decimal" placeholder="0,00" className={inputClasses} />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">COFINS (R$)</span>
              <input name="cofins" inputMode="decimal" placeholder="0,00" className={inputClasses} />
              <Ajuda>
                PIS e COFINS só são dedutíveis até 2026 — os tributos deixam de existir depois.
              </Ajuda>
            </label>
          </div>
        </details>
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
