-- ============================================================================
-- MULTI-EMPRESA — um usuário pode gerenciar várias empresas
--
-- POR QUE MUDA. O produto nasceu com "um usuário = uma empresa":
-- `criar_minha_empresa()` recusava a segunda com `usuario_ja_tem_empresa`, e
-- `estadoDaSessao()` pegava a primeira linha de `empresa_membros` com LIMIT 1.
-- Isso fecha a porta para o cliente que mais interessa comercialmente — o
-- escritório de contabilidade, que gerencia dezenas de CNPJs e não vai
-- administrar dezenas de logins.
--
-- O schema JÁ suportava: `empresa_membros` é muitos-para-muitos e `membro_papel`
-- já tinha owner/admin/operador. O bloqueio era só de aplicação.
--
-- O QUE A TRAVA ANTIGA PROTEGIA, e como isso continua protegido. Ela impedia
-- que uma conta criasse empresas indefinidamente. Duas defesas permanecem e uma
-- é acrescentada:
--   1. CNPJ continua único no sistema — ninguém cadastra empresa de terceiro
--      que já esteja em uso.
--   2. A função segue SECURITY DEFINER agindo só em nome de `auth.uid()`.
--   3. NOVO: teto de empresas por usuário, para que a remoção do limite de uma
--      não vire criação ilimitada por acidente ou abuso.
-- ============================================================================

-- Teto por usuário. 200 é folgado para um escritório real e ainda assim é um
-- limite — sem ele, um bug de retry no onboarding criaria empresas em série.
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
  v_situacao   situacao_simples_nacional;
  v_apuracao   regime_apuracao_ibscbs_sn;
  v_qtd        INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado';
  END IF;

  -- Antes: "usuario_ja_tem_empresa". Agora o limite é de quantidade, não de
  -- existência — é o que permite a carteira do contador.
  SELECT count(*) INTO v_qtd FROM empresa_membros WHERE user_id = v_user_id;
  IF v_qtd >= 200 THEN
    RAISE EXCEPTION 'limite_de_empresas_atingido';
  END IF;

  IF EXISTS (SELECT 1 FROM empresas WHERE cnpj = p_cnpj) THEN
    RAISE EXCEPTION 'cnpj_ja_cadastrado';
  END IF;

  -- Situação no Simples derivada do regime declarado (A6)
  IF p_regime_tributario = 'mei' THEN
    v_situacao := 'mei';
    v_apuracao := 'ambos_pelo_sn';
  ELSIF p_regime_tributario = 'simples_nacional' THEN
    v_situacao := 'me_epp';
    v_apuracao := 'ambos_pelo_sn';
  ELSE
    v_situacao := 'nao_optante';
    v_apuracao := NULL;
  END IF;

  INSERT INTO empresas (
    razao_social, cnpj, codigo_municipio_ibge, email_contato,
    regime_tributario, nome_fantasia, inscricao_municipal, provider_fiscal,
    situacao_simples_nacional, regime_apuracao_ibscbs_sn
  ) VALUES (
    p_razao_social, p_cnpj, p_codigo_municipio_ibge, p_email_contato,
    p_regime_tributario, p_nome_fantasia, p_inscricao_municipal, 'mock',
    v_situacao, v_apuracao
  ) RETURNING id INTO v_empresa_id;

  -- Quem cria é owner da empresa que criou. O papel é POR EMPRESA: o mesmo
  -- usuário pode ser owner da carteira dele e operador na empresa de um cliente
  -- que o convidou.
  INSERT INTO empresa_membros (empresa_id, user_id, papel)
  VALUES (v_empresa_id, v_user_id, 'owner');

  INSERT INTO assinaturas (empresa_id, plano, status, preco_centavos, limite_notas_mes)
  VALUES (v_empresa_id, 'starter', 'trial', 0, 100);

  RETURN v_empresa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_minha_empresa FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_minha_empresa TO authenticated;
REVOKE EXECUTE ON FUNCTION public.criar_minha_empresa FROM anon;

-- ---------------------------------------------------------------------------
-- Listagem da carteira. Uma função em vez de SELECT direto porque o seletor de
-- empresa precisa do NOME, que está em `empresas` — e a policy de `empresas` já
-- filtra por vínculo, então a junção é segura, mas concentrar aqui deixa o
-- contrato explícito e testável.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minhas_empresas()
RETURNS TABLE (
  empresa_id    UUID,
  razao_social  TEXT,
  nome_fantasia TEXT,
  cnpj          TEXT,
  papel         membro_papel
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT e.id, e.razao_social, e.nome_fantasia, e.cnpj, m.papel
  FROM empresa_membros m
  JOIN empresas e ON e.id = m.empresa_id
  WHERE m.user_id = auth.uid()
  ORDER BY e.razao_social;
$$;

COMMENT ON FUNCTION public.minhas_empresas IS
  'Carteira do usuario logado. SECURITY DEFINER com filtro por auth.uid(): '
  'nunca aceita user_id por parametro, senao viraria IDOR.';

REVOKE ALL ON FUNCTION public.minhas_empresas FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.minhas_empresas TO authenticated;
REVOKE EXECUTE ON FUNCTION public.minhas_empresas FROM anon;

-- Índice para a carteira: a consulta é sempre "empresas deste usuário".
CREATE INDEX IF NOT EXISTS idx_empresa_membros_user
  ON empresa_membros (user_id, empresa_id);
