"use client";

import { useState, useTransition } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { prepararCarteiraAction, type ResultadoPreparacaoAction } from "./actions";

/**
 * Botão que leva a carteira para emissão real.
 *
 * É UM GESTO EXPLÍCITO, e não efeito automático da importação, porque cadastrar
 * empresa no provedor fiscal é efeito colateral externo numa conta paga — e
 * irreversível do nosso lado. Importar uma planilha de teste não pode criar
 * CNPJs de verdade lá.
 *
 * O CONFIRMAR EXISTE PELO MESMO MOTIVO DO CANCELAMENTO DE NOTA: a ação atravessa
 * uma fronteira que o clique distraído não deveria atravessar. Aqui basta um
 * passo — diferente do cancelamento, isto não destrói nada —, mas ele precisa
 * existir.
 */
export function PrepararCarteira({ pendentes }: { pendentes: number }) {
  const [confirmando, setConfirmando] = useState(false);
  const [r, setR] = useState<ResultadoPreparacaoAction | null>(null);
  const [enviando, startTransition] = useTransition();

  if (pendentes === 0 && !r) {
    return (
      <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-900">
        <strong>Carteira preparada.</strong> Todas as empresas já estão cadastradas no provedor
        fiscal. O que falta para emitir é o certificado digital de cada uma.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <CloudUpload className="h-4 w-4 text-brand-600" aria-hidden />
        Preparar a carteira para emissão real
      </h2>

      <p className="mt-2 text-xs text-slate-600">
        Cadastra no provedor fiscal as empresas que ainda não estão lá — sem exigir o certificado
        digital agora. O processamento roda em segundo plano e respeita o limite de requisições
        do provedor, então uma carteira grande leva alguns minutos.
      </p>

      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={pendentes === 0}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Preparar {pendentes} empresa{pendentes === 1 ? "" : "s"}
        </button>
      ) : (
        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/60 p-3">
          <p className="text-xs text-slate-700">
            Isso cadastra {pendentes} empresa{pendentes === 1 ? "" : "s"} no provedor fiscal e
            passa o emissor de <strong>simulação</strong> para <strong>emissão real</strong>. A
            partir daí, nota emitida tem validade jurídica.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() =>
                startTransition(async () => {
                  const resultado = await prepararCarteiraAction();
                  setR(resultado);
                  setConfirmando(false);
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:underline"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {r && !r.ok && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900">
          {r.erro}
        </p>
      )}

      {r && r.ok && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-900">
          {r.enfileiradas === 0 ? (
            <>Nenhuma empresa pendente — a carteira já estava preparada.</>
          ) : (
            <>
              <strong>{r.enfileiradas}</strong> empresa
              {r.enfileiradas === 1 ? "" : "s"} enviada
              {r.enfileiradas === 1 ? "" : "s"} para cadastro. O processamento continua em segundo
              plano; atualize a página em alguns minutos para ver o resultado.
            </>
          )}
        </p>
      )}
    </div>
  );
}
