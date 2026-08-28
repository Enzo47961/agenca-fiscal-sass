import { type EmitirNfseInput } from "@/lib/fiscal/provider";

/**
 * A NOTA DE TESTE — como ela é montada, e por que assim.
 *
 * O teste existe porque o provedor não tem endpoint que diga o que falta na
 * configuração de uma empresa. A recomendação oficial dele é literal: *"efetuar
 * um teste de emissão e conferir o retorno da API"*.
 *
 * O QUE ESTE TESTE PRECISA PROVAR é que a empresa está apta a emitir: existe no
 * provedor, tem credencial válida, e a prefeitura a reconhece. Tudo o mais no
 * payload é acessório — e todo acessório é uma chance de a nota ser recusada
 * por motivo que NÃO é o que estamos investigando.
 *
 * Daí as três decisões abaixo.
 *
 * 1. O CÓDIGO DE SERVIÇO É INFORMADO, NUNCA ADIVINHADO. Um código inventado que
 *    o município recuse produziria a pior resposta possível: "configuração com
 *    problema" quando o problema era o nosso chute. Como a função inteira existe
 *    para separar config boa de config ruim, um falso negativo aqui a destrói.
 *
 * 2. O TOMADOR É A PRÓPRIA EMPRESA. Precisamos de um CPF/CNPJ que o validador da
 *    prefeitura aceite; inventar um arrisca rejeição por documento inválido —
 *    outro falso negativo. O CNPJ da própria empresa já passou pelo nosso
 *    dígito verificador e existe de fato. E há um ganho que não é técnico: não
 *    inventamos dado de terceiro para testar, o que seria dado pessoal sem base
 *    legal (LGPD art. 7º) num ambiente que ninguém autorizou.
 *
 * 3. O VALOR É MÍNIMO. Um centavo. Homologação não tem efeito fiscal, mas valor
 *    alto num ambiente de teste polui relatório e assusta quem olha.
 *
 * Esta função é pura de propósito (regra 20): montar a nota é a parte que
 * precisa de teste; falar com o provedor é da função Inngest.
 */

export interface EmpresaParaTestar {
  cnpj: string;
  razaoSocial: string;
  inscricaoMunicipal: string | null;
  codigoMunicipioIbge: string;
  emailContato: string;
  codigoServicoTeste: string | null;
}

/** Um centavo: o menor valor que ainda é uma nota. */
export const VALOR_TESTE_CENTAVOS = 1;

/** Alíquota nominal do teste. Não é apuração — é preenchimento de campo. */
export const ALIQUOTA_TESTE = 0.02;

export class TesteNaoAplicavel extends Error {
  constructor(
    message: string,
    readonly motivo: "sem_codigo_servico" | "sem_inscricao_municipal",
  ) {
    super(message);
    this.name = "TesteNaoAplicavel";
  }
}

export function montarNotaDeTeste(
  empresa: EmpresaParaTestar,
  referenciaExterna: string,
  competencia: string,
): EmitirNfseInput {
  if (!empresa.codigoServicoTeste) {
    throw new TesteNaoAplicavel(
      "Informe o código de serviço (LC 116) desta empresa para poder testar a emissão. " +
        "Ele não é deduzido: um código errado seria recusado pela prefeitura e o resultado " +
        "pareceria problema de configuração, que é justamente o que o teste apura.",
      "sem_codigo_servico",
    );
  }
  if (!empresa.inscricaoMunicipal) {
    throw new TesteNaoAplicavel(
      "Esta empresa está sem inscrição municipal, exigida na emissão de NFS-e. " +
        "O teste seria recusado por isso, e não pelo que ele investiga.",
      "sem_inscricao_municipal",
    );
  }

  return {
    referenciaExterna,
    prestador: {
      cnpj: empresa.cnpj,
      inscricaoMunicipal: empresa.inscricaoMunicipal,
      codigoMunicipioIbge: empresa.codigoMunicipioIbge,
    },
    tomador: {
      // A própria empresa. Ver decisão 2 no cabeçalho.
      cpfCnpj: empresa.cnpj,
      nome: empresa.razaoSocial,
      email: null, // homologação não manda e-mail, e não há a quem mandar
      endereco: {},
    },
    servico: {
      descricao: "Teste de homologacao - validacao de configuracao fiscal",
      codigoServico: empresa.codigoServicoTeste,
      valorCentavos: VALOR_TESTE_CENTAVOS,
      aliquotaIss: ALIQUOTA_TESTE,
      issRetido: false,
      competencia,
      codigoNbs: null,
      // Grupo da reforma no MÍNIMO viável: regime padrão, sem declaração e sem
      // redução. Um centavo não produz tributo relevante, e declarar
      // enquadramento aqui seria afirmar algo sobre a empresa que o teste não
      // apura — e que, num teste, ninguém conferiu.
      reforma: {
        regime: "padrao",
        cbsAliquota: 0,
        ibsAliquota: 0,
        cbsValorCentavos: 0,
        ibsValorCentavos: 0,
        declaracao: null,
        intencao: null,
      },
    },
  };
}

export interface ResultadoDoTeste {
  ok: boolean;
  erro: string | null;
}

/**
 * Traduz o desfecho da tentativa no que vai para a coluna.
 *
 * NÃO tentamos classificar a MENSAGEM do provedor para adivinhar se a recusa
 * foi "de configuração" ou "de dado". Seria interpretação de texto livre que
 * muda sem aviso, e errar aqui daria ao usuário um diagnóstico confiante e
 * falso — pior que nenhum diagnóstico. A mensagem vai como veio, e quem lê
 * decide.
 */
export function resultadoDoTeste(desfecho:
  | { tipo: "emitida" }
  | { tipo: "recusada"; mensagem: string }): ResultadoDoTeste {
  return desfecho.tipo === "emitida"
    ? { ok: true, erro: null }
    : { ok: false, erro: desfecho.mensagem };
}
