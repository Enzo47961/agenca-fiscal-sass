-- ============================================================================
-- Signup automático: toda conta nova já nasce com empresa + assinatura beta
-- Rodar UMA VEZ no Supabase Dashboard → SQL Editor
-- Depois de rodar, regenerar os tipos:
--   npx supabase gen types typescript --linked > src/types/database.ts
-- ============================================================================

-- 1. Conta nova ainda não tem CNPJ — permitir empresa "vazia" até o onboarding
ALTER TABLE public.empresas ALTER COLUMN cnpj DROP NOT NULL;
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_cnpj_check;
ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_cnpj_check CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');

ALTER TABLE public.empresas ALTER COLUMN codigo_municipio_ibge DROP NOT NULL;
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_codigo_municipio_ibge_check;
ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_codigo_municipio_ibge_check
  CHECK (codigo_municipio_ibge IS NULL OR codigo_municipio_ibge ~ '^[0-9]{7}$');

-- 2. Função disparada a cada usuário novo do Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id UUID;
  v_nome TEXT;
BEGIN
  v_nome := COALESCE(NEW.raw_user_meta_data ->> 'nome', split_part(NEW.email, '@', 1));

  -- Empresa "casca" — o onboarding fiscal preenche CNPJ, IBGE etc.
  INSERT INTO public.empresas (razao_social, email_contato, provider_fiscal)
  VALUES (v_nome, NEW.email, 'mock')
  RETURNING id INTO v_empresa_id;

  -- Usuário vira owner da própria empresa
  INSERT INTO public.empresa_membros (empresa_id, user_id, papel)
  VALUES (v_empresa_id, NEW.id, 'owner');

  -- Assinatura beta: grátis, sem data de fim
  INSERT INTO public.assinaturas (empresa_id, plano, status, preco_centavos, limite_notas_mes)
  VALUES (v_empresa_id, 'starter', 'trial', 0, 100);

  RETURN NEW;
END;
$$;

-- 3. Trigger (recriar de forma idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- PRONTO. Agora qualquer cadastro em /cadastro (ou usuário criado no
-- Dashboard → Authentication → Add user) já entra no painel funcionando.
-- ============================================================================
