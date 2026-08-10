import { describe, it, expect } from "vitest";
import {
  atualizarDadosFiscais,
  atualizarProviderFiscal,
  dadosFiscaisSchema,
  pareceArquivoPfx,
  salvarCertificadoA1,
} from "@/services/empresas";
import { REGIME_COM_SIMPLES_POR_FORA } from "@/lib/fiscal/regimes";
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
// dadosFiscaisSchema: "Simples por fora" x regime tributário
//
// O campo é gravado em `empresas.simples_por_fora` e a intenção é que ele
// influencie o enquadramento IBS/CBS. Aceitá-lo em um regime onde não se aplica
// grava uma marcação que o resto do sistema ignora — e o usuário fica achando
// que fez uma escolha fiscal que nunca aconteceu.
// ---------------------------------------------------------------------------

const BASE = {
  razaoSocial: "Empresa Teste LTDA",
  cnpj: "12345678000199",
  codigoMunicipioIbge: "3550308",
  emailContato: "contato@exemplo.com.br",
} as const;

describe("dadosFiscaisSchema — simplesPorFora", () => {
  it("aceita a marcação no Simples Nacional", () => {
    const r = dadosFiscaisSchema.safeParse({
      ...BASE,
      regimeTributario: "simples_nacional",
      simplesPorFora: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.simplesPorFora).toBe(true);
  });

  it("recusa MEI com a marcação, e a mensagem explica o porquê", () => {
    const r = dadosFiscaisSchema.safeParse({
      ...BASE,
      regimeTributario: "mei",
      simplesPorFora: true,
    });

    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues[0];
      expect(issue?.path).toEqual(["simplesPorFora"]);
      expect(issue?.message).toMatch(/MEI/);
    }
  });

  it("recusa lucro presumido e lucro real com a marcação", () => {
    for (const regimeTributario of ["lucro_presumido", "lucro_real"] as const) {
      const r = dadosFiscaisSchema.safeParse({
        ...BASE,
        regimeTributario,
        simplesPorFora: true,
      });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toMatch(/regime regular/);
    }
  });

  // Sem isto, a validação viraria uma regra sobre o REGIME em vez de uma regra
  // sobre a COMBINAÇÃO, e o MEI não conseguiria salvar nada.
  it("não estorva regime nenhum quando a marcação está desligada", () => {
    for (const regimeTributario of [
      "simples_nacional",
      "lucro_presumido",
      "lucro_real",
      "mei",
    ] as const) {
      expect(
        dadosFiscaisSchema.safeParse({ ...BASE, regimeTributario, simplesPorFora: false }).success,
      ).toBe(true);
      // omitido = default false
      expect(dadosFiscaisSchema.safeParse({ ...BASE, regimeTributario }).success).toBe(true);
    }
  });

  it("a UI e o schema usam a MESMA constante de regime", () => {
    // Divergência aqui é o cenário que a constante compartilhada existe para
    // impedir: a tela oferecer o campo que o schema recusa.
    expect(
      dadosFiscaisSchema.safeParse({
        ...BASE,
        regimeTributario: REGIME_COM_SIMPLES_POR_FORA,
        simplesPorFora: true,
      }).success,
    ).toBe(true);
  });

  it("atualizarDadosFiscais não grava a combinação inválida", async () => {
    const { db, updates } = bancoFalso();
    await expect(
      atualizarDadosFiscais(db, {
        empresaId: EMPRESA,
        dados: { ...BASE, regimeTributario: "mei", simplesPorFora: true },
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
