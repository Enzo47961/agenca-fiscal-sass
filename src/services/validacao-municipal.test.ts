import { describe, it, expect } from "vitest";
import { type Database } from "@/types/database";
import {
  resumirCarteira,
  validarContraMunicipio,
  type DadosDaEmpresaParaValidar,
} from "@/services/validacao-municipal";

type MunicipioRow = Database["public"]["Tables"]["municipios_nfse"]["Row"];

const municipio = (p: Partial<MunicipioRow> = {}): MunicipioRow => ({
  codigo_ibge: "3550308",
  nome: "São Paulo",
  uf: "SP",
  nfse_habilitada: true,
  possui_homologacao: true,
  possui_cancelamento: true,
  requer_certificado: true,
  provedor: "Ginfes",
  status: "ativo",
  previsao_reimplementacao: null,
  ultima_emissao: null,
  endereco_obrigatorio: null,
  cpf_cnpj_obrigatorio: null,
  cnae_obrigatorio: null,
  item_lista_servico_obrigatorio: null,
  codigo_tributario_obrigatorio: null,
  sincronizado_em: "2026-08-27T00:00:00Z",
  ...p,
});

const empresa = (p: Partial<DadosDaEmpresaParaValidar> = {}): DadosDaEmpresaParaValidar => ({
  cnpj: "11222333000181",
  inscricaoMunicipal: "987654",
  cnae: "6201500",
  codigoMunicipioIbge: "3550308",
  certificadoValidoAte: "2027-01-01",
  ...p,
});

describe("validarContraMunicipio — o que NAO gasta credito", () => {
  it("municipio sem NFS-e integrada e IMPOSSIVEL, e nao testa", () => {
    const r = validarContraMunicipio(empresa(), municipio({ nfse_habilitada: false }));
    expect(r.situacao).toBe("impossivel");
    expect(r.vaiTestar).toBe(false);
  });

  it("municipio fora do ar nao gasta tentativa, e informa a previsao", () => {
    const r = validarContraMunicipio(
      empresa(),
      municipio({ status: "fora do ar", previsao_reimplementacao: "2026-09-15" }),
    );
    expect(r.situacao).toBe("indisponivel");
    expect(r.vaiTestar).toBe(false);
    expect(r.pendencias[0]).toContain("2026-09-15");
  });

  it("SEM ambiente de homologacao nao testa — e esta e a razao de existir do mapa", () => {
    // Sem o mapa, descobrir isto custaria uma tentativa por empresa daquele
    // municipio. Com ele, custa zero.
    const r = validarContraMunicipio(empresa(), municipio({ possui_homologacao: false }));
    expect(r.situacao).toBe("sem_ambiente_de_teste");
    expect(r.vaiTestar).toBe(false);
    expect(r.pendencias[0]).toMatch(/produção/i);
  });

  it("homologacao desconhecida (null) e tratada como ausente — nao inventa ambiente", () => {
    const r = validarContraMunicipio(empresa(), municipio({ possui_homologacao: null }));
    expect(r.vaiTestar).toBe(false);
  });

  it("falta de inscricao municipal barra o teste, com a mensagem do motivo", () => {
    const r = validarContraMunicipio(empresa({ inscricaoMunicipal: null }), municipio());
    expect(r.situacao).toBe("incompleto");
    expect(r.vaiTestar).toBe(false);
    expect(r.pendencias[0]).toMatch(/inscrição municipal/i);
  });

  it("CNAE so e cobrado onde o municipio o exige", () => {
    const semCnae = empresa({ cnae: null });
    expect(validarContraMunicipio(semCnae, municipio({ cnae_obrigatorio: true })).situacao)
      .toBe("incompleto");
    expect(validarContraMunicipio(semCnae, municipio({ cnae_obrigatorio: false })).situacao)
      .toBe("pronto_para_teste");
  });

  it("certificado so e cobrado onde o municipio o exige — ha municipios de login e senha", () => {
    const semCert = empresa({ certificadoValidoAte: null });
    expect(validarContraMunicipio(semCert, municipio({ requer_certificado: true })).situacao)
      .toBe("incompleto");
    expect(validarContraMunicipio(semCert, municipio({ requer_certificado: false })).situacao)
      .toBe("pronto_para_teste");
  });

  it("codigo tributario municipal obrigatorio e reconhecido como lacuna NOSSA", () => {
    const r = validarContraMunicipio(empresa(), municipio({ codigo_tributario_obrigatorio: true }));
    expect(r.situacao).toBe("incompleto");
    expect(r.pendencias[0]).toMatch(/ainda não coleta/i);
  });
});

describe("validarContraMunicipio — o que NAO barra, de proposito", () => {
  it("empresa completa em municipio com homologacao esta pronta", () => {
    const r = validarContraMunicipio(empresa(), municipio());
    expect(r.situacao).toBe("pronto_para_teste");
    expect(r.pendencias).toEqual([]);
    expect(r.vaiTestar).toBe(true);
  });

  it("obrigatoriedade DESCONHECIDA (null) nao cobra o campo", () => {
    // `null` e "nao sei", nao "nao exige". Barrar por ausencia de informacao
    // impediria emissao legitima; o custo do falso positivo e maior que o de um
    // credito gasto.
    const r = validarContraMunicipio(
      empresa({ cnae: null }),
      municipio({ cnae_obrigatorio: null, requer_certificado: null }),
    );
    expect(r.situacao).toBe("pronto_para_teste");
  });

  it("municipio fora do cache deixa seguir para o teste, avisando", () => {
    const r = validarContraMunicipio(empresa(), null);
    expect(r.vaiTestar).toBe(true);
    expect(r.pendencias[0]).toMatch(/mapa/i);
  });

  it("status ausente e tratado como ativo — falta de dado nao paralisa a carteira", () => {
    const r = validarContraMunicipio(empresa(), municipio({ status: null }));
    expect(r.situacao).toBe("pronto_para_teste");
  });
});

describe("ordem das verificacoes", () => {
  it("municipio impossivel aparece antes de qualquer pendencia cadastral", () => {
    // Mandar preencher CNAE de empresa que nunca vai emitir naquele municipio
    // e trabalho jogado fora.
    const r = validarContraMunicipio(
      empresa({ cnae: null, inscricaoMunicipal: null }),
      municipio({ nfse_habilitada: false, cnae_obrigatorio: true }),
    );
    expect(r.situacao).toBe("impossivel");
  });

  it("pendencia cadastral aparece antes da falta de homologacao", () => {
    // Corrigir o cadastro serve para produção também; "não há como testar" é a
    // última coisa a dizer, quando não sobrou mais nada a fazer.
    const r = validarContraMunicipio(
      empresa({ inscricaoMunicipal: null }),
      municipio({ possui_homologacao: false }),
    );
    expect(r.situacao).toBe("incompleto");
  });
});

describe("resumirCarteira", () => {
  it("conta cada situacao e preve APENAS os creditos que serao gastos", () => {
    const resultados = [
      validarContraMunicipio(empresa(), municipio()),
      validarContraMunicipio(empresa(), municipio()),
      validarContraMunicipio(empresa(), municipio({ nfse_habilitada: false })),
      validarContraMunicipio(empresa(), municipio({ possui_homologacao: false })),
      validarContraMunicipio(empresa({ inscricaoMunicipal: null }), municipio()),
      validarContraMunicipio(empresa(), municipio({ status: "pausado" })),
    ];

    const r = resumirCarteira(resultados);
    expect(r.prontoParaTeste).toBe(2);
    expect(r.impossivel).toBe(1);
    expect(r.semAmbienteDeTeste).toBe(1);
    expect(r.incompleto).toBe(1);
    expect(r.indisponivel).toBe(1);

    // 6 empresas, 2 tentativas. E o numero que o painel mostra antes de gastar.
    expect(r.creditosPrevistos).toBe(2);
  });

  it("carteira vazia nao preve credito nenhum", () => {
    expect(resumirCarteira([]).creditosPrevistos).toBe(0);
  });
});
