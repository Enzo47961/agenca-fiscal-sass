import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { providersDisponiveis } from "@/lib/fiscal/providers";

/**
 * FAIXA DE SIMULAÇÃO (item B1 da auditoria de 12/08/2026)
 *
 * O DEFEITO. `criar_minha_empresa()` grava `provider_fiscal = 'mock'` — valor
 * fixo na função, não default de coluna. O provider mock devolve
 * `Math.floor(Math.random() * 1_000_000)` como número da nota. Ou seja: toda
 * empresa nasce emitindo documento sem validade jurídica, com número que PARECE
 * um número de nota.
 *
 * O aviso existia e era bem escrito, mas vivia num lugar só: a tela de
 * configurações. Varredura por `ehSimulacao` confirmava — nenhuma outra tela o
 * consumia. Quem se cadastrava, não abria configurações e emitia, via
 * "Emitida — nº 483920" no painel e concluía, razoavelmente, que tinha cumprido
 * obrigação fiscal.
 *
 * POR QUE NO LAYOUT. Porque o aviso não pode depender de o usuário visitar a
 * tela certa — foi exatamente assim que ele falhou. No layout ele aparece em
 * TODA tela do painel: emissão, listagem, dashboard, cobranças. Repetir o bloco
 * em cada página deixaria a próxima página nova sem ele, e o modo de falha
 * voltaria pela porta dos fundos.
 *
 * ESCOPO DELIBERADO. A faixa cobre o que o sistema mostra. Ela NÃO alcança o
 * e-mail enviado ao cliente final, que continua sem qualquer marca de
 * simulação — está registrado no relatório como pendência, e não foi resolvido
 * aqui porque mexer no template é mudança de conteúdo que vai para terceiros.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);

  // Sem empresa ativa não há provider para avaliar — e as próprias páginas já
  // cuidam do redirect. O layout não decide navegação: se ele redirecionasse,
  // duplicaria a regra que cada página já aplica, com risco de divergirem.
  let simulacao: { rotulo: string; descricao: string } | null = null;

  if (estado.tipo === "com_empresa") {
    const { data: empresa } = await db
      .from("empresas")
      .select("provider_fiscal")
      .eq("id", estado.empresaId)
      .maybeSingle();

    const nome = empresa?.provider_fiscal ?? "mock";
    const info = providersDisponiveis().find((p) => p.nome === nome);

    // Provider desconhecido cai em simulação de propósito: se o nome gravado
    // não está no registry, não há como afirmar que ele emite documento válido,
    // e o silêncio é o desfecho perigoso.
    if (!info || info.ehSimulacao) {
      simulacao = {
        rotulo: info?.rotulo ?? nome,
        descricao: info?.descricao ?? "Emissor não reconhecido pelo sistema.",
      };
    }
  }

  return (
    <>
      {simulacao && (
        <div
          role="alert"
          className="sticky top-0 z-50 border-b border-amber-300 bg-amber-100 px-4 py-2.5 text-amber-950"
        >
          <div className="mx-auto flex max-w-6xl items-start gap-2.5 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <strong>Modo simulação ({simulacao.rotulo}).</strong> As notas emitidas aqui
              recebem número fictício e <strong>não têm validade jurídica</strong> — nenhuma
              obrigação fiscal é cumprida.{" "}
              <Link href="/dashboard/configuracoes" className="font-semibold underline">
                Configurar o emissor real
              </Link>
              .
            </p>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
