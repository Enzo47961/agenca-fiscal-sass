import { describe, it, expect } from "vitest";
import {
  FocusNfeProvider,
  aliquotaIssParaPercentual,
  centavosParaReais,
  ehTransiente,
  mensagemDeErro,
  urlAbsoluta,
} from "@/lib/fiscal/providers/focusnfe";
import {
  FiscalErrorPermanent,
  FiscalErrorTransient,
  type EmitirNfseInput,
} from "@/lib/fiscal/provider";

// ---------------------------------------------------------------------------
// Infra de teste: fetch falso, sem rede.
// ---------------------------------------------------------------------------

interface RespostaFalsa {
  status: number;
  corpo: unknown;
}

interface ChamadaRegistrada {
  url: string;
  metodo: string;
  corpo: unknown;
  autorizacao: string | null;
}

function fetchFalso(respostas: RespostaFalsa[]) {
  const chamadas: ChamadaRegistrada[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    chamadas.push({
      url: String(url),
      metodo: init?.method ?? "GET",
      corpo: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      autorizacao: headers.get("Authorization"),
    });
    const proxima = respostas[chamadas.length - 1] ?? respostas[respostas.length - 1];
    if (!proxima) throw new Error("fetchFalso sem resposta configurada");
    return {
      status: proxima.status,
      json: async () => proxima.corpo,
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, chamadas };
}

function criarProvider(respostas: RespostaFalsa[]) {
  const { impl, chamadas } = fetchFalso(respostas);
  const provider = new FocusNfeProvider({
    token: "token-de-homologacao",
    ambiente: "homologacao",
    fetchImpl: impl,
    esperar: async () => {}, // polling instantâneo no teste
    tentativasPolling: 2,
  });
  return { provider, chamadas };
}

const ENTRADA: EmitirNfseInput = {
  referenciaExterna: "11111111-2222-3333-4444-555555555555",
  prestador: {
    cnpj: "12345678000199",
    inscricaoMunicipal: "987654",
    codigoMunicipioIbge: "3550308",
  },
  tomador: {
    cpfCnpj: "12345678901",
    nome: "Cliente de Teste",
    email: "cliente@exemplo.com.br",
    endereco: { logradouro: "Rua Um", numero: "10" },
  },
  servico: {
    descricao: "Consultoria de teste",
    codigoServico: "01.01",
    valorCentavos: 123_456,
    aliquotaIss: 0.02, // fração no nosso schema = 2%
    issRetido: false,
    competencia: "2026-08-01",
    codigoNbs: "115011000",
    reforma: {
      regime: "padrao",
      cbsAliquota: 0.009,
      ibsAliquota: 0.001,
      cbsValorCentavos: 1111,
      ibsValorCentavos: 123,
    },
  },
};

const AUTORIZADA = {
  status: "autorizado",
  numero: 4321,
  codigo_verificacao: "ABC123",
  caminho_xml_nota_fiscal: "/arquivos_development/nfse.xml",
  caminho_danfse: "/arquivos_development/danfse.pdf",
};

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

describe("helpers de conversão", () => {
  it("converte centavos para reais com 2 casas", () => {
    expect(centavosParaReais(123_456)).toBe("1234.56");
    expect(centavosParaReais(1)).toBe("0.01");
    expect(centavosParaReais(0)).toBe("0.00");
  });

  it("recusa valor que não é inteiro em centavos (regra 15)", () => {
    expect(() => centavosParaReais(10.5)).toThrow(FiscalErrorPermanent);
  });

  it("converte alíquota fração → percentual", () => {
    expect(aliquotaIssParaPercentual(0.02)).toBe("2");
    expect(aliquotaIssParaPercentual(0.05)).toBe("5");
    expect(aliquotaIssParaPercentual(0.0325)).toBe("3.25");
    expect(aliquotaIssParaPercentual(0)).toBe("0");
  });

  it("monta URL absoluta a partir do caminho relativo, e preserva absoluta", () => {
    expect(urlAbsoluta("https://x.com", "/a/b.xml")).toBe("https://x.com/a/b.xml");
    expect(urlAbsoluta("https://x.com", "a/b.xml")).toBe("https://x.com/a/b.xml");
    expect(urlAbsoluta("https://x.com", "https://y.com/b.xml")).toBe("https://y.com/b.xml");
    expect(urlAbsoluta("https://x.com", null)).toBeNull();
  });

  it("agrega os erros da Focus numa mensagem única", () => {
    expect(
      mensagemDeErro(
        { erros: [{ codigo: "E1", mensagem: "faltou X", correcao: "informe X" }] },
        "fallback",
      ),
    ).toBe("E1 — faltou X — informe X");
    expect(mensagemDeErro({ mensagem: "token inválido" }, "fallback")).toBe("token inválido");
    expect(mensagemDeErro({}, "fallback")).toBe("fallback");
  });

  it("classifica HTTP transiente vs. permanente (regra 8)", () => {
    expect(ehTransiente(500)).toBe(true);
    expect(ehTransiente(503)).toBe(true);
    expect(ehTransiente(429)).toBe(true);
    expect(ehTransiente(408)).toBe(true);
    expect(ehTransiente(422)).toBe(false);
    expect(ehTransiente(400)).toBe(false);
    expect(ehTransiente(401)).toBe(false);
    expect(ehTransiente(404)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// emitir()
// ---------------------------------------------------------------------------

describe("FocusNfeProvider.emitir", () => {
  it("exige token — não permite provider sem credencial", () => {
    expect(() => new FocusNfeProvider({ token: "", ambiente: "homologacao" })).toThrow(
      FiscalErrorPermanent,
    );
  });

  it("usa a URL de homologação, Basic auth e a ref como chave de idempotência", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(ENTRADA);

    const c = chamadas[0]!;
    expect(c.url).toBe(
      `https://homologacao.focusnfe.com.br/v2/nfse?ref=${ENTRADA.referenciaExterna}`,
    );
    expect(c.metodo).toBe("POST");
    expect(c.autorizacao).toBe(
      `Basic ${Buffer.from("token-de-homologacao:").toString("base64")}`,
    );
  });

  it("monta o payload traduzindo centavos, alíquota e tipo de documento do tomador", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(ENTRADA);

    const corpo = chamadas[0]!.corpo as Record<string, Record<string, unknown>>;
    expect(corpo.prestador).toMatchObject({
      cnpj: "12345678000199",
      inscricao_municipal: "987654",
      codigo_municipio: "3550308",
    });
    // 11 dígitos → CPF (e não CNPJ)
    expect(corpo.tomador!.cpf).toBe("12345678901");
    expect(corpo.tomador!.cnpj).toBeUndefined();
    expect(corpo.servico).toMatchObject({
      discriminacao: "Consultoria de teste",
      item_lista_servico: "01.01",
      valor_servicos: "1234.56",
      aliquota: "2",
      iss_retido: false,
      codigo_nbs: "115011000",
    });
  });

  it("usa cnpj quando o tomador tem 14 dígitos", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir({
      ...ENTRADA,
      tomador: { ...ENTRADA.tomador, cpfCnpj: "12345678000199" },
    });
    const corpo = chamadas[0]!.corpo as Record<string, Record<string, unknown>>;
    expect(corpo.tomador!.cnpj).toBe("12345678000199");
    expect(corpo.tomador!.cpf).toBeUndefined();
  });

  it("devolve o resultado quando a Focus já responde autorizado", async () => {
    const { provider } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    const r = await provider.emitir(ENTRADA);

    expect(r).toEqual({
      numeroNfse: "4321",
      codigoVerificacao: "ABC123",
      providerId: `focusnfe_${ENTRADA.referenciaExterna}`,
      urlPdf: "https://homologacao.focusnfe.com.br/arquivos_development/danfse.pdf",
      urlXml: "https://homologacao.focusnfe.com.br/arquivos_development/nfse.xml",
    });
  });

  it("faz polling curto quando volta processando_autorizacao e resolve sem retry longo", async () => {
    const { provider, chamadas } = criarProvider([
      { status: 202, corpo: { status: "processando_autorizacao" } },
      { status: 200, corpo: { status: "processando_autorizacao" } },
      { status: 200, corpo: AUTORIZADA },
    ]);
    const r = await provider.emitir(ENTRADA);

    expect(r.numeroNfse).toBe("4321");
    expect(chamadas).toHaveLength(3);
    expect(chamadas[1]!.metodo).toBe("GET");
  });

  it("lança transiente quando o polling curto esgota — devolve o controle ao backoff", async () => {
    const { provider } = criarProvider([
      { status: 202, corpo: { status: "processando_autorizacao" } },
    ]);
    await expect(provider.emitir(ENTRADA)).rejects.toBeInstanceOf(FiscalErrorTransient);
  });

  it("rejeição da prefeitura é PERMANENTE e preserva o payload bruto (regras 8 e 10)", async () => {
    const corpoErro = {
      status: "erro_autorizacao",
      status_sefaz: "E123",
      erros: [{ codigo: "E123", mensagem: "Inscrição municipal inválida" }],
    };
    const { provider } = criarProvider([{ status: 200, corpo: corpoErro }]);

    const erro = await provider.emitir(ENTRADA).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FiscalErrorPermanent);
    expect((erro as FiscalErrorPermanent).message).toContain("Inscrição municipal inválida");
    expect((erro as FiscalErrorPermanent).payloadBruto).toMatchObject({ status_sefaz: "E123" });
  });

  it("422 de validação é PERMANENTE (retry não resolve)", async () => {
    const { provider } = criarProvider([
      { status: 422, corpo: { codigo: "requisicao_invalida", mensagem: "codigo_municipio ausente" } },
    ]);
    await expect(provider.emitir(ENTRADA)).rejects.toBeInstanceOf(FiscalErrorPermanent);
  });

  it("401 (token errado) é PERMANENTE — não queima as 4 tentativas", async () => {
    const { provider } = criarProvider([
      { status: 401, corpo: { codigo: "permissao_negada", mensagem: "token inválido" } },
    ]);
    await expect(provider.emitir(ENTRADA)).rejects.toBeInstanceOf(FiscalErrorPermanent);
  });

  it("500 e 429 são TRANSIENTES", async () => {
    const { provider: p500 } = criarProvider([{ status: 500, corpo: {} }]);
    await expect(p500.emitir(ENTRADA)).rejects.toBeInstanceOf(FiscalErrorTransient);

    const { provider: p429 } = criarProvider([{ status: 429, corpo: {} }]);
    await expect(p429.emitir(ENTRADA)).rejects.toBeInstanceOf(FiscalErrorTransient);
  });

  it("falha de rede vira TRANSIENTE classificado, nunca erro genérico", async () => {
    const impl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const provider = new FocusNfeProvider({
      token: "t",
      ambiente: "homologacao",
      fetchImpl: impl,
    });
    const erro = await provider.emitir(ENTRADA).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FiscalErrorTransient);
    expect((erro as FiscalErrorTransient).codigo).toBe("rede");
  });

  it("corpo fora do contrato vira TRANSIENTE com o bruto preservado (regra 19)", async () => {
    const { provider } = criarProvider([{ status: 200, corpo: { status: 42 } }]);
    const erro = await provider.emitir(ENTRADA).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FiscalErrorTransient);
    expect((erro as FiscalErrorTransient).codigo).toBe("contrato_invalido");
  });

  it("autorizado sem número não vira nota: transiente, sem inventar numeração", async () => {
    const { provider } = criarProvider([{ status: 200, corpo: { status: "autorizado" } }]);
    const erro = await provider.emitir(ENTRADA).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FiscalErrorTransient);
    expect((erro as FiscalErrorTransient).codigo).toBe("resposta_incompleta");
  });

  it("status desconhecido é transiente MAS com código explícito para investigação", async () => {
    const { provider } = criarProvider([{ status: 200, corpo: { status: "coisa_nova" } }]);
    const erro = await provider.emitir(ENTRADA).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FiscalErrorTransient);
    expect((erro as FiscalErrorTransient).codigo).toBe("status_desconhecido");
  });

  // O caso que a regra 7 existe para cobrir.
  it("ref duplicada não vira erro: consulta e devolve a nota já emitida", async () => {
    const { provider, chamadas } = criarProvider([
      { status: 422, corpo: { codigo: "ref_duplicada", mensagem: "Referência já existe" } },
      { status: 200, corpo: AUTORIZADA },
    ]);
    const r = await provider.emitir(ENTRADA);

    expect(r.numeroNfse).toBe("4321");
    expect(chamadas[1]!.metodo).toBe("GET");
  });
});

// ---------------------------------------------------------------------------
// consultarPorReferencia()
// ---------------------------------------------------------------------------

describe("FocusNfeProvider.consultarPorReferencia", () => {
  it("404 devolve null — nota nunca chegou à Focus", async () => {
    const { provider } = criarProvider([{ status: 404, corpo: { codigo: "nao_encontrado" } }]);
    expect(await provider.consultarPorReferencia("ref-x")).toBeNull();
  });

  it("processando devolve null — motor decide o que fazer", async () => {
    const { provider } = criarProvider([
      { status: 200, corpo: { status: "processando_autorizacao" } },
    ]);
    expect(await provider.consultarPorReferencia("ref-x")).toBeNull();
  });

  it("autorizado devolve o resultado", async () => {
    const { provider } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    const r = await provider.consultarPorReferencia("ref-x");
    expect(r?.numeroNfse).toBe("4321");
  });

  it("cancelado NÃO é tratado como emitida", async () => {
    const { provider } = criarProvider([{ status: 200, corpo: { status: "cancelado" } }]);
    await expect(provider.consultarPorReferencia("ref-x")).rejects.toBeInstanceOf(
      FiscalErrorPermanent,
    );
  });
});

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

describe("ambiente", () => {
  it("produção usa api.focusnfe.com.br", async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200, corpo: AUTORIZADA }]);
    const provider = new FocusNfeProvider({
      token: "t",
      ambiente: "producao",
      fetchImpl: impl,
      esperar: async () => {},
    });
    await provider.emitir(ENTRADA);
    expect(chamadas[0]!.url).toContain("https://api.focusnfe.com.br/");
  });
});

// ---------------------------------------------------------------------------
// Grupo IBSCBS (item C5)
// ---------------------------------------------------------------------------

describe("grupo IBSCBS no payload", () => {
  it("sem declaração, nada da reforma vai no payload (estado normal hoje)", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(ENTRADA);

    const servico = (chamadas[0]!.corpo as Record<string, Record<string, unknown>>).servico!;
    expect(servico.ibs_cbs_classificacao_tributaria).toBeUndefined();
  });

  it("com declaração válida, envia o cClassTrib no campo da Focus", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir({
      ...ENTRADA,
      servico: {
        ...ENTRADA.servico,
        reforma: {
          ...ENTRADA.servico.reforma,
          declaracao: { cst: "200", cClassTrib: "200027" },
        },
      },
    });

    const servico = (chamadas[0]!.corpo as Record<string, Record<string, unknown>>).servico!;
    // CST e cClassTrib sao campos SEPARADOS na DPS (Anexo VI, ambos 1-1), e a
    // Focus expoe os dois. A versao anterior mandava so o cClassTrib.
    expect(servico.ibs_cbs_classificacao_tributaria).toBe("200027");
    expect(servico.ibs_cbs_situacao_tributaria).toBe("200");
  });

  it("declaração incoerente é erro PERMANENTE e a nota nem é enviada", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    const erro = await provider
      .emitir({
        ...ENTRADA,
        servico: {
          ...ENTRADA.servico,
          reforma: {
            ...ENTRADA.servico.reforma,
            // cClassTrib não bate com o CST
            declaracao: { cst: "200", cClassTrib: "000001" },
          },
        },
      })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FiscalErrorPermanent);
    expect((erro as FiscalErrorPermanent).codigo).toBe("ibscbs_invalido");
    // Nenhuma requisição saiu: falhou antes de tocar a prefeitura.
    expect(chamadas).toHaveLength(0);
  });

  it("CST que exige diferimento sem o grupo é recusado antes do envio", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    const erro = await provider
      .emitir({
        ...ENTRADA,
        servico: {
          ...ENTRADA.servico,
          reforma: {
            ...ENTRADA.servico.reforma,
            declaracao: { cst: "510", cClassTrib: "510001" },
          },
        },
      })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FiscalErrorPermanent);
    expect((erro as FiscalErrorPermanent).message).toContain("diferimento");
    expect(chamadas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Validação contra a TABELA DE DOMÍNIO oficial (carregador injetado).
// Sem o carregador a validação é só estrutural; com ele, confere a existência
// do cClassTrib nos 164 códigos oficiais.
// ---------------------------------------------------------------------------

function comDeclaracao(cst: string, cClassTrib: string): EmitirNfseInput {
  return {
    ...ENTRADA,
    servico: {
      ...ENTRADA.servico,
      reforma: { ...ENTRADA.servico.reforma, declaracao: { cst, cClassTrib } },
    },
  };
}

describe("validação contra a tabela de domínio", () => {
  it("aceita código que existe na tabela", async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200, corpo: AUTORIZADA }]);
    const provider = new FocusNfeProvider({
      token: "t",
      ambiente: "homologacao",
      fetchImpl: impl,
      esperar: async () => {},
      carregarCClassTribConhecidos: async () => new Set(["200027", "000001"]),
    });

    const r = await provider.emitir(comDeclaracao("200", "200027"));
    expect(r.numeroNfse).toBe("4321");
    expect(chamadas).toHaveLength(1);
  });

  // O caso que a trava existe para pegar: código estruturalmente perfeito
  // (6 dígitos, prefixo batendo com o CST) mas que não existe na tabela.
  it("recusa código inexistente mesmo com estrutura perfeita", async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200, corpo: AUTORIZADA }]);
    const provider = new FocusNfeProvider({
      token: "t",
      ambiente: "homologacao",
      fetchImpl: impl,
      esperar: async () => {},
      carregarCClassTribConhecidos: async () => new Set(["200027"]),
    });

    const erro = await provider.emitir(comDeclaracao("200", "200999")).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FiscalErrorPermanent);
    expect((erro as FiscalErrorPermanent).message).toContain("tabela de domínio");
    // Nada saiu para a prefeitura.
    expect(chamadas).toHaveLength(0);
  });

  it("sem carregador, a validação estrutural continua valendo", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    // 200999 não existe na tabela, mas sem carregador não há como saber —
    // a estrutura está correta, então passa.
    const r = await provider.emitir(comDeclaracao("200", "200999"));
    expect(r.numeroNfse).toBe("4321");
    expect(chamadas).toHaveLength(1);
  });

  // Banco fora do ar não é erro de enquadramento: é infra nossa. Transiente,
  // para o backoff tentar de novo — e nunca emitir sem ter conferido.
  it("falha ao carregar a tabela é TRANSIENTE e não emite", async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200, corpo: AUTORIZADA }]);
    const provider = new FocusNfeProvider({
      token: "t",
      ambiente: "homologacao",
      fetchImpl: impl,
      esperar: async () => {},
      carregarCClassTribConhecidos: async () => {
        throw new Error("conexão recusada");
      },
    });

    const erro = await provider.emitir(comDeclaracao("200", "200027")).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FiscalErrorTransient);
    expect((erro as FiscalErrorTransient).codigo).toBe("dominio_indisponivel");
    expect(chamadas).toHaveLength(0);
  });

  it("sem declaração, o carregador nem é chamado", async () => {
    let chamou = false;
    const { impl } = fetchFalso([{ status: 200, corpo: AUTORIZADA }]);
    const provider = new FocusNfeProvider({
      token: "t",
      ambiente: "homologacao",
      fetchImpl: impl,
      esperar: async () => {},
      carregarCClassTribConhecidos: async () => {
        chamou = true;
        return new Set<string>();
      },
    });

    await provider.emitir(ENTRADA);
    expect(chamou).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Componentes da base e regime do Simples no payload.
//
// Campos confirmados na referencia de campos da Focus para NFS-e nacional.
// O vBC NAO entra: no Anexo VI ele e do lado NFS-e, calculado pelo ADN.
// ---------------------------------------------------------------------------

describe("componentes da base e Simples Nacional no payload", () => {
  const comReforma = (extra: Record<string, unknown>) => ({
    ...ENTRADA,
    servico: {
      ...ENTRADA.servico,
      reforma: { ...ENTRADA.servico.reforma, ...extra },
    },
  });

  it("envia desconto incondicionado, PIS e COFINS em reais", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(
      comReforma({
        baseCalculo: {
          baseCentavos: 71_250,
          valorServicoCentavos: 100_000,
          descontoIncondicionadoCentavos: 10_000,
          ajusteBaseCentavos: 0,
          tipoAjusteBase: null,
          issqnCentavos: 4_500,
          pisCentavos: 1_650,
          cofinsCentavos: 7_600,
        },
      }),
    );

    const servico = (chamadas[0]!.corpo as Record<string, Record<string, unknown>>).servico!;
    // centavosParaReais devolve STRING com 2 casas — e o que a Focus espera.
    expect(servico.desconto_incondicionado).toBe("100.00");
    expect(servico.valor_pis).toBe("16.50");
    expect(servico.valor_cofins).toBe("76.00");
  });

  it("NAO envia o vBC — quem calcula a base e o Ambiente de Dados Nacional", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(
      comReforma({
        baseCalculo: {
          baseCentavos: 71_250,
          valorServicoCentavos: 100_000,
          descontoIncondicionadoCentavos: 0,
          ajusteBaseCentavos: 0,
          tipoAjusteBase: null,
          issqnCentavos: 0,
          pisCentavos: 0,
          cofinsCentavos: 0,
        },
      }),
    );

    const corpo = chamadas[0]!.corpo as Record<string, Record<string, unknown>>;
    const servico = corpo.servico!;
    expect(servico.vBC).toBeUndefined();
    expect(servico.base_calculo).toBeUndefined();
    // valor_servicos continua sendo o vServ BRUTO da ENTRADA, nao a base
    // reduzida (baseCentavos era 71.250, o bruto e outro numero).
    expect(servico.valor_servicos).toBe(centavosParaReais(ENTRADA.servico.valorCentavos));
  });

  it("componente zerado nao vira 0,00 no payload", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(
      comReforma({
        baseCalculo: {
          baseCentavos: 100_000,
          valorServicoCentavos: 100_000,
          descontoIncondicionadoCentavos: 0,
          ajusteBaseCentavos: 0,
          tipoAjusteBase: null,
          issqnCentavos: 0,
          pisCentavos: 0,
          cofinsCentavos: 0,
        },
      }),
    );

    const servico = (chamadas[0]!.corpo as Record<string, Record<string, unknown>>).servico!;
    expect(servico.desconto_incondicionado).toBeUndefined();
    expect(servico.valor_pis).toBeUndefined();
  });

  it("traduz a intencao nos codigos oficiais opSimpNac e regApTribSN", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(
      comReforma({
        intencao: {
          regime: "padrao",
          situacaoSimplesNacional: "me_epp",
          regimeApuracaoSN: "cbs_sn_ibs_regular",
        },
      }),
    );

    const corpo = chamadas[0]!.corpo as Record<string, unknown>;
    // Tabela oficial da NT-009: me_epp = 3, cbs_sn_ibs_regular = 2.
    expect(corpo.codigo_opcao_simples_nacional).toBe(3);
    expect(corpo.regime_tributario_simples_nacional).toBe(2);
  });

  it("sem intencao, omite em vez de afirmar 'nao optante'", async () => {
    // Afirmar a situacao errada perante o Simples e pior que deixar a Focus
    // aplicar o padrao dela.
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(ENTRADA);

    const corpo = chamadas[0]!.corpo as Record<string, unknown>;
    expect(corpo.codigo_opcao_simples_nacional).toBeUndefined();
    expect(corpo.regime_tributario_simples_nacional).toBeUndefined();
  });
});

describe("tributacao regular e ajuste de base no payload", () => {
  const comReforma = (extra: Record<string, unknown>) => ({
    ...ENTRADA,
    servico: { ...ENTRADA.servico, reforma: { ...ENTRADA.servico.reforma, ...extra } },
  });

  it("envia CSTReg e cClassTribReg quando o par foi informado", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(
      comReforma({
        declaracao: {
          cst: "550",
          cClassTrib: "550016",
          tribRegular: { cstRegular: "000", cClassTribRegular: "000001" },
        },
      }),
    );

    const servico = (chamadas[0]!.corpo as Record<string, Record<string, unknown>>).servico!;
    expect(servico.ibs_cbs_situacao_tributaria_regular).toBe("000");
    expect(servico.ibs_cbs_classificacao_tributaria_regular).toBe("000001");
  });

  it("sem o par, os campos nao aparecem", async () => {
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(comReforma({ declaracao: { cst: "200", cClassTrib: "200027" } }));

    const servico = (chamadas[0]!.corpo as Record<string, Record<string, unknown>>).servico!;
    expect(servico.ibs_cbs_situacao_tributaria_regular).toBeUndefined();
  });

  it("ajuste de base fica FORA enquanto o nome do campo da Focus for desconhecido", async () => {
    // O valor existe e esta calculado; falta so a chave. Inventar nome faria a
    // nota sair com o valor onde o Fisco nao le, e o erro so apareceria na
    // apuracao. Quando a chave chegar, este teste passa a valer ao contrario.
    const { provider, chamadas } = criarProvider([{ status: 200, corpo: AUTORIZADA }]);
    await provider.emitir(
      comReforma({
        baseCalculo: {
          baseCentavos: 70_000,
          valorServicoCentavos: 100_000,
          descontoIncondicionadoCentavos: 0,
          ajusteBaseCentavos: 30_000,
          tipoAjusteBase: "ibscbs",
          issqnCentavos: 0,
          pisCentavos: 0,
          cofinsCentavos: 0,
        },
      }),
    );

    const servico = (chamadas[0]!.corpo as Record<string, Record<string, unknown>>).servico!;
    const chaves = Object.keys(servico).filter((k) => /ajuste/i.test(k));
    expect(chaves).toEqual([]);
  });
});
