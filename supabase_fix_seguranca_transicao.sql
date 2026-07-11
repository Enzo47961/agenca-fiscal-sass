-- ============================================================================
-- FIX DE SEGURANÇA: transicionar_status_nota não validava tenant.
-- Rodar UMA VEZ no Supabase Dashboard → SQL Editor do projeto CORRETO
-- (spxiaucinjsgbipaormf) — NÃO no outro projeto Supabase da conta.
--
-- Problema: a função é SECURITY DEFINER e só validava a máquina de estados,
-- nunca se quem chamou tinha acesso à empresa dona da nota. Como nenhuma
-- migration tinha REVOKE/GRANT explícito, o Postgres deixa EXECUTE liberado
-- para PUBLIC por padrão — ou seja, até uma chamada anônima (anon key) podia
-- transicionar o status de nota de QUALQUER empresa via /rpc/transicionar_status_nota.
--
-- Fix: dentro da função, se quem chama não é o motor interno (service_role),
-- exige autenticação E que a nota pertença a uma empresa do usuário logado.
-- ============================================================================

CREATE OR REPLACE FUNCTION transicionar_status_nota(
  p_nota_id     UUID,
  p_novo_status nota_status,
  p_erro_codigo TEXT DEFAULT NULL,
  p_erro_msg    TEXT DEFAULT NULL
) RETURNS notas_fiscais
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nota notas_fiscais;
BEGIN
  SELECT * INTO v_nota FROM notas_fiscais WHERE id = p_nota_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota % não encontrada', p_nota_id;
  END IF;

  -- NOVO: só o motor interno (service_role, usado pelo Inngest) passa livre.
  -- Qualquer outra chamada (usuário logado ou anônimo) precisa pertencer à empresa da nota.
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM empresa_membros
      WHERE user_id = auth.uid() AND empresa_id = v_nota.empresa_id
    ) THEN
      RAISE EXCEPTION 'Acesso negado à nota %', p_nota_id;
    END IF;
  END IF;

  -- Transições válidas (regra 6 do CLAUDE.md) — inalterado
  IF NOT (
    (v_nota.status = 'pendente'      AND p_novo_status = 'reprocessando') OR
    (v_nota.status = 'reprocessando' AND p_novo_status IN ('emitida', 'falhou', 'reprocessando')) OR
    (v_nota.status = 'falhou'        AND p_novo_status = 'pendente')
  ) THEN
    RAISE EXCEPTION 'Transição inválida: % -> % (nota %)', v_nota.status, p_novo_status, p_nota_id;
  END IF;

  UPDATE notas_fiscais SET
    status              = p_novo_status,
    ultimo_erro         = COALESCE(p_erro_msg, ultimo_erro),
    ultimo_erro_codigo  = COALESCE(p_erro_codigo, ultimo_erro_codigo),
    tentativas          = CASE WHEN p_novo_status = 'pendente' THEN 0 ELSE tentativas END,
    falha_definitiva_em = CASE WHEN p_novo_status = 'pendente' THEN NULL
                               WHEN p_novo_status = 'falhou'   THEN now()
                               ELSE falha_definitiva_em END
  WHERE id = p_nota_id
  RETURNING * INTO v_nota;

  RETURN v_nota;
END;
$$;

-- Trava explícita de quem pode chamar via RPC (defesa em profundidade,
-- além da checagem interna acima).
REVOKE ALL ON FUNCTION transicionar_status_nota FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transicionar_status_nota TO authenticated, service_role;

-- Mesma trava para o helper usado pelas policies de RLS.
REVOKE ALL ON FUNCTION empresas_do_usuario FROM PUBLIC;
GRANT EXECUTE ON FUNCTION empresas_do_usuario TO authenticated, service_role;

-- No Supabase, anon/authenticated recebem EXECUTE por default privileges
-- diretas — REVOKE ... FROM PUBLIC sozinho não remove o grant direto do
-- anon (revisão do Fable 5). Fecha o aviso do advisor de segurança:
REVOKE EXECUTE ON FUNCTION transicionar_status_nota FROM anon;
REVOKE EXECUTE ON FUNCTION empresas_do_usuario FROM anon;
REVOKE EXECUTE ON FUNCTION criar_minha_empresa FROM anon;

-- search_path explícito no trigger de updated_at (boa prática, evita
-- sequestro de search_path em funções sem schema fixo).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- BUCKET "certificados" — usado por salvarCertificadoA1() (src/services/empresas.ts)
-- para guardar o certificado A1 criptografado. Ainda não existe neste projeto
-- (só foi criado por engano no projeto Supabase errado).
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificados', 'certificados', false)
ON CONFLICT (id) DO NOTHING;

-- Isolamento por tenant: o caminho do arquivo é "<empresa_id>/certificado-a1.enc",
-- então o primeiro segmento da pasta precisa bater com uma empresa do usuário.
CREATE POLICY tenant_certificados_rw ON storage.objects
FOR ALL
USING (
  bucket_id = 'certificados'
  AND (storage.foldername(name))[1]::uuid IN (SELECT empresas_do_usuario())
)
WITH CHECK (
  bucket_id = 'certificados'
  AND (storage.foldername(name))[1]::uuid IN (SELECT empresas_do_usuario())
);

-- ============================================================================
-- PRONTO. Não precisa regenerar tipos — não mudou nenhuma coluna/tabela,
-- só o corpo de funções e o storage.
-- ============================================================================
