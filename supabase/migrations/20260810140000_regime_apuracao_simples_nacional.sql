-- ============================================================================
-- REGIME DE APURAÇÃO NO SIMPLES NACIONAL  (item A6 da auditoria)
--
-- `empresas.simples_por_fora` era um BOOLEAN decorativo: aparecia no schema, no
-- CRUD e na tela — que ainda PROMETIA "destacar IBS/CBS para gerar crédito a
-- clientes B2B" — e não entrava em cálculo nenhum, não ia para a nota e não
-- chegava ao provider. Prometer efeito inexistente é pior que não ter o campo:
-- o tenant repassa a informação de crédito ao cliente B2B dele.
--
-- POR QUE UM BOOLEAN NÃO SERVE, e esta é a parte que não é opinião: a NT-009
-- exige declarar o regime de apuração POR TRIBUTO. Uma empresa pode apurar CBS
-- dentro do Simples e IBS pelo regime regular ao mesmo tempo — o regime híbrido
-- da LC 214/2025. São DUAS dimensões (situação no Simples × regime de
-- apuração), e o booleano não representa nenhuma delas por inteiro. Trocá-lo
-- por dois enums não é refinamento: é passar a representar o que existe.
--
-- Espelho em código: SITUACAO_SIMPLES_NACIONAL e REGIME_APURACAO_SN em
-- src/lib/fiscal/ibscbs.ts, que já carregam os códigos oficiais opSimpNac
-- (1..4) e regApIBSCBSSN (1..3).
--
-- O QUE ESTA MIGRATION NÃO FAZ: não calcula crédito para o tomador. A regra de
-- crédito do Simples sob a LC 214/2025 é decisão contábil e segue pendente —
-- inventá-la produziria um número que o tenant repassa ao cliente dele.
-- ============================================================================

-- Regra 17: enum de domínio é CREATE TYPE, não TEXT + CHECK.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'situacao_simples_nacional') THEN
    CREATE TYPE situacao_simples_nacional AS ENUM (
      'nao_optante', 'mei', 'me_epp', 'optante_pendente'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regime_apuracao_ibscbs_sn') THEN
    CREATE TYPE regime_apuracao_ibscbs_sn AS ENUM (
      'ambos_pelo_sn', 'cbs_sn_ibs_regular', 'ambos_regime_regular'
    );
  END IF;
END $$;

COMMENT ON TYPE situacao_simples_nacional IS
  'opSimpNac da NT-009: 1=nao_optante, 2=mei, 3=me_epp, 4=optante_pendente.';

COMMENT ON TYPE regime_apuracao_ibscbs_sn IS
  'regApIBSCBSSN da NT-009: 1=ambos_pelo_sn, 2=cbs_sn_ibs_regular (regime '
  'hibrido da LC 214/2025), 3=ambos_regime_regular.';

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS situacao_simples_nacional situacao_simples_nacional
    NOT NULL DEFAULT 'nao_optante',
  ADD COLUMN IF NOT EXISTS regime_apuracao_ibscbs_sn regime_apuracao_ibscbs_sn,
  -- Data de opção pelo regime regular. A opção tem VIGÊNCIA: o que vale para
  -- uma nota é o regime na competência dela, não o que está marcado hoje.
  -- Guardar só o estado atual tornaria impossível reconstruir a apuração de um
  -- período anterior à mudança.
  ADD COLUMN IF NOT EXISTS data_opcao_regime_regular DATE;

COMMENT ON COLUMN empresas.data_opcao_regime_regular IS
  'Inicio da vigencia da opcao pelo regime regular. NULL quando a empresa apura '
  'tudo pelo Simples. Nota anterior a esta data NAO esta sob o regime regular.';

-- ---------------------------------------------------------------------------
-- Migração dos dados existentes, ANTES de derrubar a coluna antiga.
--
-- `simples_por_fora = true` só era aceito para optantes do Simples (a validação
-- do A5 garante isso), e significava "apura IBS/CBS pelo regime regular".
-- Traduz-se, portanto, em me_epp + ambos_regime_regular. O MEI vai para a
-- situação própria dele. Ninguém vira `optante_pendente` no backfill: esse
-- estado é uma resposta da Receita, não algo que se deduza do que temos.
-- ---------------------------------------------------------------------------

UPDATE empresas SET
  situacao_simples_nacional = CASE
    WHEN regime_tributario = 'mei'              THEN 'mei'::situacao_simples_nacional
    WHEN regime_tributario = 'simples_nacional' THEN 'me_epp'::situacao_simples_nacional
    ELSE 'nao_optante'::situacao_simples_nacional
  END,
  regime_apuracao_ibscbs_sn = CASE
    WHEN regime_tributario NOT IN ('mei', 'simples_nacional') THEN NULL
    WHEN simples_por_fora THEN 'ambos_regime_regular'::regime_apuracao_ibscbs_sn
    ELSE 'ambos_pelo_sn'::regime_apuracao_ibscbs_sn
  END;

-- A data de opção não existe para quem já estava marcado: ninguém a informou.
-- Deixar NULL é o único registro honesto — inventar uma data (a de criação da
-- empresa, por exemplo) produziria vigência falsa, e vigência falsa muda a
-- apuração de períodos inteiros. Quem já usava a marcação preenche na tela.

-- ---------------------------------------------------------------------------
-- Fora a coluna antiga. Mantê-la criaria DUAS fontes de verdade para a mesma
-- pergunta, que é como o campo virou decorativo em primeiro lugar: a tela
-- escrevia num lugar e o resto do sistema não lia lugar nenhum.
-- ---------------------------------------------------------------------------

ALTER TABLE empresas DROP COLUMN IF EXISTS simples_por_fora;

-- ---------------------------------------------------------------------------
-- Integridade.
-- ---------------------------------------------------------------------------

ALTER TABLE empresas
  DROP CONSTRAINT IF EXISTS chk_regime_apuracao_sn_coerente,
  DROP CONSTRAINT IF EXISTS chk_data_opcao_exige_regime_regular;

ALTER TABLE empresas
  -- Regime de apuração no Simples só faz sentido para quem está no Simples.
  -- Quem não é optante apura pelo regime regular por definição, e preencher a
  -- coluna aqui sugeriria uma escolha que não existe.
  ADD CONSTRAINT chk_regime_apuracao_sn_coerente CHECK (
    (situacao_simples_nacional IN ('mei', 'me_epp', 'optante_pendente')
      AND regime_apuracao_ibscbs_sn IS NOT NULL)
    OR (situacao_simples_nacional = 'nao_optante'
      AND regime_apuracao_ibscbs_sn IS NULL)
  ),

  -- Data de opção sem opção pelo regime regular é dado órfão. O inverso —
  -- optar sem informar a data — é o estado do backfill acima e continua
  -- permitido, senão a migration derrubaria quem já usava a marcação.
  ADD CONSTRAINT chk_data_opcao_exige_regime_regular CHECK (
    data_opcao_regime_regular IS NULL
    OR regime_apuracao_ibscbs_sn IN ('cbs_sn_ibs_regular', 'ambos_regime_regular')
  );

-- ---------------------------------------------------------------------------
-- Onboarding: derivar a situação no Simples ao criar a empresa.
--
-- Sem isto, toda empresa nova nasceria `nao_optante` por causa do DEFAULT da
-- coluna — inclusive uma que acabou de se declarar optante pelo Simples no
-- formulário de onboarding. O registro nasceria contradizendo o
-- `regime_tributario` da mesma linha, e só seria corrigido se o usuário
-- passasse pela tela de configurações. É o mesmo modo de falha do campo
-- decorativo que esta migration está removendo, então não faz sentido
-- reintroduzi-lo pela porta do lado.
--
-- ASSINATURA IDÊNTICA à da migration 20260805120000 — de propósito. Mudar os
-- parâmetros mudaria o tipo da função em `database.ts` e quebraria a chamada
-- em `criarEmpresaComOwner()`. Só o corpo muda.
--
-- O padrão de entrada é "por dentro" (`ambos_pelo_sn`): é o estado de quem não
-- fez nada, e a opção pelo regime regular é ATO do contribuinte, com data. Sair
-- do padrão exige a tela, onde a data é pedida junto.
-- ---------------------------------------------------------------------------
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

  -- 3b. Situação no Simples derivada do regime declarado (A6)
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

  -- 4. Criação atômica (os CHECKs da tabela validam CNPJ/IBGE de novo)
  INSERT INTO empresas (
    razao_social, cnpj, codigo_municipio_ibge, email_contato,
    regime_tributario, nome_fantasia, inscricao_municipal, provider_fiscal,
    situacao_simples_nacional, regime_apuracao_ibscbs_sn
  ) VALUES (
    p_razao_social, p_cnpj, p_codigo_municipio_ibge, p_email_contato,
    p_regime_tributario, p_nome_fantasia, p_inscricao_municipal, 'mock',
    v_situacao, v_apuracao
  ) RETURNING id INTO v_empresa_id;

  INSERT INTO empresa_membros (empresa_id, user_id, papel)
  VALUES (v_empresa_id, v_user_id, 'owner');

  INSERT INTO assinaturas (empresa_id, plano, status, preco_centavos, limite_notas_mes)
  VALUES (v_empresa_id, 'starter', 'trial', 0, 100);

  RETURN v_empresa_id;
END;
$$;

-- CREATE OR REPLACE preserva a ACL existente, mas os privilégios são
-- reafirmados aqui pelo mesmo motivo da migration 20260805120000: no Supabase
-- o `anon` recebe EXECUTE por default privileges DIRETAS, e deixar isso
-- implícito já custou um incidente.
REVOKE ALL ON FUNCTION public.criar_minha_empresa FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_minha_empresa TO authenticated;
REVOKE EXECUTE ON FUNCTION public.criar_minha_empresa FROM anon;
