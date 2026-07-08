import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageCircle,
  RefreshCw,
  Settings,
  Wallet,
  XCircle,
} from "lucide-react";
import { createSessionClient, empresaDaSessao } from "@/lib/supabase/server";
import { statusDasNotas, resumoBilling } from "@/services/dashboard";
import { formatarCentavos, type NotaStatus } from "@/types/domain";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic"; // status de notas muda a cada retry

const STATUS_UI: Record<
  NotaStatus,
  { rotulo: string; classes: string; Icone: typeof CheckCircle2 }
> = {
  emitida: { rotulo: "Emitida", classes: "bg-green-50 text-green-700", Icone: CheckCircle2 },
  reprocessando: { rotulo: "Reprocessando", classes: "bg-amber-50 text-amber-700", Icone: RefreshCw },
  pendente: { rotulo: "Pendente", classes: "bg-slate-100 text-slate-600", Icone: Clock },
  falhou: { rotulo: "Falhou", classes: "bg-red-50 text-red-700", Icone: XCircle },
};

export default async function DashboardPage() {
  const db = createSessionClient();
  const sessao = await empresaDaSessao(db);
  if (!sessao) redirect("/login");

  const [notas, billing] = await Promise.all([
    statusDasNotas(db, { empresaId: sessao.empresaId }),
    resumoBilling(db, { empresaId: sessao.empresaId }),
  ]);

  const whatsapp = publicEnv().NEXT_PUBLIC_WHATSAPP_SUPORTE;
  const linkWhatsApp = `https://wa.me/${whatsapp}?text=${encodeURIComponent(
    "Olá! Preciso de ajuda com a emissão de notas fiscais.",
  )}`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Cabeçalho */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Painel de Faturamento</h1>
          <p className="text-sm text-slate-500">
            Emissão de NFS-e com reprocessamento automático
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/configuracoes"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" aria-hidden />
            Configurações
          </Link>
          <a
            href={linkWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Suporte Humano via WhatsApp
          </a>
        </div>
      </header>

      {/* Alerta de inadimplência */}
      {billing.inadimplente && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <span>
            Sua assinatura está <strong>inadimplente</strong>. Regularize o pagamento para não
            interromper a emissão de notas.
          </span>
        </div>
      )}

      {/* Métricas */}
      <section aria-label="Métricas" className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-500">
            <Wallet className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">Faturamento no mês</span>
          </div>
          <p className="mt-2 text-2xl font-semibold">
            {formatarCentavos(notas.faturamentoMesCentavos)}
          </p>
        </div>

        {(Object.keys(STATUS_UI) as NotaStatus[]).map((status) => {
          const { rotulo, classes, Icone } = STATUS_UI[status];
          return (
            <div key={status} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>
                <Icone className="h-3.5 w-3.5" aria-hidden />
                {rotulo}
              </div>
              <p className="mt-2 text-2xl font-semibold">{notas.contagemPorStatus[status]}</p>
            </div>
          );
        })}
      </section>

      {/* Notas recentes */}
      <section aria-label="Notas recentes" className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-medium">Notas recentes</h2>
        </div>
        {notas.notasRecentes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Nenhuma nota ainda. A primeira será criada automaticamente quando um pagamento for
            confirmado.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Descrição</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">NFS-e</th>
                <th className="px-5 py-3 font-medium">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {notas.notasRecentes.map((nota) => {
                const ui = STATUS_UI[nota.status];
                return (
                  <tr key={nota.id} className="border-b border-slate-50">
                    <td className="max-w-xs truncate px-5 py-3">{nota.descricao}</td>
                    <td className="px-5 py-3 tabular-nums">
                      {formatarCentavos(nota.valorCentavos)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ui.classes}`}>
                        <ui.Icone className="h-3.5 w-3.5" aria-hidden />
                        {ui.rotulo}
                      </span>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{nota.numeroNfse ?? "—"}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {nota.status === "reprocessando" && nota.proximaTentativaEm
                        ? `Tentativa ${nota.tentativas} — próxima: ${new Date(nota.proximaTentativaEm).toLocaleTimeString("pt-BR")}`
                        : nota.status === "falhou"
                          ? (nota.ultimoErro ?? "Erro na emissão")
                          : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
