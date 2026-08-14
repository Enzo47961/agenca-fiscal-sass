import { type NextRequest, NextResponse } from "next/server";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { criarZip } from "@/lib/zip";
import {
  TETO_EXPORTACAO,
  baixarXmls,
  competenciaExportacaoSchema,
  escopoExportacaoSchema,
  intervaloDaCompetencia,
  nomeDoPacote,
  resumirExportacao,
  type NotaExportavel,
} from "@/services/exportacao";

/**
 * EXPORTAÇÃO DOS XMLs DA COMPETÊNCIA, EM ZIP
 *
 * `GET /api/notas/exportar?competencia=2026-08&escopo=empresa|carteira`
 *
 * Rota, e não Server Action, porque a resposta é um ARQUIVO binário com
 * `Content-Disposition` — Server Action devolve dado para o React, não um
 * download.
 *
 * ISOLAMENTO: usa o client de SESSÃO, nunca o admin. A policy `sel_notas` já
 * restringe a `empresa_id IN (empresas_do_usuario())`, então o escopo
 * "carteira" é simplesmente NÃO filtrar por empresa — quem decide o alcance é o
 * banco, a partir dos vínculos reais, e não um parâmetro da URL. Se um dia
 * alguém passar `escopo=carteira` esperando ver o mundo, verá só a própria
 * carteira, porque o banco não conhece outro conjunto.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo !== "com_empresa") {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const competencia = competenciaExportacaoSchema.safeParse(params.get("competencia"));
  if (!competencia.success) {
    return NextResponse.json(
      { erro: competencia.error.errors[0]?.message ?? "Competência inválida." },
      { status: 400 },
    );
  }
  const escopo = escopoExportacaoSchema.parse(params.get("escopo") ?? undefined);
  const { inicio, fimExclusivo } = intervaloDaCompetencia(competencia.data);

  let consulta = db
    .from("notas_fiscais")
    .select("numero_nfse, url_xml, empresas!inner(cnpj)")
    .eq("status", "emitida")
    .gte("emitida_em", inicio)
    .lt("emitida_em", fimExclusivo)
    .order("emitida_em")
    // Pede UM a mais que o teto: é assim que se distingue "exatamente no
    // limite" de "passou do limite" sem uma segunda consulta de contagem.
    .limit(TETO_EXPORTACAO + 1);

  if (escopo === "empresa") {
    consulta = consulta.eq("empresa_id", estado.empresaId);
  }

  const { data, error } = await consulta;
  if (error) {
    return NextResponse.json({ erro: `Falha ao listar notas: ${error.message}` }, { status: 500 });
  }

  const notas: NotaExportavel[] = (data ?? []).map((n) => ({
    numeroNfse: n.numero_nfse,
    urlXml: n.url_xml,
    cnpjEmpresa: (n.empresas as unknown as { cnpj: string }).cnpj,
  }));

  if (notas.length > TETO_EXPORTACAO) {
    return NextResponse.json(
      {
        erro:
          `A competência tem mais de ${TETO_EXPORTACAO} notas. Exporte por empresa ` +
          `(escopo=empresa) em vez da carteira inteira, ou peça o período menor.`,
      },
      { status: 413 },
    );
  }

  const resumo = resumirExportacao(notas);
  if (resumo.comXml === 0) {
    return NextResponse.json(
      {
        erro:
          resumo.total === 0
            ? "Nenhuma nota emitida nesta competência."
            : `As ${resumo.total} notas desta competência não têm XML — emissor em modo simulação não gera arquivo.`,
      },
      { status: 404 },
    );
  }

  const { arquivos, falhas } = await baixarXmls(notas, async (url) => {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return new Uint8Array(await resp.arrayBuffer());
  });

  if (arquivos.length === 0) {
    return NextResponse.json(
      { erro: "Nenhum XML pôde ser baixado do provedor fiscal. Tente novamente em alguns minutos." },
      { status: 502 },
    );
  }

  const zip = criarZip(arquivos);

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomeDoPacote(competencia.data, escopo)}"`,
      "Content-Length": String(zip.length),
      // Quem baixou precisa saber que o pacote veio incompleto. Sem isto, um
      // ZIP com 498 de 500 notas entraria na contabilidade parecendo completo.
      "X-Notas-Exportadas": String(arquivos.length),
      "X-Notas-Sem-Xml": String(resumo.semXml),
      "X-Notas-Falha-Download": String(falhas),
      "Cache-Control": "no-store",
    },
  });
}
