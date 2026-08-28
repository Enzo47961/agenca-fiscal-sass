import { describe, it, expect } from "vitest";
import {
  ALIQUOTA_TESTE,
  TesteNaoAplicavel,
  VALOR_TESTE_CENTAVOS,
  montarNotaDeTeste,
  resultadoDoTeste,
  type EmpresaParaTestar,
} from "@/services/teste-de-emissao";

const REF = "teste-11111111-2222-3333-4444-555555555555";
const HOJE = "2026-08-27";

const empresa = (p: Partial<EmpresaParaTestar> = {}): EmpresaParaTestar => ({
  cnpj: "11222333000181",
  razaoSocial: "Padaria do João LTDA",
  inscricaoMunicipal: "987654",
  codigoMunicipioIbge: "3550308",
  emailContato: "contato@padaria.com.br",
  codigoServicoTeste: "01.01",
  ...p,
});

describe("montarNotaDeTeste", () => {
  it("usa os dados REAIS da empresa como prestador", () => {
    const n = montarNotaDeTeste(empresa(), REF, HOJE);
    expect(n.prestador).toEqual({
      cnpj: "11222333000181",
      inscricaoMunicipal: "987654",
      codigoMunicipioIbge: "3550308",
    });
    expect(n.referenciaExterna).toBe(REF);
  });

  it("o TOMADOR e a propria empresa — nao inventa documento nem dado de terceiro", () => {
    // Inventar CPF/CNPJ arriscaria recusa por documento invalido, que seria
    // falso negativo. E inventar dado de terceiro seria dado pessoal sem base
    // legal num ambiente que ninguem autorizou.
    const n = montarNotaDeTeste(empresa(), REF, HOJE);
    expect(n.tomador.cpfCnpj).toBe("11222333000181");
    expect(n.tomador.nome).toBe("Padaria do João LTDA");
    expect(n.tomador.email).toBeNull();
  });

  it("usa o codigo de servico INFORMADO, nunca um padrao", () => {
    const n = montarNotaDeTeste(empresa({ codigoServicoTeste: "07.02" }), REF, HOJE);
    expect(n.servico.codigoServico).toBe("07.02");
  });

  it("emite por um centavo", () => {
    const n = montarNotaDeTeste(empresa(), REF, HOJE);
    expect(n.servico.valorCentavos).toBe(VALOR_TESTE_CENTAVOS);
    expect(n.servico.valorCentavos).toBe(1);
    expect(n.servico.aliquotaIss).toBe(ALIQUOTA_TESTE);
  });

  it("nao declara enquadramento da reforma — o teste nao apura isso", () => {
    const n = montarNotaDeTeste(empresa(), REF, HOJE);
    expect(n.servico.reforma.regime).toBe("padrao");
    expect(n.servico.reforma.declaracao).toBeNull();
    expect(n.servico.reforma.intencao).toBeNull();
    expect(n.servico.reforma.ibsValorCentavos).toBe(0);
  });

  it("competencia e a data CIVIL recebida, nao um instante em UTC", () => {
    const n = montarNotaDeTeste(empresa(), REF, "2026-12-31");
    expect(n.servico.competencia).toBe("2026-12-31");
  });
});

describe("montarNotaDeTeste — o que ele RECUSA montar", () => {
  it("sem codigo de servico, recusa e explica por que nao adivinha", () => {
    // Adivinhar produziria "configuracao com problema" quando o problema seria
    // o nosso chute — destruindo o valor do teste.
    try {
      montarNotaDeTeste(empresa({ codigoServicoTeste: null }), REF, HOJE);
      expect.unreachable("deveria ter lancado");
    } catch (e) {
      expect(e).toBeInstanceOf(TesteNaoAplicavel);
      expect((e as TesteNaoAplicavel).motivo).toBe("sem_codigo_servico");
      expect((e as Error).message).toMatch(/não é deduzido/i);
    }
  });

  it("sem inscricao municipal, recusa ANTES de gastar a requisicao", () => {
    try {
      montarNotaDeTeste(empresa({ inscricaoMunicipal: null }), REF, HOJE);
      expect.unreachable("deveria ter lancado");
    } catch (e) {
      expect((e as TesteNaoAplicavel).motivo).toBe("sem_inscricao_municipal");
    }
  });

  it("a falta do codigo e verificada antes da inscricao — as duas ausentes, uma mensagem so", () => {
    try {
      montarNotaDeTeste(
        empresa({ codigoServicoTeste: null, inscricaoMunicipal: null }),
        REF,
        HOJE,
      );
      expect.unreachable("deveria ter lancado");
    } catch (e) {
      expect((e as TesteNaoAplicavel).motivo).toBe("sem_codigo_servico");
    }
  });
});

describe("resultadoDoTeste", () => {
  it("emitida vira aprovacao sem erro", () => {
    expect(resultadoDoTeste({ tipo: "emitida" })).toEqual({ ok: true, erro: null });
  });

  it("recusada preserva a mensagem do provedor COMO VEIO", () => {
    // Nao classificamos a mensagem para adivinhar se a recusa foi "de
    // configuracao" ou "de dado": seria interpretacao de texto livre que muda
    // sem aviso, e um diagnostico confiante e falso e pior que nenhum.
    const bruta = "E0142: Inscricao municipal nao habilitada para emissao via webservice";
    expect(resultadoDoTeste({ tipo: "recusada", mensagem: bruta })).toEqual({
      ok: false,
      erro: bruta,
    });
  });
});
