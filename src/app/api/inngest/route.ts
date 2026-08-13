import { serve } from "inngest/next";
import { type NextRequest } from "next/server";
import { inngest } from "@/inngest/client";
import { emitirNfse } from "@/inngest/functions/emitir-nfse";
import { cobrarExcedentes } from "@/inngest/functions/cobrar-excedentes";
import { resgatarNotasPresas } from "@/inngest/functions/resgatar-notas-presas";
import { vigiarFranquia } from "@/inngest/functions/vigiar-franquia";
import { inngestEnv, verificarChavesInngest } from "@/lib/env";

/**
 * Endpoint único do Inngest (App Router).
 * Toda função nova DEVE ser registrada no array abaixo.
 *
 * Este endpoint EXECUTA as funções — inclusive a máquina de estados da emissão.
 * A signing key é o que separa "o Inngest pediu" de "alguém pediu"; ver
 * `verificarChavesInngest` em lib/env.ts para o porquê de não confiarmos na
 * inferência de modo do SDK.
 */

/**
 * A verificação e o `serve()` são PREGUIÇOSOS de propósito.
 *
 * Na primeira tentativa isto rodava no topo do módulo, e o `npm run build`
 * quebrou em "Failed to collect page data for /api/inngest": o Next importa o
 * route handler durante o build para coletar metadados, e nesse momento
 * NODE_ENV já é "production" enquanto as variáveis de ambiente do runtime não
 * estão necessariamente presentes. Ou seja, a checagem certa no lugar errado
 * transformava ausência de chave em build quebrado, e não em endpoint recusado.
 *
 * Adiando para a primeira requisição, a verificação passa a valer sobre o
 * ambiente de EXECUÇÃO, que é o que interessa. O cache evita repetir o parse do
 * schema a cada chamada.
 */
let handlerCache: ReturnType<typeof serve> | null = null;

function obterHandler() {
  if (handlerCache) return handlerCache;

  const { signingKey, eventKey } = inngestEnv();
  verificarChavesInngest({
    signingKey,
    eventKey,
    ehProducao: process.env.NODE_ENV === "production",
  });

  handlerCache = serve({
    client: inngest,
    functions: [emitirNfse, cobrarExcedentes, resgatarNotasPresas, vigiarFranquia],
    // Explícito em vez de deixar o SDK ler do process.env: assim a origem da
    // chave é rastreável e passa pela validação do schema de ambiente (regra 4).
    signingKey,
  });
  return handlerCache;
}

// O segundo parâmetro (`res`) existe na assinatura do SDK por herança do
// Pages Router e é ignorado no App Router — daí o `undefined`.
export function GET(req: NextRequest) {
  return obterHandler().GET(req, undefined);
}

export function POST(req: NextRequest) {
  return obterHandler().POST(req, undefined);
}

export function PUT(req: NextRequest) {
  return obterHandler().PUT(req, undefined);
}
