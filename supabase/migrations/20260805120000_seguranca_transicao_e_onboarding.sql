-- ============================================================================
-- Segurança da máquina de estados + onboarding, agora DENTRO do pipeline de
-- migrations (regra 14 do CLAUDE.md).
--
-- CONTEXTO / POST-MORTEM (preservado dos arquivos .sql soltos que esta
-- migration substitui e que foram removidos da raiz do repositório):
--
--   `supabase_fix_seguranca_transicao.sql`
--     Problema: `transicionar_status_nota()` é SECURITY DEFINER e só validava a
--     máquina de estados, nunca se quem chamou tinha acesso à empresa dona da
--     nota. Como nenhuma migration tinha REVOKE/GRANT explícito, o Postgres
--     deixa EXECUTE liberado para PUBLIC por padrão — ou seja, até uma chamada
--     anônima (anon key) podia transicionar o status de nota de QUALQUER
--     empresa via /rpc/transicionar_status_nota (IDOR cross-tenant, violação
--     direta das regras 1 e 3). O incidente ocorreu em produção e foi corrigido
--     rodando SQL à mão no Dashboard — portanto NÃO estava no controle de
--     versão de schema, e qualquer ambiente recriado a partir de
--     `supabase/migrations/` (dev novo, staging, CI, disaster recovery,
--     `npx supabase db reset`) REINTRODUZIA a vulnerabilidade.
--
--   `supabase_onboarding.sql`
--     `criar_minha_empresa()` (chamada por src/services/empresas.ts) nunca
--     esteve em migration nenhuma. Ambiente novo = onboarding quebrado.
--     Mesmo problema para o bucket de storage `certificados`, sem o qual
--     `salvarCertificadoA1()` falha.
--
--   `supabase_signup_trigger.sql`
--     Já estava marcado como OBSOLETO no próprio arquivo (substituído pela
--     abordagem de `criar_minha_empresa()`). Nada dele é reaplicado aqui.
--
-- Esta migration é a fonte de verdade desses objetos a partir de agora. Ela é
-- idempotente e segura tanto num banco novo (aplicada em sequência após as
-- migrations anteriores) quanto num banco onde o fix manual já foi aplicado.
--
-- Não altera nenhuma coluna/tabela: as assinaturas das funções são idênticas
-- às já declaradas em src/types/database.ts, então `supabase gen types` não
-- deve produzir diff. Regenerar mesmo assim é a conduta correta (regra 14).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Máquina de estados: validação de tenant dentro da função
--
-- Só o motor interno (service_role, usado pelas funções Inngest) passa livre.
-- Qualquer outra chamada — usuário logado ou anônimo — precisa pertencer à
-- empresa dona da nota. A validação da máquina de estados (regra 6) permanece
-- exatamente igual à da migration inicial.
-- ----------------------------------------------------------------------------
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

  -- Checagem de tenant (a correção do IDOR)
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
    -- Reprocessamento manual zera o ciclo; falha definitiva registra o momento
    tentativas          = CASE WHEN p_novo_status = 'pendente' THEN 0 ELSE tentativas END,
    falha_definitiva_em = CASE WHEN p_novo_status = 'pendente' THEN NULL
                               WHEN p_novo_status = 'falhou'   THEN now()
                               ELSE falha_definitiva_em END
  WHERE id = p_nota_id
  RETURNING * INTO v_nota;

  RETURN v_nota;
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Onboarding atômico: empresa + vínculo owner + assinatura beta
--
-- Por que uma função (e não policies de INSERT abertas): se a policy de
-- empresa_membros permitisse INSERT livre, um usuário sem vínculo poderia se
-- adicionar como owner de QUALQUER empresa existente. A função SECURITY
-- DEFINER faz as três inserções numa transação única, sempre em nome do
-- próprio usuário logado, e só se ele ainda não tiver empresa.
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- 3. Trigger utilitário com search_path explícito
--
-- Boa prática: evita sequestro de search_path em função sem schema fixo.
-- Corpo idêntico ao da migration inicial.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. GRANT/REVOKE explícitos (defesa em profundidade, além das checagens
--    internas acima)
--
-- No Supabase, `anon`/`authenticated` recebem EXECUTE por default privileges
-- DIRETAS — `REVOKE ... FROM PUBLIC` sozinho não remove o grant direto do
-- `anon`. Por isso o REVOKE nominal logo em seguida.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION transicionar_status_nota FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transicionar_status_nota TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION transicionar_status_nota FROM anon;

REVOKE ALL ON FUNCTION empresas_do_usuario FROM PUBLIC;
GRANT EXECUTE ON FUNCTION empresas_do_usuario TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION empresas_do_usuario FROM anon;

REVOKE ALL ON FUNCTION public.criar_minha_empresa FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_minha_empresa TO authenticated;
REVOKE EXECUTE ON FUNCTION public.criar_minha_empresa FROM anon;


-- ----------------------------------------------------------------------------
-- 5. Bucket "certificados" (privado) + isolamento por tenant
--
-- Usado por salvarCertificadoA1() (src/services/empresas.ts) para guardar o
-- certificado A1 criptografado (AES-256-GCM). O caminho do arquivo é
-- "<empresa_id>/certificado-a1.enc", então o primeiro segmento da pasta
-- precisa bater com uma empresa do usuário.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificados', 'certificados', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS tenant_certificados_rw ON storage.objects;
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
