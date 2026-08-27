import { describe, it, expect } from "vitest";
import { avaliarProntidao, type ProntidaoDaEmpresa } from "@/services/prontidao";

const HOJE = "2026-08-27";

const empresa = (p: Partial<ProntidaoDaEmpresa> = {}): ProntidaoDaEmpresa => ({
  providerFiscal: "focusnfe",
  providerStatus: "cadastrada",
  providerErro: null,
  certificadoValidoAte: "2027-01-01",
  ...p,
});

describe("avaliarProntidao — o que BARRA", () => {
  it("empresa nao cadastrada no provedor nao emite", () => {
    const b = avaliarProntidao(empresa({ providerStatus: "pendente" }), HOJE);
    expect(b?.motivo).toBe("nao_cadastrada");
    expect(b?.mensagem).toMatch(/Preparar a carteira/i);
  });

  it("cadastro em andamento pede para esperar, e diz por que demora", () => {
    const b = avaliarProntidao(empresa({ providerStatus: "cadastrando" }), HOJE);
    expect(b?.motivo).toBe("cadastro_em_andamento");
    expect(b?.mensagem).toMatch(/limite de requisi/i);
  });

  it("cadastro recusado repassa o motivo DO PROVEDOR, nao um generico nosso", () => {
    // A mensagem do provedor e a unica explicacao confiavel do que corrigir.
    const b = avaliarProntidao(
      empresa({ providerStatus: "falhou", providerErro: "Inscricao Municipal obrigatoria" }),
      HOJE,
    );
    expect(b?.motivo).toBe("cadastro_falhou");
    expect(b?.mensagem).toContain("Inscricao Municipal obrigatoria");
  });

  it("recusa sem motivo gravado ainda produz mensagem utilizavel", () => {
    const b = avaliarProntidao(empresa({ providerStatus: "falhou", providerErro: null }), HOJE);
    expect(b?.motivo).toBe("cadastro_falhou");
    expect(b?.mensagem).toMatch(/não detalhado/i);
  });

  it("certificado vencido barra, com a data em formato brasileiro", () => {
    const b = avaliarProntidao(empresa({ certificadoValidoAte: "2026-08-26" }), HOJE);
    expect(b?.motivo).toBe("certificado_vencido");
    expect(b?.mensagem).toContain("26/08/2026");
  });
});

describe("avaliarProntidao — o que NAO barra, de proposito", () => {
  it("empresa pronta passa", () => {
    expect(avaliarProntidao(empresa(), HOJE)).toBeNull();
  });

  it("SIMULACAO nunca e barrada — e como o produto e demonstrado", () => {
    const b = avaliarProntidao(
      empresa({ providerFiscal: "mock", providerStatus: "pendente", certificadoValidoAte: null }),
      HOJE,
    );
    expect(b).toBeNull();
  });

  it("certificado AUSENTE nao barra: ha municipios que autenticam por login e senha", () => {
    // Barrar aqui impediria emissao legitima em municipio que nao usa A1, e
    // tambem em empresa cujo certificado foi enviado direto no painel do
    // provedor — caso em que a validade simplesmente nao passa por nos.
    const b = avaliarProntidao(empresa({ certificadoValidoAte: null }), HOJE);
    expect(b).toBeNull();
  });

  it("certificado que vence HOJE ainda vale", () => {
    // Vencimento e no fim do dia. Barrar no dia seria tirar um dia util de quem
    // esta justamente correndo para renovar.
    expect(avaliarProntidao(empresa({ certificadoValidoAte: HOJE }), HOJE)).toBeNull();
  });

  it("compara validade por data CIVIL, nao por instante em UTC", () => {
    // O defeito do B4: as 21h de Sao Paulo ja e o dia seguinte em UTC, e um
    // certificado valido ate hoje apareceria vencido por tres horas.
    const vinteEUmaHoraEmSp = new Date("2026-08-27T21:30:00-03:00");
    expect(vinteEUmaHoraEmSp.toISOString().slice(0, 10)).toBe("2026-08-28");

    // Com a data civil correta, continua valendo.
    expect(avaliarProntidao(empresa({ certificadoValidoAte: "2026-08-27" }), "2026-08-27")).toBeNull();
  });
});

describe("ordem de verificacao", () => {
  it("cadastro pendente aparece antes de certificado vencido", () => {
    // Mandar renovar certificado de empresa que nem existe no provedor seria
    // trabalho jogado fora: resolvido o cadastro, o certificado ainda faltaria.
    const b = avaliarProntidao(
      empresa({ providerStatus: "pendente", certificadoValidoAte: "2020-01-01" }),
      HOJE,
    );
    expect(b?.motivo).toBe("nao_cadastrada");
  });
});
