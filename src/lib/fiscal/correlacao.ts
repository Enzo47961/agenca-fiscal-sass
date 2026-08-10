/**
 * CORRELAÇÃO OFICIAL item da LC 116 → cClassTrib.
 *
 * FONTE: Anexo VIII V1.01.00 (NT 008) do portal da NFS-e —
 * `AnexoVIII-CorrelacaoItemNBSIndOpcClassTrib_IBSCBS`. A planilha correlaciona
 * cada item da lista de serviços da LC 116/2003 com os cClassTrib possíveis.
 * Persistida em `item_lc116_cclasstrib` pela migration 20260810160000.
 *
 * A DISTINÇÃO QUE ORGANIZA ESTE MÓDULO — e que veio da pesquisa normativa, não
 * de opinião:
 *
 *   correlação  = qual código se relaciona àquele SERVIÇO. É regra técnica,
 *                 publicada, rastreável ao Anexo VIII.
 *   elegibilidade = se AQUELE contribuinte pode usar aquele código. Depende de
 *                 enquadramento (setor, certificação, natureza do adquirente) e
 *                 o sistema não tem como determinar sozinho.
 *
 * Confundir as duas é o erro que este módulo existe para evitar. A existência
 * de um cClassTrib na correlação NÃO prova que a empresa pode usá-lo.
 */

/** Uma opção de cClassTrib para um item, com o que a tabela oficial diz dela. */
export interface OpcaoCClassTrib {
  codigo: string;
  cst: string;
  /** Texto integral da fonte — é por ele que o usuário escolhe. */
  descricaoOficial: string;
  /** Frações (0.6 = 60%), como o banco guarda. */
  percReducaoIbs: number;
  percReducaoCbs: number;
  /** `exigeGrupoTributacaoRegular` — RN 166/167 do Anexo VI (E1583/E1584). */
  exigeTribRegular: boolean;
  permiteCredPres: boolean;
  artigoLc214: string | null;
  urlLegislacao: string | null;
}

/**
 * - `automatica`   → o sistema preenche sozinho, sem perguntar (categoria A).
 * - `confirmacao`  → oferece as opções oficiais e exige confirmação (B).
 * - `sem_correlacao` → o Anexo VIII não correlaciona nada; escolha explícita (C).
 */
export type CategoriaCorrelacao = "automatica" | "confirmacao" | "sem_correlacao";

export interface CorrelacaoItem {
  itemLc116: string;
  categoria: CategoriaCorrelacao;
  opcoes: readonly OpcaoCClassTrib[];
  /** Preenchido só quando `categoria === "automatica"`. */
  automatica: OpcaoCClassTrib | null;
  /** Por que caiu nesta categoria — vai para a tela, não é só log. */
  motivo: string;
}

/**
 * Único código que o sistema preenche sem perguntar.
 *
 * `000001` é "Situações tributadas integralmente pelo IBS e CBS" — a regra
 * geral do art. 4º da LC 214/2025. Três propriedades o tornam seguro para
 * automação, e as três precisam valer juntas:
 *
 *   1. É a tributação CHEIA. Preenchê-lo não reivindica benefício nenhum, então
 *      não há risco de recolhimento a menor — o erro possível é o contribuinte
 *      pagar mais do que devia, que é reversível e visível.
 *   2. Não tem redução, então não há percentual para divergir e cair nas
 *      rejeições E1543/E1547/E1552 (RN 104/111/118 do Anexo VI).
 *   3. Não exige grupo condicional (`gTribRegular`, `cCredPres`), então não
 *      arrasta campos que o sistema teria de inventar.
 *
 * Qualquer outro código — inclusive os `8200xx`, que o Anexo VIII correlaciona
 * a itens específicos — pressupõe que o emitente esteja num regime específico.
 * Correlação não é elegibilidade.
 */
export const CCLASSTRIB_TRIBUTACAO_INTEGRAL = "000001";

/** CST correspondente: os 3 primeiros dígitos do cClassTrib são o CST. */
export const CST_TRIBUTACAO_INTEGRAL = "000";

function seguroParaAutomacao(o: OpcaoCClassTrib): boolean {
  return (
    o.codigo === CCLASSTRIB_TRIBUTACAO_INTEGRAL &&
    o.percReducaoIbs === 0 &&
    o.percReducaoCbs === 0 &&
    !o.exigeTribRegular &&
    !o.permiteCredPres
  );
}

/**
 * Classifica um item a partir das opções que a correlação oficial devolveu.
 *
 * Função pura: recebe as linhas já lidas do banco e não sabe de onde vieram.
 */
export function classificarCorrelacao(
  itemLc116: string,
  opcoes: readonly OpcaoCClassTrib[],
): CorrelacaoItem {
  if (opcoes.length === 0) {
    return {
      itemLc116,
      categoria: "sem_correlacao",
      opcoes: [],
      automatica: null,
      motivo:
        `O Anexo VIII não correlaciona nenhum cClassTrib ao item ${itemLc116}. ` +
        "Não há código a sugerir — a escolha precisa ser feita por quem conhece a operação.",
    };
  }

  if (opcoes.length === 1 && seguroParaAutomacao(opcoes[0]!)) {
    return {
      itemLc116,
      categoria: "automatica",
      opcoes,
      automatica: opcoes[0]!,
      motivo:
        `O Anexo VIII correlaciona um único código ao item ${itemLc116}: ` +
        `${CCLASSTRIB_TRIBUTACAO_INTEGRAL}, tributação integral. Sem redução e sem ` +
        "grupo condicional, é preenchido automaticamente.",
    };
  }

  const comReducao = opcoes.filter((o) => o.percReducaoIbs > 0 || o.percReducaoCbs > 0);
  const motivo =
    opcoes.length > 1
      ? `O Anexo VIII correlaciona ${opcoes.length} códigos ao item ${itemLc116}. ` +
        "Qual se aplica depende da operação e do enquadramento — escolha e confirme."
      : `O único código correlacionado ao item ${itemLc116} (${opcoes[0]!.codigo}) ` +
        (comReducao.length
          ? "tem redução de alíquota, que pressupõe enquadramento setorial."
          : "pressupõe regime específico do emitente.") +
        " Correlação não é elegibilidade: confirme que se aplica a você.";

  return { itemLc116, categoria: "confirmacao", opcoes, automatica: null, motivo };
}

/**
 * Normaliza o código de serviço para a chave do Anexo VIII (`NN.NN`).
 *
 * O formulário aceita "0105", "01,05" e "01.05"; a planilha usa ponto e dois
 * dígitos de cada lado. Subitens de três níveis (99.01.01) passam intactos.
 */
export function chaveItemLc116(codigoServico: string): string {
  const limpo = codigoServico.trim().replace(/,/g, ".");
  if (/^\d{4}$/.test(limpo)) return `${limpo.slice(0, 2)}.${limpo.slice(2)}`;
  return limpo;
}
