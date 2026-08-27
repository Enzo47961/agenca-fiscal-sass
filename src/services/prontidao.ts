import { type Database } from "@/types/database";

/**
 * PRONTIDÃO PARA EMITIR — a guarda que roda antes de a nota existir.
 *
 * O PROBLEMA. Depois que o cadastro no provedor virou etapa própria (PR #14),
 * passou a existir um intervalo em que a empresa está no nosso banco, marcada
 * para emissão real, e ainda não existe do outro lado. Emitir nessa janela cria
 * a nota, manda para o motor e falha lá — longe de quem podia corrigir, com o
 * usuário já fora da tela e uma nota `falhou` na lista para explicar depois.
 *
 * Esta função move a descoberta para a fronteira, que é onde o resto do
 * `solicitarEmissao` já valida: o erro volta enquanto o usuário está no
 * formulário, e nenhuma nota chega a ser criada.
 *
 * O QUE ELA NÃO FAZ, E POR QUÊ ISSO IMPORTA MAIS QUE O QUE ELA FAZ
 *
 * Ela NÃO bloqueia por certificado ausente, e a tentação de bloquear é grande —
 * a maioria das prefeituras exige o A1, e sem ele a emissão falha. Duas razões
 * seguram a mão:
 *
 *   1. Existem municípios que autenticam por LOGIN E SENHA da prefeitura, não
 *      por certificado (confirmado pela Focus em 27/08/2026). Bloquear por
 *      ausência de A1 barraria emissão legítima nesses municípios.
 *   2. `certificado_valido_ate` só é preenchido quando o certificado passa por
 *      NÓS. Quem tiver subido o arquivo direto no painel do provedor emitiria
 *      normalmente, e nós barraríamos por não saber.
 *
 * Nos dois casos o custo do falso positivo — impedir quem PODE emitir — é maior
 * que o do falso negativo, que é uma nota recusada com a mensagem do provedor
 * dizendo exatamente o que falta. Onde não temos certeza, quem responde é o
 * provedor.
 *
 * Bloqueamos, então, só o que é CERTO: empresa que não existe no provedor, e
 * certificado que já venceu.
 */

type StatusNoProvedor = Database["public"]["Enums"]["provider_status"];

export interface ProntidaoDaEmpresa {
  providerFiscal: string;
  providerStatus: StatusNoProvedor;
  providerErro: string | null;
  certificadoValidoAte: string | null;
}

export interface Bloqueio {
  motivo: "nao_cadastrada" | "cadastro_em_andamento" | "cadastro_falhou" | "certificado_vencido";
  mensagem: string;
}

/** Providers que não falam com prefeitura — simulação não tem o que barrar. */
const SIMULACOES = new Set(["mock"]);

/**
 * @param hoje data CIVIL brasileira (yyyy-mm-dd), de `dataCivilBr()`.
 *   Comparar validade de certificado contra `new Date()` em UTC venceria o
 *   documento três horas antes no Brasil — é o mesmo defeito que o B4 corrigiu
 *   na competência, e ele não volta por aqui.
 */
export function avaliarProntidao(
  empresa: ProntidaoDaEmpresa,
  hoje: string,
): Bloqueio | null {
  // Simulação emite sempre: é como o produto é demonstrado, e a faixa de aviso
  // em tela já deixa claro que a nota não tem validade jurídica.
  if (SIMULACOES.has(empresa.providerFiscal)) return null;

  if (empresa.providerStatus === "cadastrando") {
    return {
      motivo: "cadastro_em_andamento",
      mensagem:
        "Esta empresa está sendo cadastrada no provedor fiscal agora. Aguarde alguns " +
        "minutos e tente de novo — o cadastro em lote respeita o limite de requisições " +
        "do provedor, então uma carteira grande leva um tempo.",
    };
  }

  if (empresa.providerStatus === "falhou") {
    return {
      motivo: "cadastro_falhou",
      mensagem:
        "O provedor fiscal recusou o cadastro desta empresa, então ela ainda não pode " +
        "emitir. Motivo informado por ele: " +
        (empresa.providerErro ?? "não detalhado") +
        " — corrija o dado e prepare a carteira novamente.",
    };
  }

  if (empresa.providerStatus !== "cadastrada") {
    return {
      motivo: "nao_cadastrada",
      mensagem:
        "Esta empresa ainda não está cadastrada no provedor fiscal e por isso a nota " +
        "seria recusada. Use “Preparar a carteira para emissão real”, em Importar " +
        "empresas, antes de emitir.",
    };
  }

  // Vencido é certeza de recusa, e a data de validade é dado que nós temos.
  if (empresa.certificadoValidoAte && empresa.certificadoValidoAte < hoje) {
    return {
      motivo: "certificado_vencido",
      mensagem:
        `O certificado digital desta empresa venceu em ${formatarBr(empresa.certificadoValidoAte)}. ` +
        "Envie o certificado novo em Configurações — a prefeitura recusa nota assinada " +
        "com certificado vencido.",
    };
  }

  return null;
}

function formatarBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}
