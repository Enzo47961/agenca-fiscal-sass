import { type EmpresaNoProvider } from "@/lib/fiscal/provider";

/**
 * RECONCILIAÇÃO DA CARTEIRA COM O PROVEDOR FISCAL
 *
 * O problema que este módulo resolve é de segurança de dados, não de
 * conveniência: `POST /v2/empresas` cria uma empresa nova a cada chamada, e a
 * Focus não tem endpoint de lote nem chave de idempotência. Se um POST for
 * processado e a resposta se perder — timeout, deploy no meio, rede —, o nosso
 * lado não sabe se a empresa existe. Repetir cria DUPLICATA no provedor, que
 * não temos como desfazer sozinhos e que passa a competir pelo mesmo CNPJ.
 *
 * A saída é perguntar antes de escrever. A Focus lista as empresas paginadas de
 * 50 em 50, então conferir uma carteira de 600 custa 12 requisições contra as
 * 600 de um "cria e torce" — o que importa porque o token tem orçamento de 100
 * requisições por minuto, compartilhado com a emissão do dia.
 *
 * O ganho colateral é maior que o direto: com a reconciliação, rodar o job de
 * novo é seguro e barato. Ele deixa de ser operação de risco e vira rotina,
 * capaz de detectar divergência entre os dois lados antes que ela vire
 * problema na emissão.
 *
 * Este arquivo é DELIBERADAMENTE sem I/O (regra 20). Quem lê o banco e quem
 * fala com o provedor é a função Inngest; aqui fica só a decisão, que é a parte
 * que precisa de teste.
 */

export interface EmpresaParaSincronizar {
  id: string;
  cnpj: string;
  providerEmpresaId: string | null;
}

export interface PlanoDeSincronizacao {
  /**
   * Existem no provedor mas o id não estava do nosso lado. Acontece quando uma
   * resposta se perdeu, quando alguém cadastrou pelo painel da Focus, ou depois
   * de restaurar um backup nosso. Adotar o id é o que torna o job auto-curável.
   */
  adotar: Array<{ empresaId: string; providerEmpresaId: string }>;
  /** Não existem no provedor. Estas, e só estas, gastam um POST. */
  cadastrar: string[];
  /** Já tinham id e ele confere. Nada a fazer. */
  emDia: string[];
  /**
   * Tinham um id que NÃO existe mais no provedor. Não recadastramos por conta
   * própria: sumir do outro lado é anomalia, e criar uma empresa nova para um
   * CNPJ que talvez ainda exista lá sob outro id seria adivinhar.
   */
  divergentes: Array<{ empresaId: string; providerEmpresaIdAusente: string }>;
}

/** Só os dígitos: a Focus ignora formatação e nós comparamos os dois lados. */
function normalizar(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export function planejarSincronizacao(
  nossas: readonly EmpresaParaSincronizar[],
  noProvider: readonly EmpresaNoProvider[],
): PlanoDeSincronizacao {
  const porCnpj = new Map<string, string>();
  const idsConhecidos = new Set<string>();
  for (const e of noProvider) {
    porCnpj.set(normalizar(e.cnpj), e.providerEmpresaId);
    idsConhecidos.add(e.providerEmpresaId);
  }

  const plano: PlanoDeSincronizacao = {
    adotar: [],
    cadastrar: [],
    emDia: [],
    divergentes: [],
  };

  for (const nossa of nossas) {
    const noOutroLado = porCnpj.get(normalizar(nossa.cnpj));

    if (nossa.providerEmpresaId) {
      // O id que temos ainda vale? Confere contra a lista, não contra a
      // esperança. Um id órfão indica que algo mudou lá e merece olho humano.
      if (idsConhecidos.has(nossa.providerEmpresaId)) {
        plano.emDia.push(nossa.id);
      } else {
        plano.divergentes.push({
          empresaId: nossa.id,
          providerEmpresaIdAusente: nossa.providerEmpresaId,
        });
      }
      continue;
    }

    if (noOutroLado) {
      plano.adotar.push({ empresaId: nossa.id, providerEmpresaId: noOutroLado });
    } else {
      plano.cadastrar.push(nossa.id);
    }
  }

  return plano;
}

/** Quantas requisições o plano vai gastar no provedor. Alimenta o relatório. */
export function creditosDoPlano(plano: PlanoDeSincronizacao, paginasLidas: number): number {
  return paginasLidas + plano.cadastrar.length;
}
