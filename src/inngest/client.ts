import { EventSchemas, Inngest } from "inngest";
import { type Events } from "./events";

/**
 * Instância única do cliente Inngest (regra 11 do CLAUDE.md).
 * Todos os eventos são tipados via src/inngest/events.ts.
 *
 * `INNGEST_EVENT_KEY` fica com a leitura implícita do SDK de propósito. Passá-la
 * daqui exigiria chamar `serverEnv()` no topo deste módulo — e ele é importado
 * por `services/notas.ts`, ou seja, por toda Server Action que cria nota. Uma
 * variável de ambiente faltando viraria erro no caminho da emissão, longe da
 * causa. A presença da chave é cobrada em `verificarChavesInngest()`, no route
 * handler, onde o custo é de boot e a mensagem aponta para o lugar certo.
 */
export const inngest = new Inngest({
  id: "agencia-fiscal-saas",
  schemas: new EventSchemas().fromRecord<Events>(),
});
