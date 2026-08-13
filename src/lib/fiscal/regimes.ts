/**
 * Constantes de regime tributário compartilhadas entre servidor e cliente.
 *
 * Módulo puro de propósito: `services/empresas.ts` importa `node:crypto` e não
 * pode entrar no bundle do browser, mas o formulário de configurações precisa
 * da MESMA regra para decidir se mostra o campo. Duplicar a string nos dois
 * lados é como a validação e a tela divergem — a tela oferece o campo, o schema
 * recusa o valor, e o usuário só descobre depois de salvar.
 */

import { dataCivilBr } from "@/lib/data-br";

export const REGIMES_TRIBUTARIOS = [
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
  "mei",
] as const;

export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number];

// REGIME_COM_SIMPLES_POR_FORA foi removido junto com o booleano
// `simples_por_fora` (A6). A pergunta que ele respondia — "quem pode optar por
// apurar IBS/CBS pelo regime regular" — passou a ser respondida pelo par
// situação no Simples × regime de apuração, em `lib/fiscal/ibscbs.ts`. Uma
// constante sobrevivente ao campo que ela guardava só seria convite a
// reintroduzir o modelo antigo por engano.

/**
 * Regimes para os quais a obrigatoriedade do NBS é DUVIDOSA (item A7).
 *
 * DECISÃO DO USUÁRIO em 10/08/2026: o NBS continua **opcional para todos**, e
 * estes regimes recebem apenas um aviso na tela. As fontes divergem sobre a
 * exigência para Lucro Presumido/Real, e a base de conhecimento registra o
 * conflito sem resolvê-lo. Exigir o campo com base em fonte não confirmada
 * bloquearia emissão legítima de quem não tem o código em mãos — o erro caro,
 * porque impede o usuário de faturar. Avisar erra para o lado reversível.
 *
 * Isto NÃO é uma afirmação de que o NBS é exigido nesses regimes. É o registro
 * de onde a dúvida está concentrada, para que o aviso apareça onde importa.
 */
export const REGIMES_NBS_SOB_DUVIDA: readonly RegimeTributario[] = [
  "lucro_presumido",
  "lucro_real",
];

// ---------------------------------------------------------------------------
// JANELA DE OPÇÃO PELO REGIME DE APURAÇÃO DE IBS/CBS (item B5)
//
// O QUE ESTAVA ERRADO. O modelo anterior tinha uma única data — 30/09/2026 — e
// tratava a janela como "aberta desde sempre até lá". Consequência prática: em
// agosto de 2026 a tela dizia ao usuário que o prazo estava ABERTO e mostrava
// contagem regressiva, antes de a janela sequer existir. E, vencido o prazo, a
// tela dizia que acabou — quando ainda havia direito de arrependimento e, mais
// adiante, uma segunda janela.
//
// FONTE, e o nível dela importa. As três datas abaixo vêm do portal oficial do
// Simples Nacional (Receita Federal), na notícia "CGSN define prazos de opção
// pelo Simples Nacional e pelo regime regular do IBS e da CBS para 2027", que
// indica como fundamentação legal a **Resolução CGSN nº 186/2026, publicada em
// 17/04/2026**. Confirmadas em segunda página oficial (gov.br/receitafederal).
//
// NÃO consegui o texto da resolução no DOU — o portal `normas.receita` não a
// devolveu. Portanto:
//   - as DATAS estão implementadas, porque duas fontes oficiais as afirmam;
//   - os ARTIGOS não são citados aqui, porque não os li;
//   - a segunda janela é modelada como o MÊS de março/2027 inteiro, que é
//     literalmente o que a fonte diz ("no mês de março/2027"). Ela não informa
//     dias específicos, e inventá-los seria transformar inferência em regra.
//
// A regra de fundo continua sendo o art. 41, § 3º da LC 214/2025: quem não se
// manifestar PERMANECE no regime unificado. O silêncio tem efeito — é isso que
// a tela precisa dizer, e é por isso que o aviso existe.
// ---------------------------------------------------------------------------

/** Abertura da primeira janela. Antes disso não há o que comunicar. */
export const OPCAO_REGIME_ABERTURA = "2026-09-01";

/** Encerramento da primeira janela. Efeitos a partir de 01/01/2027. */
export const OPCAO_REGIME_ENCERRAMENTO = "2026-09-30";

/** Último dia para cancelar a opção feita em setembro. */
export const OPCAO_REGIME_LIMITE_ARREPENDIMENTO = "2026-11-30";

/** Segunda janela, com efeitos no 2º semestre de 2027. */
export const OPCAO_REGIME_SEGUNDA_ABERTURA = "2027-03-01";
export const OPCAO_REGIME_SEGUNDA_ENCERRAMENTO = "2027-03-31";

/**
 * Mantida por compatibilidade: era a única data do modelo antigo e ainda é o
 * encerramento da primeira janela. Prefira `janelaOpcaoRegime()`, que sabe
 * também quando a janela ABRE — a informação que faltava.
 */
export const PRAZO_OPCAO_REGIME_APURACAO = OPCAO_REGIME_ENCERRAMENTO;

/** Em que ponto do calendário de opção estamos. */
export type FaseOpcaoRegime =
  /** Antes de 01/09/2026: a janela ainda não abriu. */
  | "antes_da_abertura"
  /** 01–30/09/2026: dá para optar, com efeitos em 01/01/2027. */
  | "primeira_janela"
  /** 01/10–30/11/2026: não dá mais para optar, mas dá para cancelar. */
  | "arrependimento"
  /** 01/12/2026–28/02/2027: nada a fazer até março. */
  | "entre_janelas"
  /** Março/2027: nova oportunidade, com efeitos no 2º semestre de 2027. */
  | "segunda_janela"
  /** Depois de 31/03/2027: fora do que as fontes consultadas cobrem. */
  | "encerrada";

export interface JanelaOpcaoRegime {
  fase: FaseOpcaoRegime;
  /** `true` só quando dá para MANIFESTAR a opção agora. */
  aberta: boolean;
  /**
   * Dias até a próxima virada de fase (abertura, encerramento ou limite de
   * arrependimento). `null` quando não há próxima data conhecida.
   */
  diasAteProximaData: number | null;
  /** A data da virada acima, em AAAA-MM-DD. `null` na fase encerrada. */
  proximaData: string | null;
}

function diasEntre(de: string, ate: string): number {
  return Math.ceil((Date.parse(`${ate}T23:59:59Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/**
 * Fase atual da opção pelo regime de apuração.
 *
 * Usa a data CIVIL brasileira, não UTC: um prazo fiscal vence à meia-noite de
 * Brasília, e `toISOString()` faria o sistema considerar a janela encerrada
 * três horas antes para quem emite à noite.
 */
export function janelaOpcaoRegime(hoje: Date = new Date()): JanelaOpcaoRegime {
  const d = dataCivilBr(hoje);

  if (d < OPCAO_REGIME_ABERTURA) {
    return {
      fase: "antes_da_abertura",
      aberta: false,
      proximaData: OPCAO_REGIME_ABERTURA,
      diasAteProximaData: diasEntre(d, OPCAO_REGIME_ABERTURA),
    };
  }
  if (d <= OPCAO_REGIME_ENCERRAMENTO) {
    return {
      fase: "primeira_janela",
      aberta: true,
      proximaData: OPCAO_REGIME_ENCERRAMENTO,
      diasAteProximaData: diasEntre(d, OPCAO_REGIME_ENCERRAMENTO),
    };
  }
  if (d <= OPCAO_REGIME_LIMITE_ARREPENDIMENTO) {
    return {
      fase: "arrependimento",
      aberta: false,
      proximaData: OPCAO_REGIME_LIMITE_ARREPENDIMENTO,
      diasAteProximaData: diasEntre(d, OPCAO_REGIME_LIMITE_ARREPENDIMENTO),
    };
  }
  if (d < OPCAO_REGIME_SEGUNDA_ABERTURA) {
    return {
      fase: "entre_janelas",
      aberta: false,
      proximaData: OPCAO_REGIME_SEGUNDA_ABERTURA,
      diasAteProximaData: diasEntre(d, OPCAO_REGIME_SEGUNDA_ABERTURA),
    };
  }
  if (d <= OPCAO_REGIME_SEGUNDA_ENCERRAMENTO) {
    return {
      fase: "segunda_janela",
      aberta: true,
      proximaData: OPCAO_REGIME_SEGUNDA_ENCERRAMENTO,
      diasAteProximaData: diasEntre(d, OPCAO_REGIME_SEGUNDA_ENCERRAMENTO),
    };
  }
  return { fase: "encerrada", aberta: false, proximaData: null, diasAteProximaData: null };
}

/** `true` enquanto dá para MANIFESTAR a opção (não inclui arrependimento). */
export function prazoOpcaoAberto(hoje: Date = new Date()): boolean {
  return janelaOpcaoRegime(hoje).aberta;
}

/**
 * Dias até a próxima data relevante da opção. Zero quando não há próxima.
 *
 * Trocou de significado junto com o modelo: antes era "dias até 30/09", que
 * ficava negativo e sem sentido depois de vencido. Agora acompanha a fase.
 */
export function diasAtePrazoOpcao(hoje: Date = new Date()): number {
  return janelaOpcaoRegime(hoje).diasAteProximaData ?? 0;
}
