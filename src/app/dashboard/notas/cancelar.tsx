"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2 } from "lucide-react";
import { cancelarNotaAction } from "./actions";

const MIN = 15;
const MAX = 255;

/**
 * Pedido de cancelamento de uma nota emitida.
 *
 * DUAS PROTEÇÕES CONTRA O CLIQUE ERRADO, e elas existem porque cancelamento é
 * irreversível: nota cancelada na prefeitura não descancela.
 *
 *   1. A justificativa de 15 caracteres (exigência do provedor fiscal) já
 *      obriga a parar e escrever o motivo — ninguém cancela por engano tendo
 *      que digitar uma frase.
 *   2. O botão só habilita com o texto no tamanho, e o contador mostra quanto
 *      falta. Descobrir o mínimo pela mensagem de erro do servidor seria
 *      trabalho jogado fora.
 *
 * O aviso sobre o PRAZO é honesto de propósito: ele é municipal e o sistema não
 * o conhece. Prometer "vai dar certo" e a prefeitura recusar é pior que avisar.
 *
 * APARÊNCIA DO BOTÃO. Ele era cinza até o hover e passava por rótulo estático —
 * o usuário relatou ter descoberto que era clicável por acidente. Agora é
 * vermelho, com borda e fundo: lê-se como botão e como ação destrutiva no mesmo
 * olhar.
 *
 * Vermelho DELINEADO, não preenchido, e isso é deliberado. Botão sólido teria o
 * mesmo peso visual de "Emitir nota" e convidaria o clique distraído numa ação
 * que não se desfaz. O contorno resolve as duas coisas: encontra-se de longe e
 * não se aperta sem querer.
 */
export function BotaoCancelar({ notaId, numeroNfse }: { notaId: string; numeroNfse: string }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const faltam = MIN - texto.trim().length;
  const valido = texto.trim().length >= MIN && texto.trim().length <= MAX;

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-100"
      >
        <Ban className="h-3.5 w-3.5" aria-hidden />
        Cancelar nota
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
      <p className="text-xs font-medium text-red-900">
        Cancelar a nota nº {numeroNfse}
      </p>
      <p className="mt-1 text-xs text-red-800">
        O cancelamento é definitivo e depende da prefeitura aceitar — o prazo varia por
        município. Se ela recusar, a nota continua válida e você verá o motivo.
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-slate-700">Motivo do cancelamento</span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          maxLength={MAX}
          placeholder="Ex.: valor do serviço digitado incorretamente na emissão"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          {faltam > 0
            ? `Faltam ${faltam} caractere(s) — a prefeitura exige ao menos ${MIN}.`
            : `${texto.trim().length}/${MAX} caracteres.`}
        </span>
      </label>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!valido || enviando}
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await cancelarNotaAction(notaId, texto.trim());
              if (!r.ok) setErro(r.erro);
              else setAberto(false);
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Confirmar cancelamento
        </button>
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:underline"
        >
          Voltar
        </button>
      </div>

      {erro && (
        <p role="alert" className="mt-2 rounded bg-red-100 px-2 py-1.5 text-xs text-red-900">
          {erro}
        </p>
      )}
    </div>
  );
}
