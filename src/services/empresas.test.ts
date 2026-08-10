import { describe, it, expect } from "vitest";
import {
  atualizarDadosFiscais,
  atualizarProviderFiscal,
  dadosFiscaisSchema,
  pareceArquivoPfx,
  salvarCertificadoA1,
} from "@/services/empresas";
import { fakeSupabase, type FakeResult } from "@/test-utils/fake-supabase";

/**
 * O ponto destes testes é a validação, não o UPDATE. Sem ela, o tenant salvaria
 * "focusnfe" sem token configurado, a escolha seria aceita sem erro, e a falha
 * só apareceria dentro do motor Inngest — com a nota já criada e o usuário
 * fora da tela.
 */
function bancoFalso() {
  const updates: unknown[] = [];
  const db = fakeSupabase((ctx): FakeResult => {
    if (ctx.op === "update") updates.push(ctx.payload);
    return { data: null, error: null };
  });
  return { db, updates };
}

const EMPRESA = "11111111-1111-1111-1111-111111111111";

describe("atualizarProviderFiscal", () => {
  it("grava o provider quando ele está disponível", async () => {
    const { db, updates } = bancoFalso();
    await atualizarProviderFiscal(db, {
      empresaId: EMPRESA,
      provider: "focusnfe",
      disponiveis: ["mock", "focusnfe"],
    });

    expect(updates).toEqual([{ provider_fiscal: "focusnfe" }]);
  });

  it("recusa provider sem credencial configurada, e não grava nada", async () => {
    const { db, updates } = bancoFalso();

    await expect(
      atualizarProviderFiscal(db, {
        empresaId: EMPRESA,
        provider: "focusnfe",
        disponiveis: ["mock"], // token ausente → focusnfe fora da lista
      }),
    ).rejects.toThrow(/não está disponível/);

    expect(updates).toHaveLength(0);
  });

  it("recusa provider inexistente", async () => {
    const { db, updates } = bancoFalso();
    await expect(
      atualizarProviderFiscal(db, {
        empresaId: EMPRESA,
        provider: "nuvemfiscal",
        disponiveis: ["mock", "focusnfe"],
      }),
    ).rejects.toThrow(/não está disponível/);
    expect(updates).toHaveLength(0);
  });

  it("a mensagem de erro diz quais opções existem", async () => {
    const { db } = bancoFalso();
    await expect(
      atualizarProviderFiscal(db, {
        empresaId: EMPRESA,
        provider: "focusnfe",
        disponiveis: ["mock"],
      }),
    ).rejects.toThrow(/mock/);
  });

  it("propaga erro do banco", async () => {
    const db = fakeSupabase((): FakeResult => ({ data: null, error: { message: "RLS negou" } }));
    await expect(
      atualizarProviderFiscal(db, {
        empresaId: EMPRESA,
        provider: "mock",
        disponiveis: ["mock"],
      }),
    ).rejects.toThrow(/RLS negou/);
  });
});

// ---------------------------------------------------------------------------
// dadosFiscaisSchema: regime de apuração de IBS/CBS x regime tributário (A6)
//
// Substituiu o booleano `simplesPorFora`. Os testes de proteção do A5 seguem
// aqui, reescritos no modelo novo: o que eles guardam não é o nome do campo, é
// a regra de que MEI não opta pelo regime regular enquanto a dúvida normativa
// estiver de pé.
// ---------------------------------------------------------------------------

const BASE = {
  razaoSocial: "Empresa Teste LTDA",
  cnpj: "12345678000199",
  codigoMunicipioIbge: "3550308",
  emailContato: "contato@exemplo.com.br",
} as const;

const SIMPLES = {
  ...BASE,
  regimeTributario: "simples_nacional",
  situacaoSimplesNacional: "me_epp",
} as const;

describe("dadosFiscaisSchema — regime de apuração no Simples (A6)", () => {
  it("aceita a opção pelo regime regular no Simples Nacional", () => {
    const r = dadosFiscaisSchema.safeParse({
      ...SIMPLES,
      regimeApuracaoSN: "ambos_regime_regular",
      dataOpcaoRegimeRegular: "2026-01-01",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.regimeApuracaoSN).toBe("ambos_regime_regular");
  });

  it("aceita o regime híbrido — CBS pelo Simples, IBS pelo regular", () => {
    // É o caso que o booleano antigo não conseguia representar.
    const r = dadosFiscaisSchema.safeParse({
      ...SIMPLES,
      regimeApuracaoSN: "cbs_sn_ibs_regular",
    });
    expect(r.success).toBe(true);
  });

  it("recusa MEI optando pelo regime regular, e a mensagem explica o porquê", () => {
    const r = dadosFiscaisSchema.safeParse({
      ...BASE,
      regimeTributario: "mei",
      situacaoSimplesNacional: "mei",
      regimeApuracaoSN: "ambos_regime_regular",
    });

    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === "regimeApuracaoSN");
      expect(issue?.message).toMatch(/MEI/);
    }
  });

  it("recusa regime de apuração do Simples para quem não é optante", () => {
    for (const regimeTributario of ["lucro_presumido", "lucro_real"] as const) {
      const r = dadosFiscaisSchema.safeParse({
        ...BASE,
        regimeTributario,
        situacaoSimplesNacional: "nao_optante",
        regimeApuracaoSN: "ambos_regime_regular",
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toMatch(/regime regular/);
    }
  });

  it("exige o regime de apuração de quem É optante", () => {
    const r = dadosFiscaisSchema.safeParse({ ...SIMPLES });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "regimeApuracaoSN")).toBe(true);
    }
  });

  it("recusa situação incompatível com o regime tributário declarado", () => {
    // Os dois campos respondem à mesma pergunta por ângulos diferentes.
    const r = dadosFiscaisSchema.safeParse({
      ...BASE,
      regimeTributario: "lucro_real",
      situacaoSimplesNacional: "me_epp",
      regimeApuracaoSN: "ambos_pelo_sn",
    });
    expect(r.success).toBe(false);
  });

  it("não estorva regime nenhum na configuração padrão", () => {
    // Sem isto, a validação viraria uma regra sobre o REGIME em vez de uma
    // regra sobre a COMBINAÇÃO, e ninguém conseguiria salvar nada.
    const padrao = {
      simples_nacional: { situacaoSimplesNacional: "me_epp", regimeApuracaoSN: "ambos_pelo_sn" },
      mei: { situacaoSimplesNacional: "mei", regimeApuracaoSN: "ambos_pelo_sn" },
      lucro_presumido: { situacaoSimplesNacional: "nao_optante" },
      lucro_real: { situacaoSimplesNacional: "nao_optante" },
    } as const;

    for (const [regimeTributario, extra] of Object.entries(padrao)) {
      expect(dadosFiscaisSchema.safeParse({ ...BASE, regimeTributario, ...extra }).success).toBe(
        true,
      );
    }
  });

  it("recusa data de opção sem opção pelo regime regular", () => {
    const r = dadosFiscaisSchema.safeParse({
      ...SIMPLES,
      regimeApuracaoSN: "ambos_pelo_sn",
      dataOpcaoRegimeRegular: "2026-03-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["dataOpcaoRegimeRegular"]);
  });

  it("aceita opção SEM data — é o estado de quem veio da marcação antiga", () => {
    // A migration não teve como datar essas empresas sem inventar vigência.
    const r = dadosFiscaisSchema.safeParse({
      ...SIMPLES,
      regimeApuracaoSN: "ambos_regime_regular",
    });
    expect(r.success).toBe(true);
  });

  it("atualizarDadosFiscais não grava a combinação inválida", async () => {
    const { db, updates } = bancoFalso();
    await expect(
      atualizarDadosFiscais(db, {
        empresaId: EMPRESA,
        dados: {
          ...BASE,
          regimeTributario: "mei",
          situacaoSimplesNacional: "mei",
          regimeApuracaoSN: "ambos_regime_regular",
        },
      }),
    ).rejects.toThrow();

    expect(updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Magic bytes do certificado A1 (item M1)
//
// Sem a checagem, um .pem renomeado para .pfx é criptografado e guardado sem
// reclamação. A falha só aparece dentro do motor, na hora de assinar, como erro
// opaco — com o usuário longe da tela de configurações.
// ---------------------------------------------------------------------------

/** DER: SEQUENCE (0x30) + comprimento em forma longa + conteúdo. */
function pfxFalso(formaLonga = 0x82, tamanho = 2048): Buffer {
  const b = Buffer.alloc(tamanho, 0x41);
  b[0] = 0x30;
  b[1] = formaLonga;
  return b;
}

describe("pareceArquivoPfx", () => {
  it("aceita DER com comprimento em forma longa", () => {
    for (const forma of [0x81, 0x82, 0x83]) {
      expect(pareceArquivoPfx(pfxFalso(forma))).toBe(true);
    }
  });

  it("recusa PEM — o engano mais provável de quem sobe certificado", () => {
    expect(pareceArquivoPfx(Buffer.from("-----BEGIN CERTIFICATE-----\nMIIF...", "utf8"))).toBe(
      false,
    );
  });

  it("recusa outros formatos renomeados", () => {
    expect(pareceArquivoPfx(Buffer.from("%PDF-1.7\n%...", "utf8"))).toBe(false);
    expect(pareceArquivoPfx(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(false); // ZIP
    expect(pareceArquivoPfx(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false); // PNG
  });

  it("recusa buffer curto demais para ter cabeçalho", () => {
    expect(pareceArquivoPfx(Buffer.alloc(0))).toBe(false);
    expect(pareceArquivoPfx(Buffer.from([0x30, 0x82]))).toBe(false);
  });

  // Forma curta significa conteúdo < 256 bytes: certificado nenhum é tão pequeno.
  it("recusa DER com comprimento em forma curta", () => {
    expect(pareceArquivoPfx(Buffer.from([0x30, 0x20, 0x00, 0x00]))).toBe(false);
  });
});

describe("salvarCertificadoA1", () => {
  const CHAVE = Buffer.alloc(32, 7).toString("base64");

  function bancoComStorage() {
    const uploads: string[] = [];
    const db = fakeSupabase((): FakeResult => ({ data: null, error: null })) as never as Parameters<
      typeof salvarCertificadoA1
    >[0];
    (db as unknown as { storage: unknown }).storage = {
      from: () => ({
        upload: (caminho: string) => {
          uploads.push(caminho);
          return Promise.resolve({ error: null });
        },
      }),
    };
    return { db, uploads };
  }

  it("recusa arquivo que não é PFX e NÃO grava nada", async () => {
    const { db, uploads } = bancoComStorage();
    await expect(
      salvarCertificadoA1(db, {
        empresaId: EMPRESA,
        arquivoPfx: Buffer.from("-----BEGIN CERTIFICATE-----", "utf8"),
        senhaPfx: "senha",
        chaveCriptografiaBase64: CHAVE,
      }),
    ).rejects.toThrow(/não parece um certificado A1/);

    expect(uploads).toHaveLength(0);
  });

  it("aceita PFX válido e grava no caminho do tenant", async () => {
    const { db, uploads } = bancoComStorage();
    await salvarCertificadoA1(db, {
      empresaId: EMPRESA,
      arquivoPfx: pfxFalso(),
      senhaPfx: "senha",
      chaveCriptografiaBase64: CHAVE,
    });

    expect(uploads).toEqual([`${EMPRESA}/certificado-a1.enc`]);
  });
});
