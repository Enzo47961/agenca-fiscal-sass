import { type FiscalProvider } from "../provider";
import { MockFiscalProvider } from "./mock";
import { FocusNfeProvider } from "./focusnfe";
import { focusNfeEnv } from "@/lib/env";

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
