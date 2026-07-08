import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock,
  FileCheck2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { publicEnv } from "@/lib/env";

export const metadata = {
  title: "Agência Fiscal — Emissor de NFS-e com Motor de Retry para a Reforma Tributária",
  description:
    "Emissor de NFS-e com reprocessamento automático adaptado ao IBS/CBS. Se a prefeitura cair, a gente tenta de novo até emitir.",
};

const RETRIES = [
  { tempo: "Imediato", rotulo: "1ª tentativa" },
  { tempo: "+5 min", rotulo: "2ª tentativa" },
  { tempo: "+15 min", rotulo: "3ª tentativa" },
  { tempo: "+1 hora", rotulo: "4ª tentativa" },
];

const COMPARATIVO = [
  {
    situacao: "API da prefeitura fora do ar",
    gigantes: "Erro genérico. Nota fica travada na fila.",
    nos: "Detecta a queda e reagenda sozinho: 5 min → 15 min → 1 h.",
  },
  {
    situacao: "Governo muda o layout (IBS/CBS)",
    gigantes: "Semanas de espera por atualização do sistema.",
    nos: "Campos novos da Reforma preenchidos automaticamente.",
  },
  {
    situacao: "Erro no meio da madrugada",
    gigantes: "Você descobre no dia seguinte, com o cliente cobrando.",
    nos: "O motor reprocessa enquanto você dorme. De manhã, nota emitida.",
  },
  {
    situacao: "Precisa de ajuda urgente",
    gigantes: "Chatbot em loop e ticket respondido em 3 dias.",
    nos: "Humano de verdade no WhatsApp em até 60 minutos.",
  },
];

export default function LandingPage() {
  const whatsapp = publicEnv().NEXT_PUBLIC_WHATSAPP_SUPORTE;
  const linkWhatsApp = `https://wa.me/${whatsapp}?text=${encodeURIComponent(
    "Olá! Quero saber mais sobre o emissor de NFS-e de vocês.",
  )}`;

  return (
    <div className="bg-slate-950 text-slate-100">
      {/* ===================== NAV ===================== */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <FileCheck2 className="h-6 w-6 text-brand-500" aria-hidden />
          Agência Fiscal
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <a href="#precos" className="hidden text-slate-300 hover:text-white sm:block">
            Preços
          </a>
          <Link
            href="/login"
            className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-200 hover:border-slate-500 hover:text-white"
          >
            Entrar
          </Link>
        </nav>
      </header>

      {/* ===================== HERO ===================== */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-14 text-center">
        <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Segundo semestre de 2026: prefeituras instáveis + novos campos IBS/CBS obrigatórios
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Sua emissão de NFS-e vai <span className="text-red-400">parar</span> com o IBS/CBS?
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
          Conheça o emissor com <strong className="text-white">Motor de Retry Automático</strong>{" "}
          adaptado para a Reforma Tributária. Se a prefeitura cair, a gente tenta de novo — até
          emitir.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600"
          >
            Começar Teste Gratuito de 14 dias
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <span className="text-xs text-slate-400">Sem cartão de crédito · Cancele com um clique</span>
        </div>

        {/* Linha do tempo do retry */}
        <div className="mx-auto mt-14 max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="mb-4 flex items-center justify-center gap-2 text-sm font-medium text-slate-300">
            <RefreshCw className="h-4 w-4 text-brand-500" aria-hidden />
            Prefeitura caiu? O motor assume:
          </p>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RETRIES.map((r, i) => (
              <li key={r.rotulo} className="rounded-xl bg-slate-800/70 p-4">
                <p className="text-lg font-semibold text-brand-500">{r.tempo}</p>
                <p className="mt-1 text-xs text-slate-400">{r.rotulo}</p>
                {i === RETRIES.length - 1 && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle2 className="h-3 w-3" aria-hidden /> emitida
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===================== A DOR DO MERCADO ===================== */}
      <section className="border-t border-slate-800 bg-slate-900/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold">
              Quando o governo oscila, os gigantes <span className="text-red-400">travam</span>
            </h2>
            <p className="mt-3 text-slate-300">
              Nosso sistema funciona como um{" "}
              <strong className="text-white">motoboy obstinado</strong>: bateu na porta e ninguém
              atendeu? Ele volta. E volta de novo. Até entregar sua nota na prefeitura.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-4 font-medium">Cenário real</th>
                  <th className="px-5 py-4 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <XCircle className="h-4 w-4 text-red-400" aria-hidden />
                      Emissores gigantes
                    </span>
                  </th>
                  <th className="px-5 py-4 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Bike className="h-4 w-4 text-green-400" aria-hidden />
                      Agência Fiscal
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARATIVO.map((linha) => (
                  <tr key={linha.situacao} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-5 py-4 font-medium text-slate-200">{linha.situacao}</td>
                    <td className="px-5 py-4 text-slate-400">{linha.gigantes}</td>
                    <td className="px-5 py-4 text-slate-200">{linha.nos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===================== OS 3 PILARES ===================== */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold">Três pilares. Zero nota perdida.</h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7">
              <div className="mb-4 inline-flex rounded-xl bg-brand-500/15 p-3">
                <Zap className="h-6 w-6 text-brand-500" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold">Motor de Reprocessamento Inteligente</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Backoff exponencial (5 min → 15 min → 1 h) com classificação de erro: instabilidade
                gera retry automático; erro de cadastro avisa você na hora, sem desperdiçar
                tentativas. Cada tentativa fica registrada para auditoria.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7">
              <div className="mb-4 inline-flex rounded-xl bg-brand-500/15 p-3">
                <Sparkles className="h-6 w-6 text-brand-500" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold">Onboarding Fiscal Guiado</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Validação automática de códigos de serviço (LC 116), CST e dos novos campos IBS/CBS
                do Emissor Nacional. Certificado A1 criptografado de ponta a ponta e ajuda
                contextual em cada campo — impossível errar o preenchimento.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7">
              <div className="mb-4 inline-flex rounded-xl bg-green-500/15 p-3">
                <MessageCircle className="h-6 w-6 text-green-400" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold">Suporte Humano em 60 minutos</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                WhatsApp direto com gente de verdade que entende de NFS-e. Sem robôs, sem menu de
                digitação, sem ticket esquecido. Resposta em até 60 minutos em horário comercial.
              </p>
              <a
                href={linkWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Chamar no WhatsApp
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* ===================== PREÇOS ===================== */}
      <section id="precos" className="border-t border-slate-800 bg-slate-900/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold">Um plano. Um preço. Sem letra miúda.</h2>
            <p className="mt-3 text-slate-300">
              Sem tabela confusa de planos, sem cobrança por nota emitida, sem surpresa no boleto.
            </p>
          </div>

          <div className="mx-auto max-w-md rounded-3xl border border-brand-500/40 bg-slate-900 p-8 shadow-2xl shadow-brand-500/10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Plano Completo</h3>
              <span className="rounded-full bg-brand-500/15 px-3 py-1 text-xs font-medium text-brand-500">
                14 dias grátis
              </span>
            </div>
            <p className="mt-5">
              <span className="text-5xl font-bold tracking-tight">R$ 199,99</span>
              <span className="text-slate-400">/mês</span>
            </p>

            <ul className="mt-7 space-y-3 text-sm">
              {[
                "Notas ilimitadas com Motor de Retry Automático",
                "Adaptado ao IBS/CBS e ao Emissor Nacional",
                "Emissão automática a cada Pix confirmado",
                "Suporte humano via WhatsApp em até 60 min",
                "Painel em tempo real com status de cada nota",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" aria-hidden />
                  <span className="text-slate-300">{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3">
              <p className="flex items-start gap-2 text-sm text-green-300">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <strong>Cancele com um clique.</strong> Sem contratos abusivos, sem fidelidade,
                  sem multa. Se não fizer sentido, você sai na hora.
                </span>
              </p>
            </div>

            <Link
              href="/login"
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 font-semibold text-white transition hover:bg-brand-600"
            >
              Começar Teste Gratuito de 14 dias
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <p className="mt-3 text-center text-xs text-slate-500">
              Sem cartão de crédito no teste.
            </p>
          </div>
        </div>
      </section>

      {/* ===================== CTA FINAL + FOOTER ===================== */}
      <section className="py-16 text-center">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-2xl font-bold">
            A Reforma Tributária não vai esperar você. Nós também não — pela prefeitura.
          </h2>
          <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-7 py-3.5 font-semibold text-white transition hover:bg-brand-600"
            >
              Criar minha conta grátis
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <a
              href={linkWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Prefere conversar antes? Chama no WhatsApp
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4" aria-hidden />
            Agência Fiscal © 2026
          </div>
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" aria-hidden /> Suporte em até 60 min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" aria-hidden /> Sem multa de cancelamento
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden /> Retry 24/7
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
