import { z } from "zod";

/**
 * Fonte de verdade de TODOS os eventos do sistema (regra 11 do CLAUDE.md).
 * Nenhuma string de evento solta pelo código — importe as constantes daqui.
 */

export const EVENTO_EMISSAO_SOLICITADA = "nfse/emissao.solicitada" as const;
export const EVENTO_EMISSAO_CONCLUIDA = "nfse/emissao.concluida" as const;
export const EVENTO_EMISSAO_FALHOU = "nfse/emissao.falhou" as const;

export const emissaoSolicitadaSchema = z.object({
  notaId: z.string().uuid(),
  empresaId: z.string().uuid(),
});

export const emissaoConcluidaSchema = z.object({
  notaId: z.string().uuid(),
  empresaId: z.string().uuid(),
  numeroNfse: z.string(),
});

export const emissaoFalhouSchema = z.object({
  notaId: z.string().uuid(),
  empresaId: z.string().uuid(),
  erroCodigo: z.string().nullable(),
  erroMensagem: z.string(),
  tentativas: z.number().int().min(1),
});

export type EmissaoSolicitadaData = z.infer<typeof emissaoSolicitadaSchema>;
export type EmissaoConcluidaData = z.infer<typeof emissaoConcluidaSchema>;
export type EmissaoFalhouData = z.infer<typeof emissaoFalhouSchema>;

export type Events = {
  [EVENTO_EMISSAO_SOLICITADA]: { data: EmissaoSolicitadaData };
  [EVENTO_EMISSAO_CONCLUIDA]: { data: EmissaoConcluidaData };
  [EVENTO_EMISSAO_FALHOU]: { data: EmissaoFalhouData };
};
