"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, HelpCircle, Loader2, SendHorizonal, XCircle } from "lucide-react";
import { consultarCorrelacaoAction, emitirNotaAction, type EmissaoResult } from "./actions";
import { type CorrelacaoItem } from "@/lib/fiscal/correlacao";
// TIPO_AJUSTE_BASE_LABEL não é mais usado aqui: com o `gReeRepRes` modelado, a
// única alternativa transmissível é `ibscbs`, mandada num campo oculto.
// `loc_imoveis` volta a aparecer quando o grupo `imovel/` existir.
import { REGIME_IBSCBS_LABEL } from "@/lib/fiscal/reforma";
import { REGIMES_NBS_SOB_DUVIDA } from "@/lib/fiscal/regimes";
import {
  MAX_DOCUMENTOS_AJUSTE,
  TIPO_AJUSTE_DOC_LABEL,
  TIPO_CHAVE_DFE_LABEL,
  documentoAjusteBaseSchema,
  resumoDocumento,
  somarAjusteBase,
  type DocumentoAjusteBase,
  type TipoAjusteDoc,
  type TipoChaveDFe,
} from "@/lib/fiscal/ajuste-base";
import { formatarCentavos } from "@/types/domain";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function Ajuda({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
      <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * Editor de UM documento de ajuste. Estado local, some ao adicionar.
 *
 * Separado do formulário principal porque tem estado próprio e efêmero: um
 * documento pela metade não pertence à nota até ser adicionado à lista, e
 * misturar os dois estados faria campos meio preenchidos vazarem para o envio.
 */
function DocumentoAjusteEditor({
  onAdicionar,
  desabilitado,
}: {
  onAdicionar: (d: DocumentoAjusteBase) => void;
  desabilitado: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoAjusteDoc>("01");
  const [descricaoTipo, setDescricaoTipo] = useState("");
  const [forma, setForma] = useState<DocumentoAjusteBase["identificacao"]["forma"]>("dfe_nacional");
  const [tipoChave, setTipoChave] = useState<TipoChaveDFe>("2");
  const [chave, setChave] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [numero, setNumero] = useState("");
  const [descricaoDoc, setDescricaoDoc] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function limpar() {
    setDescricaoTipo("");
    setChave("");
    setMunicipio("");
    setNumero("");
    setDescricaoDoc("");
    setValor("");
    setErro(null);
  }

  function adicionar() {
    const centavos = Math.round(Number(valor.replace(/\./g, "").replace(",", ".")) * 100);
    const identificacao =
      forma === "dfe_nacional"
        ? { forma, tipoChaveDFe: tipoChave, chaveDFe: chave.trim(), descricaoTipoChave: descricaoDoc.trim() || null }
        : forma === "doc_fiscal_outro"
          ? { forma, codigoMunicipio: municipio.replace(/\D/g, ""), numero: numero.trim(), descricao: descricaoDoc.trim() }
          : { forma, numero: numero.trim(), descricao: descricaoDoc.trim() };

    // Valida com o MESMO schema do servidor: o erro aparece aqui, com o
    // documento ainda na tela, em vez de derrubar o envio da nota inteira.
    const r = documentoAjusteBaseSchema.safeParse({
      tipo,
      descricaoTipo: descricaoTipo.trim() || null,
      valorCentavos: Number.isFinite(centavos) ? centavos : -1,
      identificacao,
    });
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? "Documento inválido.");
      return;
    }
    onAdicionar(r.data);
    limpar();
    setAberto(false);
  }

  if (!aberto) {
    return (
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => setAberto(true)}
        className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-brand-600 hover:border-brand-400 disabled:opacity-50"
      >
        {desabilitado ? `Limite de ${MAX_DOCUMENTOS_AJUSTE} documentos` : "+ Referenciar documento"}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
      <label className="block">
        <span className="mb-1 block text-xs text-slate-600">Motivo do repasse/reembolso *</span>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoAjusteDoc)}
          className={inputClasses}
        >
          {Object.entries(TIPO_AJUSTE_DOC_LABEL).map(([v, rotulo]) => (
            <option key={v} value={v}>
              {v} — {rotulo.slice(0, 100)}
            </option>
          ))}
        </select>
      </label>

      {tipo === "99" ? (
        <label className="block">
          <span className="mb-1 block text-xs text-slate-600">Descreva o motivo *</span>
          <input
            value={descricaoTipo}
            onChange={(e) => setDescricaoTipo(e.target.value)}
            className={inputClasses}
          />
        </label>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs text-slate-600">Como o documento é identificado *</span>
        <select
          value={forma}
          onChange={(e) =>
            setForma(e.target.value as DocumentoAjusteBase["identificacao"]["forma"])
          }
          className={inputClasses}
        >
          <option value="dfe_nacional">Documento eletrônico com chave (NFS-e, NF-e, CT-e)</option>
          <option value="doc_fiscal_outro">Documento fiscal sem chave nacional</option>
          <option value="doc_nao_fiscal">Documento não fiscal (recibo, contrato)</option>
        </select>
      </label>

      {forma === "dfe_nacional" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-600">Tipo *</span>
            <select
              value={tipoChave}
              onChange={(e) => setTipoChave(e.target.value as TipoChaveDFe)}
              className={inputClasses}
            >
              {Object.entries(TIPO_CHAVE_DFE_LABEL).map(([v, rotulo]) => (
                <option key={v} value={v}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-600">Chave de acesso *</span>
            <input value={chave} onChange={(e) => setChave(e.target.value)} className={inputClasses} />
          </label>
          {tipoChave === "9" ? (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-600">Qual documento? *</span>
              <input
                value={descricaoDoc}
                onChange={(e) => setDescricaoDoc(e.target.value)}
                className={inputClasses}
              />
            </label>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {forma === "doc_fiscal_outro" ? (
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Município (IBGE) *</span>
              <input
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
                inputMode="numeric"
                maxLength={7}
                className={inputClasses}
              />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-xs text-slate-600">Número *</span>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} className={inputClasses} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-slate-600">Descrição *</span>
            <input
              value={descricaoDoc}
              onChange={(e) => setDescricaoDoc(e.target.value)}
              className={inputClasses}
            />
          </label>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-xs text-slate-600">Valor do repasse (R$) *</span>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          className={inputClasses}
        />
      </label>

      {erro ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {erro}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={adicionar}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={() => {
            limpar();
            setAberto(false);
          }}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function FormularioEmissao({
  clientes,
  regimeTributario,
}: {
  clientes: Array<{ id: string; nome: string }>;
  regimeTributario: string | null;
}) {
  const [enviando, startTransition] = useTransition();
  const [resultado, setResultado] = useState<EmissaoResult | null>(null);
  // C7: a confirmação só faz sentido — e só é exigida — fora do regime padrão.
  const [regime, setRegime] = useState<string>("padrao");

  // Correlação oficial do item de serviço (Anexo VIII). Consultada quando o
  // usuário termina de digitar o código, não a cada tecla.
  const [correlacao, setCorrelacao] = useState<CorrelacaoItem | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [cClassTrib, setCClassTrib] = useState("");
  // Documentos do ajuste de base. O total e derivado — nunca digitado.
  const [documentos, setDocumentos] = useState<DocumentoAjusteBase[]>([]);
  const totalAjuste = somarAjusteBase(documentos);

  async function buscarCorrelacao(codigo: string) {
    const limpo = codigo.trim();
    if (!limpo) {
      setCorrelacao(null);
      setCClassTrib("");
      return;
    }
    setConsultando(true);
    const r = await consultarCorrelacaoAction(limpo);
    setConsultando(false);
    if (!r.ok) {
      setCorrelacao(null);
      return;
    }
    setCorrelacao(r.correlacao);
    // Categoria A não vira campo: o serviço preenche. Nas demais o usuário
    // escolhe, e não pré-selecionamos nada — pré-seleção é sugestão disfarçada.
    setCClassTrib("");
  }

  const opcaoEscolhida = correlacao?.opcoes.find((o) => o.codigo === cClassTrib) ?? null;
  const escolhaTemReducao =
    !!opcaoEscolhida && (opcaoEscolhida.percReducaoIbs > 0 || opcaoEscolhida.percReducaoCbs > 0);

  // Onde o par de tributação regular precisa ser digitado. Dois casos, e só
  // eles: código que a tabela oficial marca como exigente do grupo, e item sem
  // correlação, onde o usuário digita um código que não conhecemos de antemão.
  const escolhaExigeTribRegular = !!opcaoEscolhida?.exigeTribRegular;
  const precisaTribRegular =
    escolhaExigeTribRegular || correlacao?.categoria === "sem_correlacao";

  // A confirmação é uma só, venha a afirmação do regime ou do código escolhido:
  // as duas afirmam enquadramento, e a auditoria precisa de um registro único.
  const regimeDiferenciado = regime !== "padrao" || escolhaTemReducao;

  const nbsSobDuvida = REGIMES_NBS_SOB_DUVIDA.some((r) => r === regimeTributario);

  if (resultado?.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-green-900">Emissão solicitada!</h2>
        <p className="mt-1 text-sm text-green-800">
          A nota entrou na fila do motor de emissão. Se a prefeitura estiver fora do ar, ele tenta
          de novo sozinho — acompanhe o status no painel.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Ver status no painel
          </Link>
          <button
            onClick={() => setResultado(null)}
            className="text-sm text-green-700 underline underline-offset-2 hover:text-green-900"
          >
            Emitir outra nota
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => setResultado(await emitirNotaAction(formData)))
      }
      className="rounded-xl border border-slate-200 bg-white p-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-slate-600">Cliente (tomador) *</span>
          <select name="clienteId" required defaultValue="" className={inputClasses}>
            <option value="" disabled>
              Selecione…
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-slate-600">Descrição do serviço *</span>
          <textarea
            name="descricaoServico"
            required
            rows={3}
            placeholder="Ex.: Desenvolvimento de website institucional, conforme contrato."
            className={inputClasses}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Valor do serviço (R$) *</span>
          <input name="valor" required inputMode="decimal" placeholder="1500,00" className={inputClasses} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Código de serviço (LC 116) *</span>
          <input
            name="codigoServico"
            required
            placeholder="01.05"
            maxLength={8}
            className={inputClasses}
            onBlur={(e) => void buscarCorrelacao(e.target.value)}
          />
          <Ajuda>
            Formato XX.XX — confira no verificador em Configurações. É por ele que buscamos a
            classificação de IBS/CBS na tabela oficial.
          </Ajuda>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Alíquota de ISS (%) *</span>
          <input
            name="aliquotaIss"
            required
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="5"
            className={inputClasses}
          />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="issRetido" className="h-4 w-4 rounded border-slate-300" />
          <span className="text-sm text-slate-600">ISS retido pelo tomador</span>
        </label>

        <div className="sm:col-span-2 mt-2 border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            Reforma tributária (CBS/IBS)
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Código NBS</span>
          <input name="codigoNbs" placeholder="Opcional por enquanto" className={inputClasses} />
          {/*
            O texto anterior afirmava que o NBS "substitui o código municipal na
            reforma". Não é o que a pesquisa sustenta: o papel do NBS ainda é
            pendência aberta (P3 em PENDENCIAS_C5 — o Anexo VIII, de correlação,
            não pôde ser lido). Prometer substituição levaria o usuário a parar
            de preencher o código de serviço, que continua obrigatório.
          */}
          <Ajuda>
            Nomenclatura Brasileira de Serviços. Opcional hoje e <strong>não substitui</strong> o
            código de serviço da LC 116 — preencha os dois quando tiver o NBS.
          </Ajuda>
          {/*
            A7. O NBS segue OPCIONAL para todos os regimes — as fontes divergem
            sobre a exigência no lucro presumido/real, e bloquear o envio com
            base em fonte não confirmada impediria alguém de faturar. O aviso
            informa sem impedir; se a norma se confirmar, vira validação.
          */}
          {nbsSobDuvida ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No seu regime, há indicação de que o NBS venha a ser exigido — as fontes ainda
              divergem e não estamos bloqueando. Se você já tem o código, preencha.
            </p>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Regime IBS/CBS</span>
          <select
            name="regimeIbsCbs"
            value={regime}
            onChange={(e) => setRegime(e.target.value)}
            className={inputClasses}
          >
            {Object.entries(REGIME_IBSCBS_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
          <Ajuda>CBS/IBS são calculados automaticamente conforme o regime e a competência.</Ajuda>
        </label>

        {/*
          Classificação tributária (grupo IBSCBS), a partir da correlação
          oficial do Anexo VIII para o item de serviço digitado.

          O que NÃO fazemos aqui, e é o ponto do desenho: não oferecemos os 71
          códigos de NFS-e, muito menos os 164 da tabela. Só os que o Anexo VIII
          correlaciona AO ITEM — que costumam ser um ou dois. Uma lista de 71
          opções sem orientação seria escolha no escuro com aparência de
          conformidade.
        */}
        {consultando ? (
          <p className="sm:col-span-2 text-xs text-slate-500">
            Consultando a classificação oficial do item…
          </p>
        ) : null}

        {correlacao && !consultando ? (
          <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">
              Classificação tributária de IBS/CBS
            </p>
            <p className="mt-1 text-xs text-slate-500">{correlacao.motivo}</p>

            {correlacao.categoria === "automatica" && correlacao.automatica ? (
              // Nada para escolher: o serviço preenche. Mostramos o que vai ser
              // gravado porque preencher em silêncio esconderia do usuário uma
              // declaração feita em nome dele.
              <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
                Será declarado <strong>CST {correlacao.automatica.cst}</strong> ·{" "}
                <strong>cClassTrib {correlacao.automatica.codigo}</strong> —{" "}
                {correlacao.automatica.descricaoOficial}
              </p>
            ) : null}

            {correlacao.categoria === "confirmacao" ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-sm text-slate-600">
                  Classificação aplicável a este serviço *
                </span>
                <select
                  name="ibscbsCClassTrib"
                  required
                  value={cClassTrib}
                  onChange={(e) => setCClassTrib(e.target.value)}
                  className={inputClasses}
                >
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {correlacao.opcoes.map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.codigo} — {o.descricaoOficial.slice(0, 110)}
                      {o.percReducaoIbs > 0 || o.percReducaoCbs > 0
                        ? ` (redução ${Math.round(o.percReducaoIbs * 100)}%${
                            o.percReducaoCbs !== o.percReducaoIbs
                              ? ` IBS / ${Math.round(o.percReducaoCbs * 100)}% CBS`
                              : ""
                          })`
                        : ""}
                    </option>
                  ))}
                </select>
                {opcaoEscolhida ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {opcaoEscolhida.artigoLc214 ? <>{opcaoEscolhida.artigoLc214}. </> : null}
                    {opcaoEscolhida.exigeTribRegular ? (
                      // O serviço RECUSA esses códigos (falha fechada). O texto
                      // precisa dizer isso: "confirme com seu contador" sugeria
                      // que dava para prosseguir, e não dá.
                      <span className="font-medium text-red-700">
                        Este código exige o grupo de tributação regular, que ainda não emitimos —
                        a nota será recusada. Falta definir qual CST/cClassTrib de tributação
                        regular declarar, e isso é enquadramento, não regra técnica.{" "}
                      </span>
                    ) : null}
                    {opcaoEscolhida.urlLegislacao ? (
                      <a
                        href={opcaoEscolhida.urlLegislacao}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-brand-600 underline"
                      >
                        Ver o dispositivo na LC 214/2025
                      </a>
                    ) : null}
                  </p>
                ) : null}
              </label>
            ) : null}

            {/*
              Tributação regular, informada à mão. Aparece só nos dois casos em
              que o sistema não tem como decidir: código que exige o grupo
              (RN 733/734) e item sem correlação oficial, onde qualquer código
              pode ser digitado.

              O sistema NÃO sugere e NÃO deduz o par: nenhuma fonte oficial diz
              qual declarar. Quem informa responde por ele — e o texto de ajuda
              precisa dizer isso sem rodeio, porque a alternativa é o operador
              achar que o campo é burocracia.
            */}
            {precisaTribRegular ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-sm text-slate-600">
                  cClassTrib da tributação regular{" "}
                  {escolhaExigeTribRegular ? <span aria-hidden>*</span> : null}
                </span>
                <input
                  name="ibscbsCClassTribReg"
                  inputMode="numeric"
                  maxLength={6}
                  required={escolhaExigeTribRegular}
                  placeholder="6 dígitos"
                  className={inputClasses}
                />
                <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-900">
                  <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    <strong>Operação sujeita a regime específico. Consulte seu contador
                    para informar o código correto.</strong>{" "}
                    {escolhaExigeTribRegular
                      ? "Este código exige o grupo de tributação regular: a nota não é emitida sem ele."
                      : "Preencha apenas se a operação estiver sob regime que exija o grupo."}{" "}
                    O CST é derivado dos 3 primeiros dígitos.
                  </span>
                </p>
              </label>
            ) : null}

            {correlacao.categoria === "sem_correlacao" ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-sm text-slate-600">
                  Código de classificação tributária (cClassTrib)
                </span>
                <input
                  name="ibscbsCClassTrib"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 dígitos"
                  value={cClassTrib}
                  onChange={(e) => setCClassTrib(e.target.value)}
                  className={inputClasses}
                />
                <Ajuda>
                  Sem sugestão de propósito: a tabela oficial não correlaciona nenhum código a
                  este item. O código informado é validado contra a tabela antes de a nota ser
                  criada.
                </Ajuda>
              </label>
            ) : null}
          </div>
        ) : null}

        {/*
          C7. Regime diferenciado era escolha livre: qualquer operador marcava
          "redução de 60%" em qualquer nota, sem vínculo com a atividade. Isto
          NÃO valida elegibilidade — validar exige a correlação atividade ↔
          regime, que é decisão contábil e ainda não existe. O que faz é tirar o
          "cliquei sem ver" e registrar quem confirmou, na própria nota.

          `required` no checkbox: o navegador barra antes do envio, e o schema
          barra de novo no servidor — a UI não é a validação.
        */}
        {regimeDiferenciado ? (
          <div className="sm:col-span-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                name="confirmacaoRegime"
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-400"
              />
              <span className="text-sm text-amber-900">
                {/*
                  A confirmação é uma só, mas o que ela afirma muda: pode vir do
                  regime escolhido, do cClassTrib com redução, ou dos dois.
                  Repetir o rótulo do regime quando quem pede é o código diria
                  "Padrão (alíquota cheia)" numa nota com 60% de redução.
                */}
                Confirmo que esta atividade se enquadra em{" "}
                <strong>
                  {escolhaTemReducao && opcaoEscolhida
                    ? `${opcaoEscolhida.codigo} — ${opcaoEscolhida.descricaoOficial}`
                    : REGIME_IBSCBS_LABEL[regime as keyof typeof REGIME_IBSCBS_LABEL]}
                </strong>
                .
                <span className="mt-1 block text-xs text-amber-800">
                  A confirmação fica registrada nesta nota com seu usuário e a data. Em caso de
                  dúvida sobre o enquadramento, consulte seu contador antes de emitir — a partir de
                  2027 o enquadramento indevido vira recolhimento a menor.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {/*
          Deduções da base (NT-009). Recolhidas num <details> porque a nota
          comum não tem nenhuma delas: quem não abrir isto emite com
          base = valor − ISSQN, que é o caso normal do prestador de serviço.
          Deixar os seis campos sempre visíveis sugeriria que precisam ser
          preenchidos.
        */}
        <details className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Deduções da base de cálculo (opcional)
          </summary>

          <p className="mt-2 text-xs text-slate-500">
            A base do IBS/CBS é o valor do serviço menos estas deduções — não o valor bruto.
            Deixe em branco o que não se aplica.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Desconto incondicionado (R$)</span>
              <input name="descontoIncondicionado" inputMode="decimal" placeholder="0,00" className={inputClasses} />
              <Ajuda>Só o incondicionado — desconto por pagamento antecipado não entra.</Ajuda>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">ISSQN (R$)</span>
              <input name="issqn" inputMode="decimal" placeholder="calculado pela alíquota" className={inputClasses} />
              <Ajuda>
                Em branco, é calculado como (valor − desconto) × alíquota de ISS. Informe
                <strong> 0</strong> se não há ISSQN a deduzir — é diferente de deixar vazio.
              </Ajuda>
            </label>

            {/*
              Ajuste de base: LISTA de documentos, não um total.

              A DPS referencia cada documento que origina o reembolso/repasse —
              tipo, identificação e valor — e o Fisco soma. Por isso não há
              campo de total aqui: ele é derivado e mostrado só como conferência.
            */}
            <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-slate-700">
                Ajuste de base — reembolso, repasse ou ressarcimento
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Referencie os documentos já tributados que não integram a sua base. O total é a
                soma deles: quem calcula o ajuste na nota é o Fisco, a partir do que for
                referenciado aqui.
              </p>

              {documentos.length > 0 ? (
                <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {documentos.map((d, i) => (
                    <li key={i} className="flex items-start gap-3 px-3 py-2 text-xs">
                      <div className="flex-1">
                        <p className="font-medium text-slate-700">{resumoDocumento(d)}</p>
                        <p className="text-slate-500">
                          {TIPO_AJUSTE_DOC_LABEL[d.tipo].slice(0, 90)}
                          {d.descricaoTipo ? ` — ${d.descricaoTipo}` : ""}
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-medium text-slate-700">
                        {formatarCentavos(d.valorCentavos)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDocumentos(documentos.filter((_, j) => j !== i))}
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remover documento ${i + 1}`}
                      >
                        <XCircle className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                  <li className="flex justify-between bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                    <span>Total do ajuste</span>
                    <span>{formatarCentavos(totalAjuste)}</span>
                  </li>
                </ul>
              ) : null}

              <DocumentoAjusteEditor
                onAdicionar={(d) => setDocumentos([...documentos, d])}
                desabilitado={documentos.length >= MAX_DOCUMENTOS_AJUSTE}
              />

              {/* A lista viaja como JSON: são objetos aninhados, e FormData é plano. */}
              <input
                type="hidden"
                name="documentosAjusteBase"
                value={JSON.stringify(documentos)}
              />
              {/*
                Só `ibscbs` é oferecido. `loc_imoveis` depende do grupo
                `imovel/` (unidades imobiliárias, CIB, copropriedade), que não
                está modelado — oferecer levaria a uma nota que não transmite.
              */}
              <input
                type="hidden"
                name="tipoAjusteBase"
                value={documentos.length > 0 ? "ibscbs" : ""}
              />
            </div>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">PIS (R$)</span>
              <input name="pis" inputMode="decimal" placeholder="0,00" className={inputClasses} />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">COFINS (R$)</span>
              <input name="cofins" inputMode="decimal" placeholder="0,00" className={inputClasses} />
              <Ajuda>
                PIS e COFINS só são dedutíveis até 2026 — os tributos deixam de existir depois.
              </Ajuda>
            </label>
          </div>
        </details>
      </div>

      {resultado && !resultado.ok && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {resultado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SendHorizonal className="h-4 w-4" aria-hidden />}
        {enviando ? "Enviando para o motor…" : "Emitir nota fiscal"}
      </button>
    </form>
  );
}
