-- ============================================================================
-- MÁQUINA DE ESTADOS COM CANCELAMENTO
--
-- Continuação da 20260814140000, separada porque o Postgres não deixa usar um
-- valor de enum na transação que o criou.
--
-- TRANSIÇÕES ACRESCENTADAS
--
--   emitida    -> cancelando   pedido aceito, motor assume
--   cancelando -> cancelada    prefeitura confirmou
--   cancelando -> emitida      prefeitura RECUSOU — a nota continua válida
--   cancelando -> cancelando   retry agendado
--
-- A terceira é a que exige explicação. Recusa de cancelamento não é falha da
-- nota: ela foi emitida, vale, e continua valendo. Mandá-la para `falhou`
-- diria ao usuário que a nota não presta, quando o que não deu certo foi o
-- pedido de cancelar. Volta para `emitida`, com o motivo da recusa gravado.
--
-- `cancelada` é TERMINAL. Não há caminho de volta: nota cancelada na prefeitura
-- não "descancela", e oferecer a transição no banco seria criar um estado que a
-- realidade fiscal não tem.
--
-- O RESGATE DE NOTA PRESA vale para `cancelando` também. Se o motor morrer no
-- meio, a nota ficaria travada exatamente como acontecia com `reprocessando`
-- antes da 20260812160000 — mesmo defeito, mesma cura.
-- ============================================================================

CREATE OR REPLACE FUNCTION transicionar_status_nota(
  p_nota_id     UUID,
  p_novo_status nota_status,
  p_erro_codigo TEXT DEFAULT NULL,
  p_erro_msg    TEXT DEFAULT NULL
) RETURNS notas_fiscais
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nota       notas_fiscais;
  v_abandonada BOOLEAN;
BEGIN
  SELECT * INTO v_nota FROM notas_fiscais WHERE id = p_nota_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota % não encontrada', p_nota_id;
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM empresa_membros
      WHERE user_id = auth.uid() AND empresa_id = v_nota.empresa_id
    ) THEN
      RAISE EXCEPTION 'Acesso negado à nota %', p_nota_id;
    END IF;
  END IF;

  v_abandonada :=
    v_nota.updated_at < now() - INTERVAL '2 hours'
    AND (v_nota.proxima_tentativa_em IS NULL OR v_nota.proxima_tentativa_em < now());

  IF NOT (
    (v_nota.status = 'pendente'      AND p_novo_status = 'reprocessando') OR
    (v_nota.status = 'reprocessando' AND p_novo_status IN ('emitida', 'falhou', 'reprocessando')) OR
    (v_nota.status = 'falhou'        AND p_novo_status = 'pendente') OR
    (v_nota.status = 'reprocessando' AND p_novo_status = 'pendente' AND v_abandonada) OR
    -- Cancelamento
    (v_nota.status = 'emitida'    AND p_novo_status = 'cancelando') OR
    (v_nota.status = 'cancelando' AND p_novo_status IN ('cancelada', 'emitida', 'cancelando')) OR
    -- Resgate: cancelamento abandonado volta a `emitida`, que é a verdade —
    -- ninguém cancelou nada. O usuário pode pedir de novo.
    (v_nota.status = 'cancelando' AND p_novo_status = 'emitida' AND v_abandonada)
  ) THEN
    IF v_nota.status = 'reprocessando' AND p_novo_status = 'pendente' THEN
      RAISE EXCEPTION
        'Nota % ainda está sendo processada (última atualização em %). O reprocessamento manual só é liberado após 2 horas sem atividade.',
        p_nota_id, v_nota.updated_at;
    END IF;

    IF v_nota.status = 'cancelada' THEN
      RAISE EXCEPTION
        'Nota % já está cancelada. Cancelamento não se desfaz — emita uma nota nova.', p_nota_id;
    END IF;

    IF p_novo_status = 'cancelando' THEN
      RAISE EXCEPTION
        'Só nota emitida pode ser cancelada. A nota % está em "%".', p_nota_id, v_nota.status;
    END IF;

    RAISE EXCEPTION 'Transição inválida: % -> % (nota %)', v_nota.status, p_novo_status, p_nota_id;
  END IF;

  UPDATE notas_fiscais SET
    status              = p_novo_status,
    ultimo_erro         = COALESCE(p_erro_msg, ultimo_erro),
    ultimo_erro_codigo  = COALESCE(p_erro_codigo, ultimo_erro_codigo),
    tentativas          = CASE WHEN p_novo_status = 'pendente' THEN 0 ELSE tentativas END,
    proxima_tentativa_em = CASE WHEN p_novo_status IN ('pendente','cancelada') THEN NULL
                                ELSE proxima_tentativa_em END,
    cancelada_em        = CASE WHEN p_novo_status = 'cancelada' THEN now() ELSE cancelada_em END,
    falha_definitiva_em = CASE WHEN p_novo_status = 'pendente' THEN NULL
                               WHEN p_novo_status = 'falhou'   THEN now()
                               ELSE falha_definitiva_em END
  WHERE id = p_nota_id
  RETURNING * INTO v_nota;

  RETURN v_nota;
END;
$$;

-- ----------------------------------------------------------------------------
-- Solicitar cancelamento.
--
-- Função em vez de UPDATE direto pelo mesmo motivo de sempre: `authenticated`
-- não tem UPDATE em `notas_fiscais` (e não deve ter). Aqui também se grava a
-- justificativa e quem pediu — cancelamento é ato com responsável.
--
-- Papel: operador NÃO cancela. Emitir errado se corrige reemitindo; cancelar
-- desfaz documento fiscal e é decisão de quem responde pela empresa.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.solicitar_cancelamento(
  p_nota_id       UUID,
  p_justificativa TEXT
) RETURNS notas_fiscais
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nota  notas_fiscais;
  v_papel membro_papel;
BEGIN
  SELECT * INTO v_nota FROM notas_fiscais WHERE id = p_nota_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota não encontrada';
  END IF;

  IF auth.role() <> 'service_role' THEN
    SELECT papel INTO v_papel FROM empresa_membros
    WHERE user_id = auth.uid() AND empresa_id = v_nota.empresa_id;

    IF v_papel IS NULL THEN
      RAISE EXCEPTION 'Acesso negado à nota';
    END IF;
    IF v_papel = 'operador' THEN
      RAISE EXCEPTION 'Operador não cancela nota. Peça a um administrador da empresa';
    END IF;
  END IF;

  IF char_length(coalesce(p_justificativa,'')) < 15
     OR char_length(p_justificativa) > 255 THEN
    RAISE EXCEPTION
      'A justificativa deve ter de 15 a 255 caracteres (exigência do provedor fiscal). Informada: % caractere(s)',
      char_length(coalesce(p_justificativa,''));
  END IF;

  UPDATE notas_fiscais SET
    cancelamento_justificativa  = p_justificativa,
    cancelamento_solicitado_em  = now(),
    cancelamento_solicitado_por = auth.uid(),
    cancelamento_recusa         = NULL
  WHERE id = p_nota_id;

  -- A transição valida o estado de origem e lança se não for `emitida`.
  RETURN transicionar_status_nota(p_nota_id, 'cancelando');
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_cancelamento FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_cancelamento TO authenticated;

-- ----------------------------------------------------------------------------
-- O vigia de notas presas passa a enxergar `cancelando`.
--
-- DROP antes de recriar porque a assinatura muda: a função passa a devolver
-- também o `status`, e o vigia precisa dele para saber para onde devolver a
-- nota (`pendente` se estava reprocessando, `emitida` se estava cancelando).
-- `CREATE OR REPLACE` recusa mudança de tipo de retorno com
-- "cannot change return type of existing function".
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.notas_abandonadas(INT);

CREATE OR REPLACE FUNCTION public.notas_abandonadas(p_limite INT DEFAULT 50)
RETURNS TABLE (nota_id UUID, empresa_id UUID, atualizado_em TIMESTAMPTZ, status nota_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.empresa_id, n.updated_at, n.status
  FROM notas_fiscais n
  WHERE n.status IN ('reprocessando', 'cancelando')
    AND n.updated_at < now() - INTERVAL '2 hours'
    AND (n.proxima_tentativa_em IS NULL OR n.proxima_tentativa_em < now())
  ORDER BY n.updated_at
  LIMIT GREATEST(p_limite, 0);
$$;

REVOKE ALL ON FUNCTION public.notas_abandonadas FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notas_abandonadas TO service_role;
