"use client";

import { useCallback, useMemo, useState, useTransition, type DragEvent } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  FileKey2,
  HelpCircle,
  Loader2,
  Save,
  SearchCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";
import {
  salvarDadosFiscaisAction,
  uploadCertificadoAction,
  type ActionResult,
} from "./actions";

// ---------------------------------------------------------------------------
// Regimes tributários — realidade 2026 (Reforma Tributária, LC 214/2025)
// ---------------------------------------------------------------------------

interface OpcaoRegime {
  valor: "simples_nacional" | "mei" | "lucro_presumido" | "lucro_real";
  titulo: string;
  descricao: string;
  ibsCbs: string;
}

const REGIMES: OpcaoRegime[] = [
  {
    valor: "simples_nacional",
    titulo: "Simples Nacional",
    descricao: "Faturamento até R$ 4,8 mi/ano. Guia única (DAS).",
    ibsCbs:
      "Em 2026 você pode permanecer 100% no Simples ou optar por recolher IBS/CBS por fora (regime híbrido) — avalie com seu contador se seus clientes precisam de crédito.",
  },
  {
    valor: "mei",
    titulo: "MEI",
    descricao: "Faturamento até R$ 81 mil/ano. Tributação fixa mensal.",
    ibsCbs:
      "MEI segue fora do destaque obrigatório de IBS/CBS em 2026. A NFS-e sai pelo padrão do Emissor Nacional normalmente.",
  },
  {
    valor: "lucro_presumido",
    titulo: "Lucro Presumido",
    descricao: "Base presumida de lucro. Comum em serviços acima do Simples.",
    ibsCbs:
      "2026 é o ano-teste da reforma: destaque de CBS (0,9%) e IBS (0,1%) na nota, compensáveis com PIS/Cofins. Nosso emissor preenche os campos automaticamente.",
  },
  {
    valor: "lucro_real",
    titulo: "Lucro Real",
    descricao: "Apuração pelo lucro efetivo. Obrigatório acima de R$ 78 mi/ano.",
    ibsCbs:
      "2026 é o ano-teste da reforma: destaque de CBS (0,9%) e IBS (0,1%) na nota, compensáveis com PIS/Cofins. Nosso emissor preenche os campos automaticamente.",
  },
];

// ---------------------------------------------------------------------------
// Validador de código de serviço (lista LC 116/2003 usada pelo Emissor Nacional)
// Subconjunto dos itens mais comuns em serviços — validação de formato + lookup.
// ---------------------------------------------------------------------------

const CODIGOS_SERVICO: Record<string, string> = {
  "01.01": "Análise e desenvolvimento de sistemas",
  "01.02": "Programação",
  "01.03": "Processamento, armazenamento ou hospedagem de dados",
  "01.04": "Elaboração de programas de computador (software)",
  "01.05": "Licenciamento ou cessão de direito de uso de software",
  "01.06": "Assessoria e consultoria em informática",
  "01.07": "Suporte técnico em informática",
  "01.08": "Planejamento e confecção de páginas eletrônicas",
  "04.01": "Medicina e biomedicina",
  "07.02": "Execução de obras de construção civil",
  "08.02": "Instrução, treinamento e ensino",
  "10.02": "Agenciamento e intermediação de negócios",
  "14.01": "Lubrificação, limpeza e manutenção de máquinas",
  "17.01": "Assessoria ou consultoria de qualquer natureza",
  "17.02": "Datilografia, digitação e secretaria em geral",
  "25.01": "Serviços funerários",
  "35.01": "Serviços de reportagem e jornalismo",
};

type ValidacaoCodigo =
  | { estado: "vazio" }
  | { estado: "formato_invalido" }
  | { estado: "reconhecido"; descricao: string }
  | { estado: "formato_ok_nao_listado" };

function validarCodigoServico(bruto: string): ValidacaoCodigo {
  const codigo = bruto.trim().replace(",", ".");
  if (codigo === "") return { estado: "vazio" };
  if (!/^\d{2}\.\d{2}$/.test(codigo)) return { estado: "formato_invalido" };
  const descricao = CODIGOS_SERVICO[codigo];
  return descricao
    ? { estado: "reconhecido", descricao }
    : { estado: "formato_ok_nao_listado" };
}

// ---------------------------------------------------------------------------
// Componentes auxiliares
// ---------------------------------------------------------------------------

function Feedback({ resultado }: { resultado: ActionResult | null }) {
  if (!resultado) return null;
  return resultado.ok ? (
    <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Salvo com sucesso.</p>
  ) : (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>
  );
}

function Ajuda({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
      <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

interface DadosIniciais {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoMunicipal: string;
  codigoMunicipioIbge: string;
  regimeTributario: string;
  emailContato: string;
}

// ---------------------------------------------------------------------------
// Formulário principal
// ---------------------------------------------------------------------------

export function FormularioConfiguracoes({ dadosIniciais }: { dadosIniciais: DadosIniciais }) {
  const [salvandoDados, startDados] = useTransition();
  const [salvandoCert, startCert] = useTransition();
  const [resultadoDados, setResultadoDados] = useState<ActionResult | null>(null);
  const [resultadoCert, setResultadoCert] = useState<ActionResult | null>(null);

  const [regime, setRegime] = useState(dadosIniciais.regimeTributario);
  const [codigoServico, setCodigoServico] = useState("");
  const validacao = useMemo(() => validarCodigoServico(codigoServico), [codigoServico]);

  // ---- Drag and drop do certificado ----
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);

  const aceitarArquivo = useCallback((f: File | undefined) => {
    setErroArquivo(null);
    if (!f) return;
    const nome = f.name.toLowerCase();
    if (!nome.endsWith(".pfx") && !nome.endsWith(".p12")) {
      setErroArquivo("O certificado A1 deve ser um arquivo .pfx ou .p12.");
      return;
    }
    if (f.size === 0 || f.size > 512 * 1024) {
      setErroArquivo("Arquivo inválido: vazio ou maior que 512 KB.");
      return;
    }
    setArquivo(f);
  }, []);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    aceitarArquivo(e.dataTransfer.files[0]);
  }

  function enviarCertificado(formData: FormData) {
    if (!arquivo) {
      setResultadoCert({ ok: false, erro: "Arraste ou selecione o arquivo .pfx primeiro." });
      return;
    }
    formData.set("certificado", arquivo);
    startCert(async () => setResultadoCert(await uploadCertificadoAction(formData)));
  }

  const regimeSelecionado = REGIMES.find((r) => r.valor === regime);

  return (
    <div className="space-y-8">
      {/* ================= Dados fiscais ================= */}
      <form
        action={(formData) =>
          startDados(async () => setResultadoDados(await salvarDadosFiscaisAction(formData)))
        }
        className="rounded-xl border border-slate-200 bg-white p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-slate-500" aria-hidden />
          <h2 className="font-medium">Dados fiscais da empresa</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-slate-600">Razão social *</span>
            <input name="razaoSocial" required defaultValue={dadosIniciais.razaoSocial} className={inputClasses} />
            <Ajuda>
              Exatamente como está no cartão CNPJ da Receita Federal — é o nome que sai impresso na
              NFS-e.
            </Ajuda>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">Nome fantasia</span>
            <input name="nomeFantasia" defaultValue={dadosIniciais.nomeFantasia} className={inputClasses} />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">CNPJ *</span>
            <input
              name="cnpj"
              required
              inputMode="numeric"
              pattern="\d{14}"
              maxLength={14}
              placeholder="00000000000000"
              defaultValue={dadosIniciais.cnpj}
              className={inputClasses}
            />
            <Ajuda>Somente os 14 números, sem pontos ou barras.</Ajuda>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">Inscrição municipal</span>
            <input name="inscricaoMunicipal" defaultValue={dadosIniciais.inscricaoMunicipal} className={inputClasses} />
            <Ajuda>
              Consta no alvará ou no cadastro da prefeitura. Municípios integrados ao Emissor
              Nacional podem dispensá-la — deixe em branco se não tiver.
            </Ajuda>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">Código do município (IBGE) *</span>
            <input
              name="codigoMunicipioIbge"
              required
              inputMode="numeric"
              pattern="\d{7}"
              maxLength={7}
              placeholder="3550308"
              defaultValue={dadosIniciais.codigoMunicipioIbge}
              className={inputClasses}
            />
            <Ajuda>7 dígitos — ex.: São Paulo é 3550308. Busque por &quot;código IBGE + sua cidade&quot;.</Ajuda>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">E-mail de contato *</span>
            <input name="emailContato" type="email" required defaultValue={dadosIniciais.emailContato} className={inputClasses} />
          </label>
        </div>

        {/* ---- Seletor visual de regime tributário ---- */}
        <fieldset className="mt-6">
          <legend className="mb-2 text-sm text-slate-600">Regime tributário *</legend>
          <input type="hidden" name="regimeTributario" value={regime} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REGIMES.map((opcao) => {
              const ativo = regime === opcao.valor;
              return (
                <button
                  key={opcao.valor}
                  type="button"
                  onClick={() => setRegime(opcao.valor)}
                  aria-pressed={ativo}
                  className={`rounded-xl border p-4 text-left transition ${
                    ativo
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{opcao.titulo}</span>
                    {ativo && <BadgeCheck className="h-5 w-5 text-brand-600" aria-hidden />}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{opcao.descricao}</p>
                </button>
              );
            })}
          </div>
          {regimeSelecionado && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <strong>IBS/CBS em 2026:</strong> {regimeSelecionado.ibsCbs}
            </div>
          )}
        </fieldset>

        {/* ---- Validador de código de serviço (Emissor Nacional) ---- */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <SearchCheck className="h-4 w-4 text-slate-500" aria-hidden />
            <h3 className="text-sm font-medium">Verificador de código de serviço</h3>
          </div>
          <input
            value={codigoServico}
            onChange={(e) => setCodigoServico(e.target.value)}
            placeholder="Ex.: 01.05"
            inputMode="decimal"
            maxLength={5}
            aria-label="Código de serviço LC 116"
            className={`${inputClasses} max-w-40 bg-white`}
          />
          <div className="mt-2 min-h-5 text-xs" aria-live="polite">
            {validacao.estado === "vazio" && (
              <span className="text-slate-500">
                Digite o item da LC 116/2003 no formato <code>XX.XX</code> para conferir antes de
                configurar suas cobranças.
              </span>
            )}
            {validacao.estado === "formato_invalido" && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <XCircle className="h-3.5 w-3.5" aria-hidden />
                Formato inválido — use dois dígitos, ponto, dois dígitos (ex.: 17.01).
              </span>
            )}
            {validacao.estado === "reconhecido" && (
              <span className="inline-flex items-center gap-1 text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {validacao.descricao} — aceito pelo Emissor Nacional.
              </span>
            )}
            {validacao.estado === "formato_ok_nao_listado" && (
              <span className="text-amber-700">
                Formato válido, mas fora da nossa lista de códigos comuns. Confirme o item na tabela
                da LC 116 antes de usar.
              </span>
            )}
          </div>
          <Ajuda>
            Este código define o serviço na nota e a alíquota de ISS. Ele é informado por cobrança —
            aqui você só confere se o código que pretende usar existe.
          </Ajuda>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={salvandoDados}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {salvandoDados ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Salvar dados fiscais
          </button>
          <Feedback resultado={resultadoDados} />
        </div>
      </form>

      {/* ================= Certificado A1 (drag and drop) ================= */}
      <form action={enviarCertificado} className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-1 flex items-center gap-2">
          <FileKey2 className="h-5 w-5 text-slate-500" aria-hidden />
          <h2 className="font-medium">Certificado digital A1</h2>
        </div>
        <Ajuda>
          É o arquivo .pfx (ou .p12) emitido por uma Autoridade Certificadora (Serasa, Certisign,
          Soluti…). Não confunda com o A3, que fica em cartão/token — este não serve para emissão
          automática.
        </Ajuda>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={onDrop}
          className={`mt-4 rounded-xl border-2 border-dashed p-8 text-center transition ${
            arrastando
              ? "border-brand-500 bg-brand-50"
              : arquivo
                ? "border-green-300 bg-green-50"
                : "border-slate-300 bg-slate-50"
          }`}
        >
          {arquivo ? (
            <div className="flex flex-col items-center gap-1">
              <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden />
              <p className="text-sm font-medium">{arquivo.name}</p>
              <p className="text-xs text-slate-500">{(arquivo.size / 1024).toFixed(0)} KB</p>
              <button
                type="button"
                onClick={() => setArquivo(null)}
                className="mt-1 text-xs text-slate-500 underline underline-offset-2 hover:text-red-600"
              >
                Remover e escolher outro
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <UploadCloud className="h-8 w-8 text-slate-400" aria-hidden />
              <p className="text-sm text-slate-600">
                Arraste o arquivo <strong>.pfx</strong> aqui, ou
              </p>
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium hover:bg-slate-100">
                Procurar no computador
                <input
                  type="file"
                  accept=".pfx,.p12"
                  className="sr-only"
                  onChange={(e) => aceitarArquivo(e.target.files?.[0])}
                />
              </label>
            </div>
          )}
        </div>
        {erroArquivo && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {erroArquivo}
          </p>
        )}

        <label className="mt-4 block max-w-sm">
          <span className="mb-1 block text-sm text-slate-600">Senha do certificado *</span>
          <input name="senhaCertificado" type="password" required autoComplete="off" className={inputClasses} />
          <Ajuda>
            A senha definida quando o certificado foi emitido. Ela é criptografada junto com o
            arquivo — nunca armazenamos em texto puro.
          </Ajuda>
        </label>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={salvandoCert || !arquivo}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {salvandoCert ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UploadCloud className="h-4 w-4" aria-hidden />}
            Enviar certificado criptografado
          </button>
          <Feedback resultado={resultadoCert} />
        </div>
      </form>
    </div>
  );
}
