import { type Database } from "@/types/database";

/**
 * VALIDAÇÃO LOCAL CONTRA AS REGRAS DO MUNICÍPIO — custo zero em créditos.
 *
 * A Focus foi explícita em 27/08/2026: não há endpoint que diga o que falta na
 * configuração de uma empresa, e a forma de descobrir é *"efetuar um teste de
 * emissão e conferir o retorno da API"*. Cada teste desses gasta um crédito de
 * um orçamento de 100 por minuto, compartilhado com a emissão do dia.
 *
 * Só que boa parte do que faria o teste falhar já é conhecida ANTES dele: o
 * mapa de municípios diz quais campos aquele município exige, e nós sabemos
 * quais deles a empresa preencheu. Conferir isso aqui converte uma tentativa
 * desperdiçada numa mensagem imediata — e, numa carteira de 600, a diferença
 * entre gastar 600 créditos para descobrir o óbvio e gastar só onde há dúvida
 * real.
 *
 * A HIERARQUIA DAS RESPOSTAS importa e está codificada na ordem abaixo:
 *
 *   1. IMPOSSÍVEL   — o município não emite NFS-e pela API. Nada a fazer.
 *   2. INDISPONÍVEL — está fora do ar agora. Tentar é desperdício garantido.
 *   3. INCOMPLETO   — falta dado que aquele município exige. Corrigível.
 *   4. SEM TESTE    — está tudo certo, mas o município não tem homologação.
 *   5. PRONTO       — dá para testar.
 *
 * `null` NUNCA VIRA `false`. Quando o provedor não informa se um campo é
 * obrigatório, ele não é cobrado aqui: barrar por ausência de informação
 * impediria emissão legítima, e o custo do falso positivo continua sendo maior
 * que o do falso negativo — que é, no pior caso, um crédito gasto.
 */

type MunicipioRow = Database["public"]["Tables"]["municipios_nfse"]["Row"];

export interface DadosDaEmpresaParaValidar {
  cnpj: string;
  inscricaoMunicipal: string | null;
  cnae: string | null;
  codigoMunicipioIbge: string;
  certificadoValidoAte: string | null;
}

export type Situacao =
  | "impossivel"
  | "indisponivel"
  | "incompleto"
  | "sem_ambiente_de_teste"
  | "pronto_para_teste";

export interface ResultadoValidacao {
  situacao: Situacao;
  /** O que impede, em linguagem de quem vai corrigir. Vazio quando pronto. */
  pendencias: string[];
  /** Só faz sentido gastar um crédito de emissão quando isto é verdadeiro. */
  vaiTestar: boolean;
}

export function validarContraMunicipio(
  empresa: DadosDaEmpresaParaValidar,
  municipio: MunicipioRow | null,
): ResultadoValidacao {
  // Município fora do cache não é veredito: é ignorância nossa. Deixa seguir
  // para o teste, que é justamente o que resolve a dúvida.
  if (!municipio) {
    return {
      situacao: "pronto_para_teste",
      pendencias: [
        "Município ainda não está no mapa de regras — sincronize o mapa para uma " +
          "verificação melhor antes de testar.",
      ],
      vaiTestar: true,
    };
  }

  const onde = `${municipio.nome}/${municipio.uf}`;

  // 1. IMPOSSÍVEL
  if (!municipio.nfse_habilitada) {
    return {
      situacao: "impossivel",
      pendencias: [
        `${onde} não tem emissão de NFS-e integrada ao provedor fiscal. Esta empresa ` +
          "não conseguirá emitir por aqui enquanto isso não mudar.",
      ],
      vaiTestar: false,
    };
  }

  // 2. INDISPONÍVEL — o provedor usa texto livre, então a comparação é frouxa
  // de propósito: reconhecer "ativo" é mais seguro que tentar enumerar todas as
  // formas de dizer que algo está quebrado.
  const ativo = (municipio.status ?? "ativo").toLowerCase().includes("ativo");
  if (!ativo) {
    const previsao = municipio.previsao_reimplementacao
      ? ` Previsão de normalização: ${municipio.previsao_reimplementacao}.`
      : "";
    return {
      situacao: "indisponivel",
      pendencias: [
        `A emissão em ${onde} está com status “${municipio.status}” no provedor.` + previsao,
      ],
      vaiTestar: false,
    };
  }

  // 3. INCOMPLETO — só cobra o que o município declaradamente exige.
  const pendencias: string[] = [];

  if (!empresa.inscricaoMunicipal) {
    pendencias.push(
      "Falta a inscrição municipal, exigida no cadastro junto ao provedor fiscal.",
    );
  }
  if (municipio.cnae_obrigatorio === true && !empresa.cnae) {
    pendencias.push(`${onde} exige o CNAE da empresa, e ele não está preenchido.`);
  }
  if (municipio.requer_certificado === true && !empresa.certificadoValidoAte) {
    pendencias.push(
      `${onde} exige certificado digital A1, e nenhum foi enviado para esta empresa.`,
    );
  }
  if (municipio.codigo_tributario_obrigatorio === true) {
    pendencias.push(
      `${onde} exige código tributário municipal na nota — campo que o sistema ainda ` +
        "não coleta. A emissão para esta empresa depende dessa implementação.",
    );
  }

  if (pendencias.length > 0) {
    return { situacao: "incompleto", pendencias, vaiTestar: false };
  }

  // 4. SEM AMBIENTE DE TESTE
  if (municipio.possui_homologacao !== true) {
    return {
      situacao: "sem_ambiente_de_teste",
      pendencias: [
        `${onde} não tem ambiente de homologação disponível. A configuração desta ` +
          "empresa só pode ser validada emitindo em produção, o que gera documento " +
          "fiscal com validade jurídica — decisão do contribuinte, não do sistema.",
      ],
      vaiTestar: false,
    };
  }

  // 5. PRONTO
  return { situacao: "pronto_para_teste", pendencias: [], vaiTestar: true };
}

export interface ResumoDaCarteira {
  impossivel: number;
  indisponivel: number;
  incompleto: number;
  semAmbienteDeTeste: number;
  prontoParaTeste: number;
  /** Créditos que a rodada de testes vai consumir. É o número que se evita. */
  creditosPrevistos: number;
}

export function resumirCarteira(resultados: readonly ResultadoValidacao[]): ResumoDaCarteira {
  const r: ResumoDaCarteira = {
    impossivel: 0,
    indisponivel: 0,
    incompleto: 0,
    semAmbienteDeTeste: 0,
    prontoParaTeste: 0,
    creditosPrevistos: 0,
  };
  for (const item of resultados) {
    if (item.situacao === "impossivel") r.impossivel++;
    else if (item.situacao === "indisponivel") r.indisponivel++;
    else if (item.situacao === "incompleto") r.incompleto++;
    else if (item.situacao === "sem_ambiente_de_teste") r.semAmbienteDeTeste++;
    else r.prontoParaTeste++;
    if (item.vaiTestar) r.creditosPrevistos++;
  }
  return r;
}
