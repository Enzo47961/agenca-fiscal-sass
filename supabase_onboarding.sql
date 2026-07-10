-- ============================================================================
-- ONBOARDING: função atômica que cria empresa + vínculo owner + assinatura beta
-- Rodar UMA VEZ no Supabase Dashboard → SQL Editor.
--
-- Por que uma função (e não policies de INSERT abertas): se a policy de
-- empresa_membros permitisse INSERT livre, um usuário sem vínculo poderia se
-- adicionar como owner de QUALQUER empresa existente. A função SECURITY
-- DEFINER faz as três inserções numa transação única, sempre em nome do
-- próprio usuário logado, e só se ele ainda não tiver empresa.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.criar_minha_empresa(
  p_razao_social          TEXT,
  p_cnpj                  TEXT,
  p_codigo_municipio_ibge TEXT,
  p_email_contato         TEXT,
  p_regime_tributario     TEXT DEFAULT 'simples_nacional',
  p_nome_fantasia         TEXT DEFAULT NULL,
  p_inscricao_municipal   TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_empresa_id UUID;
BEGIN
  -- 1. Precisa estar autenticado
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado';
  END IF;

  -- 2. Só a PRIMEIRA empresa: quem já tem vínculo não cria outra por aqui
  IF EXISTS (SELECT 1 FROM empresa_membros WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'usuario_ja_tem_empresa';
  END IF;

  -- 3. CNPJ já cadastrado por outra conta?
  IF EXISTS (SELECT 1 FROM empresas WHERE cnpj = p_cnpj) THEN
    RAISE EXCEPTION 'cnpj_ja_cadastrado';
  END IF;

  -- 4. Criação atômica (os CHECKs da tabela validam CNPJ/IBGE de novo)
  INSERT INTO empresas (
    razao_social, cnpj, codigo_municipio_ibge, email_contato,
    regime_tributario, nome_fantasia, inscricao_municipal, provider_fiscal
  ) VALUES (
    p_razao_social, p_cnpj, p_codigo_municipio_ibge, p_email_contato,
    p_regime_tributario, p_nome_fantasia, p_inscricao_municipal, 'mock'
  ) RETURNING id INTO v_empresa_id;

  INSERT INTO empresa_membros (empresa_id, user_id, papel)
  VALUES (v_empresa_id, v_user_id, 'owner');

  INSERT INTO assinaturas (empresa_id, plano, status, preco_centavos, limite_notas_mes)
  VALUES (v_empresa_id, 'starter', 'trial', 0, 100);

  RETURN v_empresa_id;
END;
$$;

-- Só usuários logados podem chamar
REVOKE ALL ON FUNCTION public.criar_minha_empresa FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_minha_empresa TO authenticated;

-- ============================================================================
-- PRONTO. Depois de rodar, regenere os tipos TypeScript:
--   npx supabase gen types typescript --linked > src/types/database.ts
-- (Já deixei o tipo desta função adicionado manualmente no database.ts para o
--  build não quebrar antes da regeneração.)
-- ============================================================================
