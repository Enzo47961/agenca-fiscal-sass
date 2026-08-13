-- ============================================================================
-- RESGATE DE NOTAS PRESAS EM `reprocessando` (item B3 da auditoria de 12/08/2026)
--
-- O DEFEITO, provado no banco antes de escrever esta migration:
--
--   SELECT transicionar_status_nota('...','reprocessando');  -- ok
--   SELECT transicionar_status_nota('...','pendente');
--   ERROR:  Transição inválida: reprocessando -> pendente
--
-- `reprocessando -> pendente` não existia — e é exatamente o que o botão
-- "reprocessar" do usuário pede. Some-se a isso que `emitir-nfse` roda com
-- `retries: 0` (correto, regra 13): qualquer step que lance DEPOIS da transição
-- inicial mata a função. Queda do Inngest, deploy no meio da execução, falha do
-- banco dentro de `registrarTentativa`, erro em `gravar-emissao` — todos deixam
-- a nota parada em `reprocessando`. E não havia vigia: só duas funções Inngest
-- existiam, nenhuma reconciliadora.
--
-- Resultado: a nota ficava presa para sempre, sem saída automática NEM manual.
-- Só `service_role` no banco resolvia. Num produto vendido como "sua nota sai
-- mesmo quando a prefeitura cai", era a contradição mais cara do sistema.
--
-- POR QUE NÃO SIMPLESMENTE LIBERAR A TRANSIÇÃO. Porque `reprocessando` também é
-- o estado NORMAL de uma nota sendo processada agora — inclusive dormindo no
-- backoff de 5min/15min/1h. Liberar sem guarda deixaria o usuário empurrar de
-- volta para `pendente` uma nota que o motor ainda está tratando, disparando um
-- segundo evento para a mesma nota.
--
-- A GUARDA É TEMPORAL, e o limiar não é arbitrário: o ciclo completo de retry
-- soma 5min + 15min + 1h = 1h20 de espera, mais a duração das tentativas. Duas
-- horas sem qualquer atualização é, portanto, tempo que uma nota viva não passa
-- parada. Abaixo disso, a transição continua recusada.
--
-- Vale registrar o que já protegia mesmo se houvesse corrida: `emitir-nfse` usa
-- `concurrency: { key: event.data.notaId, limit: 1 }`, então dois eventos para
-- a mesma nota são serializados, não paralelizados; e a idempotência junto ao
-- provider vem de `referencia_externa` com `consultarPorReferencia()` antes de
-- reemitir. A guarda temporal é a terceira camada, não a única.
-- ============================================================================

CREATE OR REPLACE FUNCTION transicionar_status_nota(
  p_nota_id     UUID,
  p_novo_status nota_status,
  p_erro_codigo TEXT DEFAULT NULL,
  p_erro_msg    TEXT DEFAULT NULL
) RETURNS notas_fiscais
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nota     notas_fiscais;
  v_abandonada BOOLEAN;
BEGIN
  SELECT * INTO v_nota FROM notas_fiscais WHERE id = p_nota_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota % não encontrada', p_nota_id;
  END IF;

  -- Checagem de tenant (a correção do IDOR) — inalterada.
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM empresa_membros
      WHERE user_id = auth.uid() AND empresa_id = v_nota.empresa_id
    ) THEN
      RAISE EXCEPTION 'Acesso negado à nota %', p_nota_id;
    END IF;
  END IF;

  -- Uma nota é considerada ABANDONADA quando passou tempo demais sem qualquer
  -- atualização E não há retry agendado para o futuro. As duas condições juntas
  -- de propósito: `proxima_tentativa_em` no futuro significa que o motor está
  -- dormindo o backoff e voltará sozinho.
  v_abandonada :=
    v_nota.updated_at < now() - INTERVAL '2 hours'
    AND (v_nota.proxima_tentativa_em IS NULL OR v_nota.proxima_tentativa_em < now());

  IF NOT (
    (v_nota.status = 'pendente'      AND p_novo_status = 'reprocessando') OR
    (v_nota.status = 'reprocessando' AND p_novo_status IN ('emitida', 'falhou', 'reprocessando')) OR
    (v_nota.status = 'falhou'        AND p_novo_status = 'pendente') OR
    -- NOVO: resgate de nota abandonada.
    (v_nota.status = 'reprocessando' AND p_novo_status = 'pendente' AND v_abandonada)
  ) THEN
    -- Mensagem específica quando a recusa é só por tempo: sem isso o usuário lê
    -- "transição inválida" e conclui que o sistema não tem saída — que era
    -- verdade antes desta migration e deixou de ser.
    IF v_nota.status = 'reprocessando' AND p_novo_status = 'pendente' THEN
      RAISE EXCEPTION
        'Nota % ainda está sendo processada (última atualização em %). O reprocessamento manual só é liberado após 2 horas sem atividade.',
        p_nota_id, v_nota.updated_at;
    END IF;

    RAISE EXCEPTION 'Transição inválida: % -> % (nota %)', v_nota.status, p_novo_status, p_nota_id;
  END IF;

  UPDATE notas_fiscais SET
    status              = p_novo_status,
    ultimo_erro         = COALESCE(p_erro_msg, ultimo_erro),
    ultimo_erro_codigo  = COALESCE(p_erro_codigo, ultimo_erro_codigo),
    tentativas          = CASE WHEN p_novo_status = 'pendente' THEN 0 ELSE tentativas END,
    -- Volta para a fila limpa: retry agendado de uma execução morta não vale.
    proxima_tentativa_em = CASE WHEN p_novo_status = 'pendente' THEN NULL
                                ELSE proxima_tentativa_em END,
    falha_definitiva_em = CASE WHEN p_novo_status = 'pendente' THEN NULL
                               WHEN p_novo_status = 'falhou'   THEN now()
                               ELSE falha_definitiva_em END
  WHERE id = p_nota_id
  RETURNING * INTO v_nota;

  RETURN v_nota;
END;
$$;

COMMENT ON FUNCTION transicionar_status_nota IS
  'Máquina de estados de notas_fiscais (regra 6). Inclui o resgate '
  '`reprocessando -> pendente` para notas abandonadas há mais de 2 horas — '
  'ver migration 20260812160000.';

-- ----------------------------------------------------------------------------
-- Listagem das notas abandonadas, para o vigia.
--
-- Uma função em vez de o vigia montar o SELECT: o critério de "abandonada" tem
-- que ser UM só. Duplicado entre a máquina de estados e o vigia, os dois
-- divergem na primeira vez que alguém ajustar o limiar — e aí o vigia passa a
-- tentar resgatar notas que a função recusa, falhando em silêncio a cada hora.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notas_abandonadas(p_limite INT DEFAULT 50)
RETURNS TABLE (nota_id UUID, empresa_id UUID, atualizado_em TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.empresa_id, n.updated_at
  FROM notas_fiscais n
  WHERE n.status = 'reprocessando'
    AND n.updated_at < now() - INTERVAL '2 hours'
    AND (n.proxima_tentativa_em IS NULL OR n.proxima_tentativa_em < now())
  ORDER BY n.updated_at
  LIMIT GREATEST(p_limite, 0);
$$;

-- Só o motor. Um usuário logado não tem por que enumerar notas presas de todos
-- os tenants, e esta função não filtra por empresa de propósito — ela é a visão
-- global do vigia.
REVOKE ALL ON FUNCTION public.notas_abandonadas FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notas_abandonadas FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notas_abandonadas TO service_role;
