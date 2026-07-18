-- ============================================================================
-- Migration: Faturamento de NOTAS EXCEDENTES (cobrança mensal agregada)
--
-- Rodar no Supabase Dashboard → SQL Editor do projeto CORRETO
-- (spxiaucinjsgbipaormf) — NÃO no outro projeto Supabase da conta.
--
-- Modelo "conta de luz" (decisão do produto): o plano garante um limite mensal
-- de notas (assinaturas.limite_notas_mes). Cada nota EMITIDA acima do limite no
-- mês é marcada como `excedente`; um job mensal soma todas as excedentes do
-- ciclo e gera UMA única fatura agregada por empresa (via Asaas).
--
-- Idempotente: pode ser reaplicada sem quebrar (ADD COLUMN IF NOT EXISTS,
-- CREATE OR REPLACE, UNIQUE por empresa/competência).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Preço por nota excedente — configurável por assinatura (centavos, regra 15)
--    Default 30 = R$ 0,30/nota. Ajustar por assinatura conforme o plano.
-- ----------------------------------------------------------------------------
ALTER TABLE assinaturas
  ADD COLUMN IF NOT EXISTS preco_excedente_centavos INTEGER NOT NULL DEFAULT 30
    CHECK (preco_excedente_centavos >= 0);

-- ----------------------------------------------------------------------------
-- 2. Faturas de excedente: UMA por empresa por competência (mês faturado).
--    A UNIQUE(empresa_id, competencia) é a trava de idempotência do job mensal.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faturas_excedente (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  competencia             DATE NOT NULL,             -- primeiro dia do mês faturado
  quantidade_notas        INTEGER NOT NULL CHECK (quantidade_notas > 0),
  preco_unitario_centavos INTEGER NOT NULL CHECK (preco_unitario_centavos >= 0),
  valor_total_centavos    INTEGER NOT NULL CHECK (valor_total_centavos >= 0),
  status                  TEXT NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente', 'cobrada', 'paga', 'falhou')),
  asaas_payment_id        TEXT,
  link_fatura             TEXT,
  erro                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_faturas_excedente_empresa
  ON faturas_excedente(empresa_id);

DROP TRIGGER IF EXISTS trg_faturas_excedente_updated_at ON faturas_excedente;
CREATE TRIGGER trg_faturas_excedente_updated_at
  BEFORE UPDATE ON faturas_excedente FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Marcação na própria nota + vínculo com a fatura que a cobrou.
--    fatura_excedente_id NULL = excedente ainda não faturada (o job pega essas).
-- ----------------------------------------------------------------------------
ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS excedente BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS fatura_excedente_id UUID
    REFERENCES faturas_excedente(id) ON DELETE SET NULL;

-- Índice parcial: exatamente o que o job mensal varre (excedentes a faturar)
CREATE INDEX IF NOT EXISTS idx_notas_excedente_a_faturar
  ON notas_fiscais(empresa_id, competencia)
  WHERE excedente = true AND fatura_excedente_id IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Marcação de excedente — chamada pelo motor (service_role) APÓS a nota
--    virar `emitida`. Race-safe: conta a posição da nota entre as emitidas do
--    mês sob FOR UPDATE. Só nota emitida conta pro limite (nota que falhou não).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marcar_nota_excedente(p_nota_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nota      notas_fiscais;
  v_limite    INTEGER;
  v_rank      INTEGER;
  v_excedente BOOLEAN;
BEGIN
  SELECT * INTO v_nota FROM notas_fiscais WHERE id = p_nota_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota % não encontrada', p_nota_id;
  END IF;

  -- Só conta pro limite se realmente emitida
  IF v_nota.status <> 'emitida' OR v_nota.emitida_em IS NULL THEN
    RETURN false;
  END IF;

  -- Limite do plano vigente (assinatura não-cancelada mais recente)
  SELECT limite_notas_mes INTO v_limite
  FROM assinaturas
  WHERE empresa_id = v_nota.empresa_id AND status <> 'cancelada'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_limite IS NULL THEN
    RETURN false;  -- sem assinatura: não há limite pra comparar
  END IF;

  -- Posição (1-indexada) desta nota entre as EMITIDAS do mesmo mês de competência
  SELECT count(*) INTO v_rank
  FROM notas_fiscais n
  WHERE n.empresa_id = v_nota.empresa_id
    AND n.status = 'emitida'
    AND date_trunc('month', n.competencia) = date_trunc('month', v_nota.competencia)
    AND (n.emitida_em, n.id) <= (v_nota.emitida_em, v_nota.id);

  v_excedente := v_rank > v_limite;

  UPDATE notas_fiscais SET excedente = v_excedente WHERE id = p_nota_id;
  RETURN v_excedente;
END;
$$;

-- Só o motor interno (service_role) marca excedente. Fecha o advisor de segurança.
REVOKE ALL ON FUNCTION marcar_nota_excedente FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION marcar_nota_excedente FROM anon;
GRANT EXECUTE ON FUNCTION marcar_nota_excedente TO service_role;

-- ----------------------------------------------------------------------------
-- 5. RLS: tenant lê as próprias faturas de excedente; escrita só via service_role.
-- ----------------------------------------------------------------------------
ALTER TABLE faturas_excedente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_faturas_excedente ON faturas_excedente;
CREATE POLICY sel_faturas_excedente ON faturas_excedente FOR SELECT
  USING (empresa_id IN (SELECT empresas_do_usuario()));

-- ============================================================================
-- PRONTO. Depois de aplicar, regenere os tipos:
--   npx supabase gen types typescript --linked > src/types/database.ts
-- (Este PR já atualizou database.ts à mão pra o build não quebrar antes disso.)
-- ============================================================================
