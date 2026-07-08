import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { emitirNfse } from "@/inngest/functions/emitir-nfse";

/**
 * Endpoint único do Inngest (App Router).
 * Toda função nova DEVE ser registrada no array abaixo.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [emitirNfse],
});
