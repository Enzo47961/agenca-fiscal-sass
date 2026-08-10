import { describe, it, expect } from "vitest";
import {
  CCLASSTRIB_TRIBUTACAO_INTEGRAL,
  chaveItemLc116,
  classificarCorrelacao,
  type OpcaoCClassTrib,
} from "@/lib/fiscal/correlacao";

/**
 * Correlação = Anexo VIII V1.01.00 (NT 008). Elegibilidade = enquadramento do
 * contribuinte. Estes testes travam a fronteira entre as duas: só o caso
 * comprovadamente seguro é automatizado.
 */

const integral: OpcaoCClassTrib = {
  codigo: CCLASSTRIB_TRIBUTACAO_INTEGRAL,
  cst: "000",
  descricaoOficial: "Situações tributadas integralmente pelo IBS e CBS.",
  percReducaoIbs: 0,
  percReducaoCbs: 0,
  exigeTribRegular: false,
  permiteCredPres: false,
  artigoLc214: "Art. 4 da LC 214/2025",
  urlLegislacao: null,
};

const saude: OpcaoCClassTrib = {
  ...integral,
  codigo: "200029",
  cst: "200",
  descricaoOficial: "Fornecimento dos serviços de saúde humana (Anexo III)",
  percReducaoIbs: 0.6,
  percReducaoCbs: 0.6,
};

const financeiro: OpcaoCClassTrib = {
  ...integral,
  codigo: "820007",
  cst: "820",
  descricaoOficial: "Documento com informações de fornecimento de serviços financeiros",
};

describe("classificarCorrelacao", () => {
  it("A: item com apenas tributação integral é automático", () => {
    const r = classificarCorrelacao("01.03", [integral]);
    expect(r.categoria).toBe("automatica");
    expect(r.automatica?.codigo).toBe("000001");
    expect(r.automatica?.cst).toBe("000");
  });

  it("B: item com mais de um código correlacionado exige escolha", () => {
    // 01.01 no Anexo VIII: 000001 + 200043 + 200044.
    const r = classificarCorrelacao("01.01", [
      integral,
      { ...integral, codigo: "200043", cst: "200" },
      { ...integral, codigo: "200044", cst: "200" },
    ]);
    expect(r.categoria).toBe("confirmacao");
    expect(r.automatica).toBeNull();
    expect(r.opcoes).toHaveLength(3);
  });

  it("B: código único COM redução não é automático — pressupõe enquadramento", () => {
    // Saúde (04.x) tem um só código, mas redução de 60%: automatizar seria
    // conceder benefício sem ninguém verificar se a empresa se enquadra.
    const r = classificarCorrelacao("04.03", [saude]);
    expect(r.categoria).toBe("confirmacao");
    expect(r.motivo).toMatch(/enquadramento setorial/);
  });

  it("B: os 8200xx ficam em confirmação mesmo sendo únicos e sem redução", () => {
    // Decisão conservadora: pressupõem que o emitente esteja num regime
    // específico, e a correlação não prova isso.
    const r = classificarCorrelacao("15.01", [financeiro]);
    expect(r.categoria).toBe("confirmacao");
    expect(r.motivo).toMatch(/regime específico/);
  });

  it("B: código que exige gTribRegular nunca é automático", () => {
    // RN 166/167 do Anexo VI: o grupo passa a ser obrigatório, e o sistema não
    // tem como preenchê-lo sozinho.
    const r = classificarCorrelacao("99.99", [{ ...integral, exigeTribRegular: true }]);
    expect(r.categoria).toBe("confirmacao");
  });

  it("B: código que permite crédito presumido nunca é automático", () => {
    const r = classificarCorrelacao("99.99", [{ ...integral, permiteCredPres: true }]);
    expect(r.categoria).toBe("confirmacao");
  });

  it("C: item sem correlação não recebe sugestão nenhuma", () => {
    const r = classificarCorrelacao("99.01.01", []);
    expect(r.categoria).toBe("sem_correlacao");
    expect(r.opcoes).toHaveLength(0);
    expect(r.automatica).toBeNull();
  });

  it("o motivo é texto para a tela, não jargão de log", () => {
    for (const r of [
      classificarCorrelacao("01.03", [integral]),
      classificarCorrelacao("04.03", [saude]),
      classificarCorrelacao("99.01.01", []),
    ]) {
      expect(r.motivo.length).toBeGreaterThan(40);
      expect(r.motivo).toContain(r.itemLc116);
    }
  });
});

describe("chaveItemLc116", () => {
  it("normaliza as formas que o formulário aceita", () => {
    expect(chaveItemLc116("01.05")).toBe("01.05");
    expect(chaveItemLc116("0105")).toBe("01.05");
    expect(chaveItemLc116("01,05")).toBe("01.05");
    expect(chaveItemLc116("  01.05 ")).toBe("01.05");
  });

  it("preserva subitem de três níveis", () => {
    expect(chaveItemLc116("99.01.01")).toBe("99.01.01");
  });
});
