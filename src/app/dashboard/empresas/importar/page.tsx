import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { CABECALHO_MODELO, MAX_LINHAS_IMPORTACAO } from "@/services/importacao";
import { FormularioImportacao } from "./formulario";
import { PrepararCarteira } from "./preparar";
import { resumirCarteira, validarContraMunicipio } from "@/services/validacao-municipal";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);
  if (estado.tipo === "deslogado") redirect("/login");

  // Prontidão da carteira. O alcance vem da RLS: só as empresas de quem olha.
  const { data: carteira } = await db
    .from("empresas")
    .select(
      "cnpj, provider_status, inscricao_municipal, cnae, codigo_municipio_ibge, certificado_valido_ate",
    );
  const contagem = {
    total: carteira?.length ?? 0,
    cadastradas: carteira?.filter((e) => e.provider_status === "cadastrada").length ?? 0,
    emAndamento: carteira?.filter((e) => e.provider_status === "cadastrando").length ?? 0,
    falharam: carteira?.filter((e) => e.provider_status === "falhou").length ?? 0,
  };
  const pendentes = contagem.total - contagem.cadastradas;

  // A Focus confirmou (27/08/2026) que a inscrição municipal é obrigatória no
  // cadastro. Não barramos por isso — existe a exceção da NFS-e Nacional, em que
  // a prefeitura não registrou a IM no ambiente nacional e o campo deve ser
  // suprimido —, mas avisar antes evita gastar requisição para descobrir o
  // óbvio, e evita que o usuário leia "recusado" sem entender por quê.
  const semInscricao =
    carteira?.filter((e) => e.provider_status !== "cadastrada" && !e.inscricao_municipal).length ?? 0;

  // VALIDAÇÃO LOCAL, custo zero. O mapa de municípios responde de graça o que,
  // sem ele, custaria uma tentativa de emissão por empresa — quais municípios
  // sequer emitem NFS-e, quais estão fora do ar, quais não têm homologação.
  const ibges = Array.from(new Set((carteira ?? []).map((e) => e.codigo_municipio_ibge)));
  const { data: municipios } = ibges.length
    ? await db.from("municipios_nfse").select("*").in("codigo_ibge", ibges)
    : { data: [] };
  const porIbge = new Map((municipios ?? []).map((m) => [m.codigo_ibge, m]));

  const validacao = resumirCarteira(
    (carteira ?? []).map((e) =>
      validarContraMunicipio(
        {
          cnpj: e.cnpj,
          inscricaoMunicipal: e.inscricao_municipal,
          cnae: e.cnae,
          codigoMunicipioIbge: e.codigo_municipio_ibge,
          certificadoValidoAte: e.certificado_valido_ate,
        },
        porIbge.get(e.codigo_municipio_ibge) ?? null,
      ),
    ),
  );
  const mapaVazio = (municipios ?? []).length === 0 && ibges.length > 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar ao painel
      </Link>

      <h1 className="mt-4 flex items-center gap-2 text-2xl font-semibold">
        <Upload className="h-6 w-6 text-brand-600" aria-hidden />
        Importar empresas
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Cadastre a carteira inteira de uma vez, a partir de uma planilha. Até{" "}
        {MAX_LINHAS_IMPORTACAO} empresas por arquivo.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-700">Como montar a planilha</h2>
        <p className="mt-2 text-xs text-slate-600">
          Salve como CSV. Aceitamos vírgula ou ponto e vírgula (o padrão do Excel em português),
          e o cabeçalho pode vir com acento ou maiúscula — <code>Razão Social</code> e{" "}
          <code>razao_social</code> são a mesma coluna.
        </p>

        <div className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3">
          <code className="whitespace-pre text-[11px] text-slate-700">
            {CABECALHO_MODELO}
            {"\n"}
            Padaria do João LTDA,11222333000181,3550308,contato@padaria.com.br,simples_nacional,Padaria
            do João,12345
          </code>
        </div>

        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          <li>
            <strong>Obrigatórias:</strong> razão social, CNPJ, código IBGE do município (7
            dígitos), e-mail de contato e regime tributário.
          </li>
          <li>
            <strong>Opcionais:</strong> nome fantasia e inscrição municipal.
          </li>
          <li>
            <strong>Regime:</strong> aceita <code>simples_nacional</code>, <code>simples</code>,{" "}
            <code>lucro_presumido</code>, <code>presumido</code>, <code>lucro_real</code>,{" "}
            <code>real</code> e <code>mei</code>.
          </li>
        </ul>
      </section>

      <section className="mt-6">
        <FormularioImportacao />
      </section>

      {contagem.total > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-slate-700">Prontidão da carteira</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Contador rotulo="Empresas" valor={contagem.total} />
            <Contador rotulo="No provedor" valor={contagem.cadastradas} tom="ok" />
            <Contador rotulo="Em andamento" valor={contagem.emAndamento} tom="neutro" />
            <Contador rotulo="Falharam" valor={contagem.falharam} tom={contagem.falharam > 0 ? "erro" : "neutro"} />
          </div>

          {semInscricao > 0 && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <strong>
                {semInscricao} empresa{semInscricao === 1 ? "" : "s"} sem inscrição municipal.
              </strong>{" "}
              O provedor exige esse campo no cadastro, então{" "}
              {semInscricao === 1 ? "ela provavelmente será recusada" : "elas provavelmente serão recusadas"}.
              Vale preencher antes — a exceção é a NFS-e Nacional em municípios onde a própria
              prefeitura não registrou a inscrição. Você pode preparar a carteira assim mesmo: o
              motivo da recusa aparece aqui, empresa por empresa.
            </p>
          )}

          <section className="mt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Validação contra as regras de cada município
            </h3>
            {mapaVazio ? (
              <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                O mapa de municípios ainda não foi sincronizado. Sem ele, a verificação prévia não
                roda e cada empresa só descobre o que falta ao tentar emitir.
              </p>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Contador rotulo="Prontas para teste" valor={validacao.prontoParaTeste} tom="ok" />
                  <Contador rotulo="Falta dado" valor={validacao.incompleto} tom={validacao.incompleto > 0 ? "erro" : "neutro"} />
                  <Contador rotulo="Sem homologação" valor={validacao.semAmbienteDeTeste} />
                  <Contador rotulo="Município fora do ar" valor={validacao.indisponivel} />
                  <Contador rotulo="Sem NFS-e no município" valor={validacao.impossivel} tom={validacao.impossivel > 0 ? "erro" : "neutro"} />
                </div>
                {/*
                  O número que justifica a camada inteira: quantas tentativas de
                  emissão a rodada vai realmente gastar, mostrado ANTES de gastar.
                */}
                <p className="mt-2 text-xs text-slate-500">
                  Uma rodada de testes consumiria{" "}
                  <strong className="text-slate-700">{validacao.creditosPrevistos}</strong> de{" "}
                  {contagem.total} tentativas — as demais já foram resolvidas sem gastar
                  requisição ao provedor.
                </p>
              </>
            )}
          </section>

          <div className="mt-4">
            <PrepararCarteira pendentes={pendentes} />
          </div>
        </section>
      )}

      {/*
        Dito aqui e não descoberto depois: a importação e o cadastro no provedor
        resolvem o gargalo dos 600 CNPJs. NÃO resolvem a habilitação fiscal, que
        depende de um certificado A1 por empresa e do cliente final entregá-lo.
      */}
      <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <strong>O certificado continua sendo por empresa.</strong> Cadastrar a carteira no
        provedor não habilita a emissão sozinho: cada CNPJ precisa do certificado digital A1 do
        titular, enviado em Configurações. É a etapa que depende do cliente final, não de nós.
      </p>
    </main>
  );
}

function Contador({
  rotulo,
  valor,
  tom = "neutro",
}: {
  rotulo: string;
  valor: number;
  tom?: "neutro" | "ok" | "erro";
}) {
  const cores =
    tom === "ok" && valor > 0
      ? "border-green-200 bg-green-50 text-green-900"
      : tom === "erro"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-xl border p-3 ${cores}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-70">{rotulo}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}
