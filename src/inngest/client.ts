import { EventSchemas, Inngest } from "inngest";
import { type Events } from "./events";

/**
 * Instância única do cliente Inngest (regra 11 do CLAUDE.md).
 * Todos os eventos são tipados via src/inngest/events.ts.
 */
export const inngest = new Inngest({
  id: "agencia-fiscal-saas",
  schemas: new EventSchemas().fromRecord<Events>(),
});
