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
const providers: Record<string, () => FiscalProvider> = {
  mock: () => new MockFiscalProvider(),
  focusnfe: () => new FocusNfeProvider(focusNfeEnv()),
  // nuvemfiscal: () => new NuvemFiscalProvider(), // TODO: implementar
};

export function resolverProvider(nome: string): FiscalProvider {
  const factory = providers[nome];
  if (!factory) {
    throw new Error(`Provider fiscal desconhecido: "${nome}"`);
  }
  return factory();
}
