import { z } from "zod";

/**
 * Fonte de verdade de TODOS os eventos do sistema (regra 11 do CLAUDE.md).
 * Nenhuma string de evento solta pelo código — importe as constantes daqui.
 */

export const EVENTO_EMISSAO_SOLICITADA = "nfse/emissao.solicitada" as const;
export const EVENTO_EMISSAO_CONCLUIDA = "nfse/emissao.concluida" as const;
export const EVENTO_EMISSAO_FALHOU = "nfse/emissao.falhou" as const;

export const EVENTO_SINCRONIZACAO_SOLICITADA = "empresa/sincronizacao.solicitada" as const;
export const EVENTO_CADASTRO_EMPRESA_SOLICITADO = "empresa/cadastro.solicitado" as const;
export const EVENTO_TESTE_EMISSAO_SOLICITADO = "empresa/teste-emissao.solicitado" as const;

export const EVENTO_CANCELAMENTO_SOLICITADO = "nfse/cancelamento.solicitado" as const;
export const EVENTO_CANCELAMENTO_CONCLUIDO = "nfse/cancelamento.concluido" as const;
export const EVENTO_CANCELAMENTO_RECUSADO = "nfse/cancelamento.recusado" as const;

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

/**
 * Sincroniza a carteira com o provedor fiscal.
 *
 * `empresaIds` vem SEMPRE derivado da sessao pela Server Action, nunca do
 * corpo da requisicao (regra 3): o job roda com o client admin, que ignora RLS,
 * entao aceitar id vindo do cliente permitiria mandar cadastrar empresa alheia.
 */
export const sincronizacaoSolicitadaSchema = z.object({
  empresaIds: z.array(z.string().uuid()).min(1).max(2000),
});

/** Uma empresa, um cadastro. Cada uma falha e tenta de novo por conta propria. */
export const cadastroEmpresaSolicitadoSchema = z.object({
  empresaId: z.string().uuid(),
});

/** Teste de emissao em homologacao, uma empresa por execucao. */
export const testeEmissaoSolicitadoSchema = z.object({
  empresaId: z.string().uuid(),
});

export const cancelamentoSolicitadoSchema = z.object({
  notaId: z.string().uuid(),
  empresaId: z.string().uuid(),
});

export const cancelamentoConcluidoSchema = z.object({
  notaId: z.string().uuid(),
  empresaId: z.string().uuid(),
});

/**
 * Recusa do cancelamento. A nota VOLTA a `emitida` e continua valida — o evento
 * carrega o motivo porque, quando ele e prazo vencido, e a unica explicacao que
 * o usuario tem para o que fazer em seguida.
 */
export const cancelamentoRecusadoSchema = z.object({
  notaId: z.string().uuid(),
  empresaId: z.string().uuid(),
  motivo: z.string(),
});

export type SincronizacaoSolicitadaData = z.infer<typeof sincronizacaoSolicitadaSchema>;
export type CadastroEmpresaSolicitadoData = z.infer<typeof cadastroEmpresaSolicitadoSchema>;
export type TesteEmissaoSolicitadoData = z.infer<typeof testeEmissaoSolicitadoSchema>;

export type CancelamentoSolicitadoData = z.infer<typeof cancelamentoSolicitadoSchema>;
export type CancelamentoConcluidoData = z.infer<typeof cancelamentoConcluidoSchema>;
export type CancelamentoRecusadoData = z.infer<typeof cancelamentoRecusadoSchema>;

export type EmissaoSolicitadaData = z.infer<typeof emissaoSolicitadaSchema>;
export type EmissaoConcluidaData = z.infer<typeof emissaoConcluidaSchema>;
export type EmissaoFalhouData = z.infer<typeof emissaoFalhouSchema>;

export type Events = {
  [EVENTO_EMISSAO_SOLICITADA]: { data: EmissaoSolicitadaData };
  [EVENTO_EMISSAO_CONCLUIDA]: { data: EmissaoConcluidaData };
  [EVENTO_EMISSAO_FALHOU]: { data: EmissaoFalhouData };
  [EVENTO_CANCELAMENTO_SOLICITADO]: { data: CancelamentoSolicitadoData };
  [EVENTO_CANCELAMENTO_CONCLUIDO]: { data: CancelamentoConcluidoData };
  [EVENTO_CANCELAMENTO_RECUSADO]: { data: CancelamentoRecusadoData };
  [EVENTO_SINCRONIZACAO_SOLICITADA]: { data: SincronizacaoSolicitadaData };
  [EVENTO_CADASTRO_EMPRESA_SOLICITADO]: { data: CadastroEmpresaSolicitadoData };
  [EVENTO_TESTE_EMISSAO_SOLICITADO]: { data: TesteEmissaoSolicitadoData };
};
