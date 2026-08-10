import { type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { EVENTO_EMISSAO_SOLICITADA } from "@/inngest/events";
import { type Database } from "@/types/database";
import {
  REGIME_IBSCBS,
  TIPO_AJUSTE_BASE,
  calcularBaseIbsCbs,
  calcularTributosReforma,
} from "@/lib/fiscal/reforma";
import { declaracaoIbsCbsSchema, validarDeclaracao } from "@/lib/fiscal/ibscbs";
import { carregarCClassTribConhecidos } from "./dominio-fiscal";

/**
 * Ponto de entrada da emissão (regra 5 do CLAUDE.md):
 * cria a nota como `pendente` e delega ao motor Inngest. NUNCA emite síncrono.
 * Recebe o client por parâmetro (regra 20) — em Server Actions, passar o
 * client de sessão do usuário (RLS ativa garante o tenant).
 */

export const solicitarEmissaoSchema = z.object({
  empresaId: z.string().uuid(),
  clienteId: z.string().uuid(),
  descricaoServico: z.string().min(1).max(2000),
  codigoServico: z.string().min(1),
  valorServicoCentavos: z.number().int().positive(),
  aliquotaIss: z.number().min(0).max(1),
  issRetido: z.boolean().default(false),
  competencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Reforma tributária (opcionais — default seguro para o modelo antigo)
  codigoNbs: z.string().min(1).max(30).nullish(),
  regimeIbsCbs: z.enum(REGIME_IBSCBS).default("padrao"),
  // Split payment: preenchidos só quando a liquidação retiver CBS/IBS na fonte
  valorLiquidoCentavos: z.number().int().nonnegative().nullish(),
  splitRetidoCentavos: z.number().int().nonnegative().nullish(),
  /**
   * Componentes da base de cálculo do IBS/CBS (NT SE/CGNFS-e 009/2026).
   *
   * Todos opcionais e com default zero: a nota mais simples — sem desconto,
   * sem ajuste, sem PIS/COFINS destacados — continua sendo um formulário de
   * quatro campos. Quem não informa nada cai na base = vServ − vISSQN, que é o
   * caso comum do prestador de serviço.
   */
  descontoIncondicionadoCentavos: z.number().int().nonnegative().default(0),
  ajusteBaseCentavos: z.number().int().nonnegative().default(0),
  tipoAjusteBase: z.enum(TIPO_AJUSTE_BASE).nullish(),
  /**
   * vISSQN. OMITIR é diferente de informar ZERO: omitido, o valor é derivado de
   * `(vServ − descIncond) × aliquotaIss`; zero explícito significa "não há ISSQN
   * a deduzir" e é respeitado como tal.
   */
  issqnCentavos: z.number().int().nonnegative().nullish(),
  pisCentavos: z.number().int().nonnegative().default(0),
  cofinsCentavos: z.number().int().nonnegative().default(0),
  /**
   * Grupo IBSCBS da DPS (CST, cClassTrib e subgrupos condicionais).
   * Opcional: não há data confirmada de obrigatoriedade de preenchimento do
   * grupo na NFS-e, então nota sem ele continua válida.
   */
  declaracaoIbsCbs: declaracaoIbsCbsSchema.nullish(),
  /**
   * C7 — confirmação de elegibilidade do regime diferenciado.
   *
   * `confirmadoPorUserId` NUNCA vem do formulário: a Server Action o preenche a
   * partir da sessão (regra 3). Um campo desses vindo do cliente permitiria
   * atribuir a confirmação a outra pessoa, que é o oposto de trilha de
   * auditoria.
   */
  confirmacaoRegimeDiferenciado: z.boolean().default(false),
  confirmadoPorUserId: z.string().uuid().nullish(),
})
  .superRefine((d, ctx) => {
    // Regime diferenciado sem confirmação é o estado que o C7 existe para
    // impedir. Isto NÃO valida elegibilidade — validar de verdade exige a
    // correlação atividade ↔ regime, que é decisão contábil e ainda não
    // existe. O que se barra aqui é a escolha feita sem que ninguém assuma.
    if (d.regimeIbsCbs === "padrao") return;

    if (!d.confirmacaoRegimeDiferenciado) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmacaoRegimeDiferenciado"],
        message:
          "Regime diferenciado exige confirmação explícita de que a atividade se " +
          "enquadra. A partir de 2027 o enquadramento indevido vira recolhimento a menor.",
      });
    }

    // Confirmação sem autor não serve de registro — e a coluna do banco recusa
    // a combinação de qualquer forma (chk_regime_diferenciado_confirmado).
    if (d.confirmacaoRegimeDiferenciado && !d.confirmadoPorUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmadoPorUserId"],
        message:
          "Confirmação de regime diferenciado sem usuário identificado. Isso é bug " +
          "de quem chamou: o id vem da sessão, nunca do formulário.",
      });
    }
  });

/**
 * Entrada de `solicitarEmissao` — o tipo de ENTRADA do schema, não o de saída.
 * A função faz o `parse()` internamente, então quem chama não precisa aplicar
 * os defaults (`issRetido`, `regimeIbsCbs`) antes: é o schema que aplica.
 */
export type SolicitarEmissaoInput = z.input<typeof solicitarEmissaoSchema>;

/** Já validada e com defaults aplicados — o que de fato vai para o banco. */
export type SolicitarEmissaoValidada = z.output<typeof solicitarEmissaoSchema>;

export async function solicitarEmissao(
  db: SupabaseClient<Database>,
  input: SolicitarEmissaoInput,
): Promise<{ notaId: string }> {
  const dados = solicitarEmissaoSchema.parse(input);

  // Grupo IBSCBS: validado AQUI, na criação, e não só na emissão.
  //
  // Por que aqui também: se a declaração só fosse conferida pelo provider, uma
  // nota com enquadramento inválido seria criada, entraria na máquina de
  // estados e só falharia minutos depois, no motor — com o usuário já fora da
  // tela. Validando na fronteira (regra 19), o erro volta enquanto ele ainda
  // está no formulário e nenhuma nota chega a existir.
  const declaracao = dados.declaracaoIbsCbs ?? null;
  if (declaracao) {
    const validacao = validarDeclaracao(declaracao, {
      cClassTribConhecidos: await carregarCClassTribConhecidos(db),
    });
    if (!validacao.valido) {
      throw new Error(`Grupo IBS/CBS inválido: ${validacao.erros.join("; ")}`);
    }
  }

  // Base de cálculo do IBS/CBS (B7) — a fórmula da NT-009, aplicada ANTES do
  // destaque. Antes daqui o sistema usava o valor BRUTO como base, o que
  // superestima o tributo destacado; em 2026 isso é um número errado na nota,
  // a partir de 2027 é recolhimento a maior.
  //
  // Erro aqui (base negativa, PIS/COFINS reivindicado depois de 2026, ajuste
  // sem tipo) sobe como exceção e nenhuma nota chega a ser criada — é a mesma
  // escolha da validação do grupo IBSCBS logo acima: falhar na fronteira, com
  // o usuário ainda no formulário.
  const base = calcularBaseIbsCbs({
    valorServicoCentavos: dados.valorServicoCentavos,
    descontoIncondicionadoCentavos: dados.descontoIncondicionadoCentavos,
    ajusteBaseCentavos: dados.ajusteBaseCentavos,
    tipoAjusteBase: dados.tipoAjusteBase ?? null,
    // `?? undefined` de propósito: `null` do formulário significa "não
    // informado" e precisa chegar como ausência para a derivação acontecer.
    issqnCentavos: dados.issqnCentavos ?? undefined,
    aliquotaIss: dados.aliquotaIss,
    pisCentavos: dados.pisCentavos,
    cofinsCentavos: dados.cofinsCentavos,
    competencia: dados.competencia,
  });

  // Destaque de CBS/IBS sobre o vBC — nunca sobre o bruto.
  const tributos = calcularTributosReforma({
    baseCentavos: base.baseCentavos,
    competencia: dados.competencia,
    regime: dados.regimeIbsCbs,
  });

  const { data: nota, error } = await db
    .from("notas_fiscais")
    .insert({
      empresa_id: dados.empresaId,
      cliente_id: dados.clienteId,
      descricao_servico: dados.descricaoServico,
      codigo_servico: dados.codigoServico,
      valor_servico_centavos: dados.valorServicoCentavos,
      aliquota_iss: dados.aliquotaIss,
      iss_retido: dados.issRetido,
      competencia: dados.competencia,
      codigo_nbs: dados.codigoNbs ?? null,
      regime_ibscbs: dados.regimeIbsCbs,
      cbs_aliquota: tributos.cbsAliquota,
      ibs_aliquota: tributos.ibsAliquota,
      cbs_valor_centavos: tributos.cbsValorCentavos,
      ibs_valor_centavos: tributos.ibsValorCentavos,
      valor_liquido_centavos: dados.valorLiquidoCentavos ?? null,
      split_retido_centavos: dados.splitRetidoCentavos ?? null,
      // Base do IBS/CBS: o resultado E cada termo que o produziu. Guardar só o
      // total tornaria impossível provar como ele foi obtido depois que a
      // fórmula ou os dados de entrada mudarem. `issqn_centavos` grava o valor
      // EFETIVAMENTE usado — derivado ou informado —, para que a base seja
      // reproduzível só com o que está nesta linha.
      // C7 — registro da confirmação de elegibilidade. Só existe fora do
      // regime padrão: gravar autor e data numa nota `padrao` inventaria uma
      // confirmação que ninguém deu, e poluiria a consulta de auditoria com
      // exatamente as linhas que não interessam a ela.
      //
      // O schema já garante que, fora do padrão, a confirmação existe e tem
      // autor; o CHECK do banco recusa a combinação de qualquer forma. O
      // `?? null` aqui é para o compilador, não para o caso real.
      regime_confirmado_por:
        dados.regimeIbsCbs === "padrao" ? null : (dados.confirmadoPorUserId ?? null),
      regime_confirmado_em: dados.regimeIbsCbs === "padrao" ? null : new Date().toISOString(),
      ibscbs_base_centavos: base.baseCentavos,
      desconto_incondicionado_centavos: base.descontoIncondicionadoCentavos,
      ajuste_base_centavos: base.ajusteBaseCentavos,
      ajuste_base_tipo: base.tipoAjusteBase,
      issqn_centavos: base.issqnCentavos,
      pis_centavos: base.pisCentavos,
      cofins_centavos: base.cofinsCentavos,
      // Grupo IBSCBS — os CHECKs e a FK composta do banco são a segunda
      // camada: mesmo que a validação acima falhe por bug, o insert é recusado.
      ibscbs_cst: declaracao?.cst ?? null,
      ibscbs_cclasstrib: declaracao?.cClassTrib ?? null,
      ibscbs_ccredpres: declaracao?.cCredPres ?? null,
      ibscbs_trib_reg_cst: declaracao?.tribRegular?.cstRegular ?? null,
      ibscbs_trib_reg_cclasstrib: declaracao?.tribRegular?.cClassTribRegular ?? null,
      ibscbs_dif_perc_uf: declaracao?.diferimento?.percentualUf ?? null,
      ibscbs_dif_perc_mun: declaracao?.diferimento?.percentualMun ?? null,
      ibscbs_dif_perc_cbs: declaracao?.diferimento?.percentualCbs ?? null,
      status: "pendente",
    })
    .select("id, empresa_id")
    .single();

  if (error || !nota) {
    throw new Error(`Falha ao criar nota: ${error?.message}`);
  }

  await inngest.send({
    name: EVENTO_EMISSAO_SOLICITADA,
    data: { notaId: nota.id, empresaId: nota.empresa_id },
  });

  return { notaId: nota.id };
}

/**
 * Reprocessamento manual de nota falhada: falhou → pendente (zera ciclo)
 * e dispara novo evento para o motor.
 */
export async function reprocessarNota(
  db: SupabaseClient<Database>,
  params: { notaId: string; empresaId: string },
): Promise<void> {
  const { error } = await db.rpc("transicionar_status_nota", {
    p_nota_id: params.notaId,
    p_novo_status: "pendente",
  });
  if (error) {
    throw new Error(`Não foi possível reprocessar: ${error.message}`);
  }

  await inngest.send({
    name: EVENTO_EMISSAO_SOLICITADA,
    data: { notaId: params.notaId, empresaId: params.empresaId },
  });
}
