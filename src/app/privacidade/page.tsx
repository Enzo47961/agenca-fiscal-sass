import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Política de Privacidade — Agência Fiscal",
};

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar
      </Link>

      <h1 className="text-2xl font-semibold">Política de Privacidade</h1>
      <p className="mt-1 text-sm text-slate-500">Última atualização: julho de 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
        <section>
          <h2 className="mb-2 font-semibold text-slate-900">1. Quais dados coletamos</h2>
          <p>
            Para o funcionamento do serviço, coletamos: dados de conta (nome e e-mail), dados
            fiscais da sua empresa (CNPJ, razão social, inscrição municipal, regime tributário),
            dados dos seus clientes necessários para emitir notas (nome, CPF/CNPJ, endereço) e o
            certificado digital A1 com sua senha.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">2. Como usamos</h2>
          <p>
            Usamos esses dados exclusivamente para emitir suas notas fiscais junto às prefeituras e
            ao Emissor Nacional, exibir seu painel de faturamento e prestar suporte.{" "}
            <strong>Não vendemos nem compartilhamos seus dados</strong> com terceiros para fins de
            marketing.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">3. Certificado digital A1</h2>
          <p>
            Seu certificado e a senha são criptografados (AES-256-GCM) antes de serem armazenados e
            nunca ficam acessíveis em texto claro. Eles são usados apenas no momento da assinatura
            das notas fiscais.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">4. Cookies</h2>
          <p>
            Usamos apenas cookies essenciais de autenticação (para manter você logado). Não usamos
            cookies de publicidade nem rastreadores de terceiros.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">5. Seus direitos (LGPD)</h2>
          <p>
            Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar a
            qualquer momento: acesso aos seus dados, correção, exportação ou exclusão definitiva
            (incluindo o certificado digital). Basta pedir pelo canal de suporte no WhatsApp
            disponível no site.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">6. Armazenamento</h2>
          <p>
            Os dados são armazenados em infraestrutura de nuvem (Supabase) com isolamento por
            empresa e controle de acesso em nível de banco de dados. Registros de tentativas de
            emissão são mantidos para auditoria fiscal.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-slate-900">7. Contato</h2>
          <p>
            Para qualquer solicitação sobre seus dados, fale com a gente pelo canal de suporte no
            WhatsApp disponível no site.
          </p>
        </section>
      </div>
    </main>
  );
}
