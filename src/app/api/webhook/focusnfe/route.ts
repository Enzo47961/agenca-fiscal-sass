import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { focusNfeEnv, serverEnv } from "@/lib/env";
import { FocusNfeProvider } from "@/lib/fiscal/providers/focusnfe";
import { isFiscalError } from "@/lib/fiscal/provider";
import { tokenConfere } from "@/lib/webhook-token";

/**
 * Webhook (gatilho) da Focus NFe.
 *
 * A emissão na Focus é ASSÍNCRONA: o POST de emissão só confirma recebimento
 * (`processando_autorizacao`) e a autorização real da prefeitura chega depois.
 * Este handler é o caminho rápido para registrar esse desfecho.
 *
 * SEGURANÇA — o corpo do webhook é tratado como DADO, nunca como verdade:
 *   1. Se FOCUSNFE_WEBHOOK_TOKEN estiver configurado, exigimos o header
 *      `x-focusnfe-token` antes de qualquer I/O (mesma ordem do webhook Asaas).
 *   2. Independentemente disso, RECONSULTAMOS a API da Focus com o nosso token
 *      antes de gravar. Um POST forjado com `status: autorizado` não consegue
 *      marcar nota nenhuma como emitida, porque quem decide é a consulta.
 *   3. `ref` é a `referencia_externa` (UUID gerado por nós na criação da nota,
 *      regra 7). O `empresa_id` vem SEMPRE da linha da nota, nunca do corpo
 *      do webhook (regra 3).
 *
 * Regra 2: admin client permitido aqui porque a origem é validada antes do I/O.
 *
 * DECISÃO DE DESENHO — este handler NÃO transiciona o status da nota.
 * Quem é dono da máquina de estados é o motor Inngest (regras 5 e 6): ele está
 * no meio de um `step.sleep` do backoff e, na próxima tentativa, chama
 * `consultarPorReferencia()` antes de reemitir, encontra a nota autorizada e
 * faz a transição `reprocessando → emitida` normalmente. Se este webhook
 * transicionasse por conta própria, o passo `gravar-emissao` do motor falharia
 * depois com "Transição inválida: emitida -> emitida", poluindo o log de uma
 * emissão que na verdade deu certo. O que fazemos aqui é gravar os dados da
 * autorização (idempotente, só preenche o que está vazio) para que o desfecho
 * fique registrado imediatamente, sem corrida com o motor.
 */

/** Só o `ref` é usado como entrada real — o resto é registrado para diagnóstico. */
const gatilhoFocusSchema = z.object({
  ref: z.string().min(1),
  status: z.string().nullish(),
  cnpj_emitente: z.string().nullish(),
});

export async function POST(request: NextRequest) {
  // 1. Autenticação opcional do gatilho — antes de ler o corpo
  const tokenEsperado = serverEnv().FOCUSNFE_WEBHOOK_TOKEN;
  if (tokenEsperado && !tokenConfere(request.headers.get("x-focusnfe-token"), tokenEsperado)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  // 2. Validação do payload na fronteira (regra 19)
  const corpo = gatilhoFocusSchema.safeParse(await request.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json(
      { erro: "payload inválido", detalhes: corpo.error.flatten() },
      { status: 400 },
    );
  }
  const ref = corpo.data.ref;

  // 3. Fonte da verdade: a API da Focus, consultada com o NOSSO token.
  let autorizada;
  try {
    autorizada = await new FocusNfeProvider(focusNfeEnv()).consultarPorReferencia(ref);
  } catch (e) {
    // Rejeição da prefeitura (erro permanente) é desfecho legítimo: nada a
    // gravar aqui — o motor registra em notas_fiscais_tentativas na próxima
    // tentativa, com o payload bruto. Ack para a Focus não reenviar.
    if (isFiscalError(e)) {
      return NextResponse.json({ ok: true, ref, semAutorizacao: e.kind, motivo: e.message });
    }
    // Falha nossa/de rede: 5xx faz a Focus reenviar o gatilho depois.
    return NextResponse.json(
      { erro: "falha ao consultar a Focus NFe", detalhe: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // Ainda processando: ack e espera o próximo gatilho.
  if (!autorizada) {
    return NextResponse.json({ ok: true, ref, aindaProcessando: true });
  }

  const db = createAdminClient();

  const { data: nota, error: erroBusca } = await db
    .from("notas_fiscais")
    .select("id, empresa_id, numero_nfse")
    .eq("referencia_externa", ref)
    .maybeSingle();

  if (erroBusca) {
    return NextResponse.json({ erro: "falha ao localizar a nota" }, { status: 500 });
  }
  // Nota de outro sistema/ambiente usando a mesma conta Focus: ack sem ação.
  if (!nota) {
    return NextResponse.json({ ok: true, ref, notaDesconhecida: true });
  }

  // Idempotente: se o motor já gravou o número, não sobrescreve nada.
  if (nota.numero_nfse) {
    return NextResponse.json({ ok: true, ref, notaId: nota.id, jaRegistrada: true });
  }

  const { error: erroUpdate } = await db
    .from("notas_fiscais")
    .update({
      numero_nfse: autorizada.numeroNfse,
      codigo_verificacao: autorizada.codigoVerificacao,
      provider_id: autorizada.providerId,
      url_pdf: autorizada.urlPdf,
      url_xml: autorizada.urlXml,
    })
    .eq("id", nota.id)
    .eq("empresa_id", nota.empresa_id) // tenant sempre derivado da linha (regra 3)
    .is("numero_nfse", null); // não corre com o motor: só preenche o que está vazio

  if (erroUpdate) {
    return NextResponse.json({ erro: "falha ao gravar a autorização" }, { status: 500 });
  }

  // O status continua sendo transicionado pelo motor Inngest (ver cabeçalho).
  return NextResponse.json({ ok: true, ref, notaId: nota.id, registrada: true });
}
