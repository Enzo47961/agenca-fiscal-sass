import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { emitirNfse } from "@/inngest/functions/emitir-nfse";
import { cobrarExcedentes } from "@/inngest/functions/cobrar-excedentes";

/**
 * Endpoint único do Inngest (App Router).
 * Toda função nova DEVE ser registrada no array abaixo.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [emitirNfse, cobrarExcedentes],
});
