-- ============================================================================
-- Agência Fiscal SaaS — Schema multi-tenant
-- Postgres 15+ / Supabase
-- Aplicar via: supabase/migrations/ (este arquivo é a migration inicial)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensões
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Enums de domínio (espelhados em src/types/domain.ts)
-- ----------------------------------------------------------------------------
CREATE TYPE nota_status AS ENUM ('pendente', 'reprocessando', 'emitida', 'falhou');
CREATE TYPE assinatura_status AS ENUM ('trial', 'ativa', 'inadimplente', 'cancelada');
CREATE TYPE plano_tipo AS ENUM ('starter', 'pro', 'escala');
CREATE TYPE tentativa_resultado AS ENUM ('sucesso', 'erro_transiente', 'erro_permanente');
CREATE TYPE membro_papel AS ENUM ('owner', 'admin', 'operador');

-- ----------------------------------------------------------------------------
-- Trigger utilitário: updated_at automático
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. EMPRESAS (tenants)
-- ============================================================================
CREATE TABLE empresas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social          TEXT NOT NULL,
  nome_fantasia         TEXT,
  cnpj                  TEXT NOT NULL UNIQUE
                          CHECK (cnpj ~ '^[0-9]{14}$'),
  inscricao_municipal   TEXT,
  codigo_municipio_ibge TEXT NOT NULL CHECK (codigo_municipio_ibge ~ '^[0-9]{7}$'),
  regime_tributario     TEXT NOT NULL DEFAULT 'simples_nacional',
  email_contato         TEXT NOT NULL,
  -- Credenciais do provider fiscal ficam em Vault/env, NUNCA aqui.
  provider_fiscal       TEXT NOT NULL DEFAULT 'mock', -- focusnfe | nuvemfiscal | mock
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_empresas_updated_at
  BEFORE UPDATE ON empresas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Vínculo usuário (auth.users) ↔ empresa
CREATE TABLE empresa_membros (
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel       membro_papel NOT NULL DEFAULT 'operador',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, user_id)
);

CREATE INDEX idx_empresa_membros_user ON empresa_membros(user_id);

-- Helper para as policies RLS: empresas às quais o usuário logado pertence
CREATE OR REPLACE FUNCTION empresas_do_usuario()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT empresa_id FROM empresa_membros WHERE user_id = auth.uid();
$$;

-- ============================================================================
-- 2. CLIENTES (tomadores de serviço, por tenant)
-- ============================================================================
CREATE TABLE clientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  cpf_cnpj        TEXT NOT NULL CHECK (cpf_cnpj ~ '^[0-9]{11}$|^[0-9]{14}$'),
  email           TEXT,
  telefone        TEXT,
  endereco        JSONB NOT NULL DEFAULT '{}'::jsonb, -- logradouro, numero, bairro, municipio, uf, cep, codigo_municipio_ibge
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, cpf_cnpj)
);

CREATE INDEX idx_clientes_empresa ON clientes(empresa_id);
CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. ASSINATURAS (billing do SaaS, 1 ativa por empresa)
-- ============================================================================
CREATE TABLE assinaturas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plano                   plano_tipo NOT NULL DEFAULT 'starter',
  status                  assinatura_status NOT NULL DEFAULT 'trial',
  limite_notas_mes        INTEGER NOT NULL DEFAULT 50 CHECK (limite_notas_mes > 0),
  preco_centavos          INTEGER NOT NULL DEFAULT 0 CHECK (preco_centavos >= 0),
  gateway_customer_id     TEXT,           -- ex.: Stripe customer id
  gateway_subscription_id TEXT,
  trial_ate               TIMESTAMPTZ,
  periodo_atual_inicio    TIMESTAMPTZ NOT NULL DEFAULT now(),
  periodo_atual_fim       TIMESTAMPTZ,
  cancelada_em            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apenas uma assinatura não-cancelada por empresa
CREATE UNIQUE INDEX idx_assinaturas_ativa_unica
  ON assinaturas(empresa_id) WHERE status <> 'cancelada';

CREATE TRIGGER trg_assinaturas_updated_at
  BEFORE UPDATE ON assinaturas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 4. NOTAS FISCAIS (core — com controle de retry e logs)
-- ============================================================================
CREATE TABLE notas_fiscais (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id            UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,

  -- Chave de idempotência junto ao provider fiscal (regra 7 do CLAUDE.md)
  referencia_externa    UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  -- Dados do serviço
  descricao_servico     TEXT NOT NULL,
  codigo_servico        TEXT NOT NULL,             -- item da LC 116/2003
  valor_servico_centavos INTEGER NOT NULL CHECK (valor_servico_centavos > 0),
  aliquota_iss          NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (aliquota_iss >= 0 AND aliquota_iss <= 1),
  iss_retido            BOOLEAN NOT NULL DEFAULT false,
  competencia           DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Máquina de estados (transições SOMENTE via transicionar_status_nota)
  status                nota_status NOT NULL DEFAULT 'pendente',

  -- Controle de reprocessamento
  tentativas            INTEGER NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  max_tentativas        INTEGER NOT NULL DEFAULT 4 CHECK (max_tentativas >= 1),
  proxima_tentativa_em  TIMESTAMPTZ,               -- informativo p/ UI; agendamento real é do Inngest
  ultimo_erro           TEXT,                      -- mensagem legível do último erro
  ultimo_erro_codigo    TEXT,                      -- código de erro da API fiscal
  falha_definitiva_em   TIMESTAMPTZ,

  -- Resultado da emissão
  numero_nfse           TEXT,
  codigo_verificacao    TEXT,
  url_pdf               TEXT,
  url_xml               TEXT,
  provider_id           TEXT,                      -- id da nota no provider fiscal
  emitida_em            TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Consistência status ↔ campos
  CONSTRAINT chk_emitida_tem_numero
    CHECK (status <> 'emitida' OR (numero_nfse IS NOT NULL AND emitida_em IS NOT NULL)),
  CONSTRAINT chk_falhou_tem_registro
    CHECK (status <> 'falhou' OR falha_definitiva_em IS NOT NULL)
);

CREATE INDEX idx_notas_empresa_status ON notas_fiscais(empresa_id, status);
CREATE INDEX idx_notas_cliente ON notas_fiscais(cliente_id);
CREATE INDEX idx_notas_competencia ON notas_fiscais(empresa_id, competencia);
CREATE TRIGGER trg_notas_updated_at
  BEFORE UPDATE ON notas_fiscais FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 4b. Log de tentativas de emissão (auditoria completa — regra 10)
-- ----------------------------------------------------------------------------
CREATE TABLE notas_fiscais_tentativas (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nota_id         UUID NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero_tentativa INTEGER NOT NULL CHECK (numero_tentativa >= 1),
  resultado       tentativa_resultado NOT NULL,
  erro_codigo     TEXT,
  erro_mensagem   TEXT,
  payload_erro    JSONB,                 -- resposta bruta da API fiscal
  duracao_ms      INTEGER,
  criada_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nota_id, numero_tentativa)     -- idempotência do log em replays do Inngest
);

CREATE INDEX idx_tentativas_nota ON notas_fiscais_tentativas(nota_id);

-- ----------------------------------------------------------------------------
-- 4c. Máquina de estados — única porta de entrada para mudar status
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

  -- Transições válidas (regra 6 do CLAUDE.md)
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

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE empresas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresa_membros           ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscais             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscais_tentativas  ENABLE ROW LEVEL SECURITY;

-- Empresas: membro vê e admin/owner edita a própria empresa
CREATE POLICY sel_empresas ON empresas FOR SELECT
  USING (id IN (SELECT empresas_do_usuario()));
CREATE POLICY upd_empresas ON empresas FOR UPDATE
  USING (id IN (SELECT empresa_id FROM empresa_membros
                WHERE user_id = auth.uid() AND papel IN ('owner','admin')));

-- Membros: visível para quem é da mesma empresa
CREATE POLICY sel_membros ON empresa_membros FOR SELECT
  USING (empresa_id IN (SELECT empresas_do_usuario()));

-- Clientes: CRUD completo dentro do tenant
CREATE POLICY all_clientes ON clientes FOR ALL
  USING (empresa_id IN (SELECT empresas_do_usuario()))
  WITH CHECK (empresa_id IN (SELECT empresas_do_usuario()));

-- Assinaturas: somente leitura pelo tenant (escrita via service_role/webhooks)
CREATE POLICY sel_assinaturas ON assinaturas FOR SELECT
  USING (empresa_id IN (SELECT empresas_do_usuario()));

-- Notas: tenant cria (status inicial pendente) e lê; status muda só via função/motor
CREATE POLICY sel_notas ON notas_fiscais FOR SELECT
  USING (empresa_id IN (SELECT empresas_do_usuario()));
CREATE POLICY ins_notas ON notas_fiscais FOR INSERT
  WITH CHECK (
    empresa_id IN (SELECT empresas_do_usuario())
    AND status = 'pendente'
  );

-- Tentativas: somente leitura pelo tenant (escrita só pelo motor via service_role)
CREATE POLICY sel_tentativas ON notas_fiscais_tentativas FOR SELECT
  USING (empresa_id IN (SELECT empresas_do_usuario()));

-- ============================================================================
-- FIM — Após aplicar: npx supabase gen types typescript --local > src/types/database.ts
-- ============================================================================
