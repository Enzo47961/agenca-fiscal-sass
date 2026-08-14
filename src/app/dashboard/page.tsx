import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  CheckCircle2,
  Clock,
  FileCode2,
  FileDown,
  FilePlus2,
  MessageCircle,
  Receipt,
  RefreshCw,
  Settings,
  Upload,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { statusDasNotas, resumoBilling } from "@/services/dashboard";
import { formatarCentavos, type NotaStatus } from "@/types/domain";
import { publicEnv } from "@/lib/env";
import { dataCivilBr } from "@/lib/data-br";
import { listarMinhasEmpresas } from "./empresas/actions";
import { ExportarXmls } from "./exportar-xmls";
import { BotaoCancelar } from "./notas/cancelar";
import { EmpresaAtiva, SeletorEmpresa } from "./empresas/seletor";

export const dynamic = "force-dynamic"; // status de notas muda a cada retry

const STATUS_UI: Record<
  NotaStatus,
  { rotulo: string; classes: string; Icone: typeof CheckCircle2 }
> = {
  emitida: { rotulo: "Emitida", classes: "bg-green-50 text-green-700", Icone: CheckCircle2 },
  reprocessando: { rotulo: "Reprocessando", classes: "bg-amber-50 text-amber-700", Icone: RefreshCw },
  pendente: { rotulo: "Pendente", classes: "bg-slate-100 text-slate-600", Icone: Clock },
  falhou: { rotulo: "Falhou", classes: "bg-red-50 text-red-700", Icone: XCircle },
  // Cancelamento em curso usa o mesmo amarelo de "reprocessando": os dois
  // significam a mesma coisa para quem olha — o motor esta trabalhando.
  cancelando: { rotulo: "Cancelando", classes: "bg-amber-50 text-amber-700", Icone: RefreshCw },
  // Cinza, nao vermelho: cancelada nao e erro, e um desfecho pretendido.
  cancelada: { rotulo: "Cancelada", classes: "bg-slate-200 text-slate-700", Icone: Ban },
};

export default async function DashboardPage() {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") redirect("/login");
  if (estado.tipo === "sem_empresa") redirect("/onboarding"); // 1º acesso: completar cadastro

  const [notas, billing, carteira] = await Promise.all([
    statusDasNotas(db, { empresaId: estado.empresaId }),
    resumoBilling(db, { empresaId: estado.empresaId }),
    listarMinhasEmpresas(),
  ]);
  const empresaAtiva = carteira.find((e) => e.empresaId === estado.empresaId) ?? null;

  const whatsapp = publicEnv().NEXT_PUBLIC_WHATSAPP_SUPORTE;
  const linkWhatsApp = `https://wa.me/${whatsapp}?text=${encodeURIComponent(
    "Olá! Preciso de ajuda com a emissão de notas fiscais.",
  )}`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Cabeçalho */}
      <header className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Painel de Faturamento</h1>
          {/*
            A empresa ativa fica ao lado do título, não escondida num menu:
            emitir nota no CNPJ errado é engano que ninguém desfaz, e a âncora
            precisa estar onde o olho já está.
          */}
          {empresaAtiva ? <EmpresaAtiva empresa={empresaAtiva} /> : null}
          <p className="text-sm text-slate-500">
            Emissão de NFS-e com reprocessamento automático
          </p>
        </div>
        {estado.totalEmpresas > 1 ? (
          <SeletorEmpresa empresas={carteira} empresaAtivaId={estado.empresaId} />
        ) : null}
        <nav aria-label="Ações do painel" className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <Link
            href="/dashboard/clientes"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <Users className="h-4 w-4" aria-hidden />
            Clientes
          </Link>
          <Link
            href="/dashboard/cobrancas/nova"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <Receipt className="h-4 w-4" aria-hidden />
            Nova cobrança
          </Link>
          <Link
            href="/dashboard/notas/nova"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <FilePlus2 className="h-4 w-4" aria-hidden />
            Emitir nota
          </Link>
          <Link
            href="/dashboard/relatorios"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <BarChart3 className="h-4 w-4" aria-hidden />
            Relatórios
          </Link>
          <Link
            href="/dashboard/empresas/importar"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" aria-hidden />
            Importar
          </Link>
          <Link
            href="/dashboard/equipe"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <Users className="h-4 w-4" aria-hidden />
            Acesso
          </Link>
          <Link
            href="/dashboard/configuracoes"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" aria-hidden />
            Configurações
          </Link>
          <a
            href={linkWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Suporte via WhatsApp
          </a>
        </nav>
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

      {/*
        Exportação do lote do mês. Fica ACIMA da lista de notas de propósito: a
        lista serve para conferir uma nota; a exportação serve para fechar o mês,
        que é o trabalho recorrente de quem opera a carteira.
      */}
      <section aria-label="Exportar XMLs" className="mt-8">
        <ExportarXmls competenciaPadrao={dataCivilBr().slice(0, 7)} />
      </section>

      {/* Notas recentes */}
      <section aria-label="Notas recentes" className="mt-8 rounded-xl border border-slate-200 bg-white">
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
                      {/*
                        PDF e XML. O XML já vinha do provider, era gravado e
                        chegava até aqui em `nota.urlXml` — e simplesmente não
                        era renderizado. Para o escritório de contabilidade ele
                        é o documento que importa: é o XML que entra na
                        escrituração; o PDF é a via de leitura do cliente.
                      */}
                      {/*
                        A condicao e SO o status. Antes exigia tambem `urlPdf ||
                        urlXml`, e com isso o botao de cancelar — que mora aqui
                        dentro — sumia para toda nota emitida sem anexo. E o caso
                        do provider em simulacao, que devolve as duas URLs nulas:
                        a nota aparecia como emitida e nao havia como cancela-la
                        pela tela. Os links seguem condicionais um a um.
                      */}
                      {nota.status === "emitida" ? (
                        <span className="inline-flex items-center gap-3">
                          {nota.urlPdf && (
                            <a
                              href={nota.urlPdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                            >
                              <FileDown className="h-3.5 w-3.5" aria-hidden />
                              PDF
                            </a>
                          )}
                          {nota.urlXml && (
                            <a
                              href={nota.urlXml}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                            >
                              <FileCode2 className="h-3.5 w-3.5" aria-hidden />
                              XML
                            </a>
                          )}
                          {/*
                            Cancelar fica ao lado dos downloads porque e ali que
                            o usuario chega quando percebe o erro — conferindo o
                            PDF da nota que acabou de sair.
                          */}
                          {nota.numeroNfse && (
                            <BotaoCancelar notaId={nota.id} numeroNfse={nota.numeroNfse} />
                          )}
                        </span>
                      ) : nota.status === "cancelada" ? (
                        "Cancelada"
                      ) : nota.status === "reprocessando" && nota.proximaTentativaEm ? (
                        `Tentativa ${nota.tentativas} — próxima: ${new Date(nota.proximaTentativaEm).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`
                      ) : nota.status === "falhou" ? (
                        (nota.ultimoErro ?? "Erro na emissão")
                      ) : (
                        "—"
                      )}
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
