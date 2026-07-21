-- ============================================================================
-- Migration: REFORMA TRIBUTÁRIA (IBS/CBS/NBS + split payment)
--
-- Rodar no Supabase Dashboard → SQL Editor do projeto CORRETO
-- (spxiaucinjsgbipaormf).
--
-- Prepara o modelo de dados para a Reforma Tributária (EC 132/2023, LC 214/2025,
-- LC 227/2026): destaque de CBS e IBS na nota, código NBS de serviço, regime
-- diferenciado por serviço, split payment e configuração da empresa.
--
-- Os VALORES em centavos (regra 15). As alíquotas são NUMERIC(6,4) (fração).
-- Idempotente: ADD COLUMN IF NOT EXISTS em tudo, pode reaplicar sem quebrar.
--
-- OBS: os números de alíquota da fase de teste (CBS 0,9% / IBS 0,1% em 2026) e as
-- reduções de regime são calculados na aplicação (src/lib/fiscal/reforma.ts) e
-- gravados aqui. Confirme prazos/percentuais com um contador antes de produção.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EMPRESA: CNAE (base do enquadramento) + escolha "por dentro / por fora"
--    do Simples (afeta o destaque de crédito ao cliente B2B — seções 5.4/7.4/8).
-- ----------------------------------------------------------------------------
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cnae TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS simples_por_fora BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 2. NOTA: código NBS (Nomenclatura Brasileira de Serviços) e regime diferenciado
--    do IBS/CBS por serviço (alíquota zero / redução 60% / 30% / específico).
-- ----------------------------------------------------------------------------
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS codigo_nbs TEXT;

ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS regime_ibscbs TEXT NOT NULL DEFAULT 'padrao'
  CHECK (regime_ibscbs IN ('padrao', 'reducao_30', 'reducao_60', 'aliquota_zero', 'especifico'));

-- ----------------------------------------------------------------------------
-- 3. NOTA: destaque de CBS e IBS (alíquota fração + valor em centavos).
--    Default 0 para as notas antigas (modelo ISS puro).
-- ----------------------------------------------------------------------------
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS cbs_aliquota NUMERIC(6,4) NOT NULL DEFAULT 0
  CHECK (cbs_aliquota >= 0 AND cbs_aliquota <= 1);
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS ibs_aliquota NUMERIC(6,4) NOT NULL DEFAULT 0
  CHECK (ibs_aliquota >= 0 AND ibs_aliquota <= 1);
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS cbs_valor_centavos INTEGER NOT NULL DEFAULT 0
  CHECK (cbs_valor_centavos >= 0);
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS ibs_valor_centavos INTEGER NOT NULL DEFAULT 0
  CHECK (ibs_valor_centavos >= 0);

-- ----------------------------------------------------------------------------
-- 4. NOTA: split payment (obrigatório 2027). Preenchidos SÓ quando a liquidação
--    financeira retiver CBS/IBS na fonte; ficam NULL enquanto o split não vale.
-- ----------------------------------------------------------------------------
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS valor_liquido_centavos INTEGER
  CHECK (valor_liquido_centavos IS NULL OR valor_liquido_centavos >= 0);
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS split_retido_centavos INTEGER
  CHECK (split_retido_centavos IS NULL OR split_retido_centavos >= 0);

-- ----------------------------------------------------------------------------
-- 5. Índice de apoio: consultar notas por regime dentro do tenant (relatórios).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notas_regime_ibscbs
  ON notas_fiscais(empresa_id, regime_ibscbs);

-- ============================================================================
-- PRONTO. Depois de aplicar, regenere os tipos:
--   npx supabase gen types typescript --linked > src/types/database.ts
-- (Este PR já atualizou database.ts à mão pra o build não quebrar antes disso.)
-- ============================================================================
