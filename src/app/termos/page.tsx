import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Termos de Uso do Beta — Agência Fiscal",
};

export default function TermosPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar
      </Link>

      <h1 className="text-2xl font-semibold">Termos de Uso — Versão Beta</h1>
      <p className="mt-1 text-sm text-slate-500">Última atualização: julho de 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
        <section>
          <h2 className="mb-2 font-semibold text-slate-900">1. O que é o beta</h2>
          <p>
            A Agência Fiscal está em <strong>fase beta de testes</strong>. Isso significa que o
            serviço é oferecido gratuitamente, no estado em que se encontra, e pode conter erros,
            instabilidades ou mudanças de funcionamento sem aviso prévio. O objetivo desta fase é
            validar e melhorar o produto com a ajuda dos usuários.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">2. Gratuidade e futuro do serviço</h2>
          <p>
            Durante o beta, nenhum valor é cobrado e nenhum dado de pagamento é coletado. Se e
            quando o serviço passar a ser pago, você será avisado com antecedência e{" "}
            <strong>nenhuma cobrança será feita automaticamente</strong> — a contratação será uma
            escolha sua. Podemos encerrar ou pausar o beta a qualquer momento.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">3. Suas responsabilidades</h2>
          <p>
            Você é responsável pela veracidade dos dados fiscais cadastrados (CNPJ, inscrição
            municipal, códigos de serviço) e pela guarda das suas credenciais de acesso. Por se
            tratar de versão de testes, recomendamos <strong>conferir cada nota emitida</strong> no
            portal da sua prefeitura e manter seus próprios registros.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">4. Limitação de responsabilidade</h2>
          <p>
            O serviço é fornecido sem garantias de disponibilidade ou resultado durante o beta. Nos
            comprometemos a agir com boa-fé e diligência, mas não nos responsabilizamos por
            prejuízos decorrentes de indisponibilidade de sistemas de terceiros (prefeituras,
            provedores fiscais) ou de dados incorretos informados no cadastro.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">5. Seus dados</h2>
          <p>
            O tratamento de dados pessoais está descrito na nossa{" "}
            <Link href="/privacidade" className="text-brand-600 underline underline-offset-2">
              Política de Privacidade
            </Link>
            . Você pode solicitar a exportação ou a exclusão definitiva dos seus dados a qualquer
            momento, pelo nosso canal de suporte.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">6. Contato</h2>
          <p>
            Dúvidas sobre estes termos? Fale com a gente pelo canal de suporte no WhatsApp
            disponível no site.
          </p>
        </section>
      </div>
    </main>
  );
}
