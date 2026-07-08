import { type FiscalProvider } from "../provider";
import { MockFiscalProvider } from "./mock";

/**
 * Registry de providers fiscais (regra 21 do CLAUDE.md).
 * O resto do sistema resolve o provider pelo nome salvo em empresas.provider_fiscal.
 */
const providers: Record<string, () => FiscalProvider> = {
  mock: () => new MockFiscalProvider(),
  // focusnfe: () => new FocusNfeProvider(),      // TODO: implementar
  // nuvemfiscal: () => new NuvemFiscalProvider(), // TODO: implementar
};

export function resolverProvider(nome: string): FiscalProvider {
  const factory = providers[nome];
  if (!factory) {
    throw new Error(`Provider fiscal desconhecido: "${nome}"`);
  }
  return factory();
}
