import { type FiscalProvider } from "../provider";
import { MockFiscalProvider } from "./mock";
import { FocusNfeProvider } from "./focusnfe";
import { focusNfeEnv, serverEnv } from "@/lib/env";

/**
 * Registry de providers fiscais (regra 21 do CLAUDE.md).
 * O resto do sistema resolve o provider pelo nome salvo em empresas.provider_fiscal.
 *
 * As factories são preguiçosas de propósito: só quem realmente usa a Focus NFe
 * exige as variáveis de ambiente dela — um tenant em `mock` não pode quebrar
 * porque FOCUSNFE_TOKEN não está definido.
 */
/**
 * Dependências que o CHAMADOR injeta. Existem para que o provider não precise
 * conhecer o banco: quem tem client Supabase é o motor Inngest (regra 2), e é
 * ele quem compõe. Todas opcionais — sem elas o provider funciona, só com
 * validação estrutural em vez de validação contra a tabela oficial.
 */
export interface DependenciasProvider {
  carregarCClassTribConhecidos?: () => Promise<ReadonlySet<string>>;
}

const providers: Record<string, (deps: DependenciasProvider) => FiscalProvider> = {
  mock: () => new MockFiscalProvider(),
  focusnfe: (deps) => new FocusNfeProvider({ ...focusNfeEnv(), ...deps }),
  // nuvemfiscal: () => new NuvemFiscalProvider(), // TODO: implementar
};

export function resolverProvider(nome: string, deps: DependenciasProvider = {}): FiscalProvider {
  const factory = providers[nome];
  if (!factory) {
    throw new Error(`Provider fiscal desconhecido: "${nome}"`);
  }
  return factory(deps);
}

/**
 * Metadados de um provider para a tela de configurações.
 *
 * `disponivel` é a informação que evita o pior desfecho possível aqui: deixar
 * o usuário escolher um provider que não tem credencial configurada. Se isso
 * passasse, a escolha seria salva sem erro e só quebraria mais tarde, dentro
 * do motor, com a nota já criada e o usuário fora da tela.
 */
export interface ProviderInfo {
  readonly nome: string;
  readonly rotulo: string;
  readonly descricao: string;
  /** true = não emite documento com validade jurídica. */
  readonly ehSimulacao: boolean;
  readonly disponivel: boolean;
  /** Por que não está disponível — mostrado ao usuário. */
  readonly motivoIndisponivel: string | null;
}

/**
 * Providers que o tenant pode escolher, com a disponibilidade avaliada AGORA
 * a partir do ambiente. Server-only: chama serverEnv().
 */
export function providersDisponiveis(): ProviderInfo[] {
  const env = serverEnv();

  return [
    {
      nome: "mock",
      rotulo: "Simulação (mock)",
      descricao:
        "Simula a prefeitura para testar o motor de retry. As notas recebem número fictício " +
        "e NÃO têm validade jurídica.",
      ehSimulacao: true,
      disponivel: true,
      motivoIndisponivel: null,
    },
    {
      nome: "focusnfe",
      rotulo: `Focus NFe (${env.FOCUSNFE_AMBIENTE})`,
      descricao:
        "Emissão real via Focus NFe. Em homologação as notas são válidas apenas para teste; " +
        "em produção têm validade jurídica.",
      ehSimulacao: env.FOCUSNFE_AMBIENTE === "homologacao",
      disponivel: Boolean(env.FOCUSNFE_TOKEN),
      motivoIndisponivel: env.FOCUSNFE_TOKEN
        ? null
        : "FOCUSNFE_TOKEN não está configurado nas variáveis de ambiente.",
    },
  ];
}

/** Nomes que podem ser gravados em `empresas.provider_fiscal` hoje. */
export function nomesDeProvidersDisponiveis(): string[] {
  return providersDisponiveis()
    .filter((p) => p.disponivel)
    .map((p) => p.nome);
}
