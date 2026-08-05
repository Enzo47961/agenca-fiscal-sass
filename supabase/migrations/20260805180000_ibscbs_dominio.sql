-- ============================================================================
-- Tabelas de domínio do grupo IBSCBS (item C5 da auditoria).
--
-- Fonte: `ibscbs_modelagem_tecnica.md` (pesquisa de ago/2026) — extração ao
-- vivo do DOM do Portal da Conformidade Fácil (SVRS/ENCAT) em 05/08/2026,
-- que é dado primário, não resumo mediado. O portal cobre 17 tipos de DF-e,
-- NF-e e NFS-e incluídos: é a MESMA tabela de domínio para os dois documentos.
--
-- POR QUE TABELA E NÃO ENUM (regra 17 do CLAUDE.md tem exceção justificada
-- aqui): os enums do projeto (`nota_status`, `plano_tipo`...) são vocabulário
-- NOSSO, que só muda com deploy. CST e cClassTrib são vocabulário de TERCEIRO,
-- mantido por Nota Técnica do Comitê Gestor: 18 e 164 códigos hoje, sujeitos a
-- mudança sem aviso. A própria pesquisa encontrou fontes divergindo sobre se o
-- CST 220 foi removido (seção 4 do relatório). Um `CREATE TYPE` exigiria
-- migration + deploy a cada Nota Técnica; tabela absorve a mudança com um
-- INSERT. Isso é decisão de engenharia consciente, não descuido.
--
-- Estas tabelas NÃO têm empresa_id: são dados de referência nacional, iguais
-- para todos os tenants. Por isso a policy é de leitura para qualquer usuário
-- autenticado e escrita nenhuma pela API (só migration/service_role).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. CST-IBS/CBS — 18 códigos (tabela COMPLETA)
--
-- As colunas booleanas são os indicadores da tabela oficial que determinam
-- quais subgrupos do XML são obrigatórios/vedados para cada CST.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cst_ibscbs (
  codigo              TEXT PRIMARY KEY CHECK (codigo ~ '^[0-9]{3}$'),
  descricao           TEXT NOT NULL,
  exige_tributacao    BOOLEAN NOT NULL DEFAULT false,
  red_base_calculo    BOOLEAN NOT NULL DEFAULT false,
  red_aliquota        BOOLEAN NOT NULL DEFAULT false,
  transf_credito      BOOLEAN NOT NULL DEFAULT false,
  diferimento         BOOLEAN NOT NULL DEFAULT false,
  monofasica          BOOLEAN NOT NULL DEFAULT false,
  cred_pres_zfm       BOOLEAN NOT NULL DEFAULT false,
  ajuste_competencia  BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cst_ibscbs IS
  'Código de Situação Tributária IBS/CBS (3 dígitos). Tabela de domínio nacional, '
  'compartilhada por NF-e e NFS-e. Fonte: Portal da Conformidade Fácil (SVRS/ENCAT), '
  'extração de 05/08/2026. Espelhada em src/lib/fiscal/ibscbs.ts (TABELA_CST).';

INSERT INTO cst_ibscbs (
  codigo, descricao, exige_tributacao, red_base_calculo, red_aliquota,
  transf_credito, diferimento, monofasica, cred_pres_zfm, ajuste_competencia
) VALUES
  ('000', 'Tributação integral',                 true,  false, false, false, false, false, false, false),
  ('010', 'Alíquotas uniformes',                 true,  false, false, false, false, false, false, false),
  ('011', 'Alíquotas uniformes reduzidas',       true,  false, true,  false, false, false, false, false),
  ('200', 'Alíquota reduzida',                   true,  false, true,  false, false, false, false, false),
  ('220', 'Alíquota fixa',                       true,  false, false, false, false, false, false, false),
  ('221', 'Alíquota fixa proporcional',          true,  false, false, false, false, false, false, false),
  ('222', 'Redução de Base de Cálculo',          true,  true,  false, false, false, false, false, false),
  ('400', 'Isenção',                             false, false, false, false, false, false, false, false),
  ('410', 'Imunidade e não incidência',          false, false, false, false, false, false, false, false),
  ('510', 'Diferimento',                         true,  false, false, false, true,  false, false, false),
  ('515', 'Diferimento com redução de alíquota', true,  false, true,  false, true,  false, false, false),
  ('550', 'Suspensão',                           true,  false, false, false, false, false, false, false),
  ('620', 'Tributação Monofásica',               false, false, false, false, false, true,  false, false),
  ('800', 'Transferência de crédito',            false, false, false, true,  false, false, false, false),
  ('810', 'Ajuste de IBS na ZFM',                false, false, false, false, false, false, true,  false),
  ('811', 'Ajustes',                             false, false, false, false, false, false, false, true),
  ('820', 'Tributação em documento específico',  false, false, false, false, false, false, false, false),
  ('830', 'Exclusão da Base de Cálculo',         true,  false, false, false, false, false, false, false)
ON CONFLICT (codigo) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 2. cClassTrib — 164 códigos oficiais
--
-- CRIADA VAZIA DE PROPÓSITO. A pesquisa confirmou a existência e a contagem
-- dos 164 códigos ("Exibindo 164 de 164 registros") e a distribuição por CST,
-- mas o relatório entregue não trouxe as 164 linhas em si — elas ficaram no
-- relatório de origem, a ser fornecido à parte.
--
-- Semear parcialmente uma tabela de enquadramento fiscal seria PIOR que
-- deixá-la vazia: alguém leria as poucas linhas presentes como se fossem a
-- tabela inteira. Vazia, `validarDeclaracao()` falha fechada e recusa a
-- emissão com IBSCBS até a importação acontecer. Ver PENDENCIAS_C5.
--
-- A view `cclasstrib_conferencia` abaixo compara o que foi importado com a
-- contagem oficial por CST, para que a importação seja verificável em vez de
-- "parece que deu certo".
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cclasstrib_ibscbs (
  codigo            TEXT PRIMARY KEY CHECK (codigo ~ '^[0-9]{6}$'),
  cst               TEXT NOT NULL REFERENCES cst_ibscbs(codigo),
  descricao         TEXT NOT NULL,
  -- Percentuais em FRAÇÃO (0.60 = 60%), coerente com o resto do domínio.
  perc_reducao_ibs  NUMERIC(6,4) CHECK (perc_reducao_ibs IS NULL OR (perc_reducao_ibs >= 0 AND perc_reducao_ibs <= 1)),
  perc_reducao_cbs  NUMERIC(6,4) CHECK (perc_reducao_cbs IS NULL OR (perc_reducao_cbs >= 0 AND perc_reducao_cbs <= 1)),
  ind_trib_regular  BOOLEAN NOT NULL DEFAULT false,
  ind_cred_pres     BOOLEAN NOT NULL DEFAULT false,
  ind_estorno_cred  BOOLEAN NOT NULL DEFAULT false,
  -- 1-Fixa · 2-Padrão · 3-Sem Alíquota · 4-Uniforme Nacional · 5-Uniforme Setorial
  tipo_aliquota     SMALLINT CHECK (tipo_aliquota IS NULL OR tipo_aliquota BETWEEN 1 AND 5),
  artigo_lc214      TEXT,
  url_dispositivo   TEXT,
  -- Lacuna 3 da pesquisa: dIniVig/dFimVig não foram expostos na extração ao
  -- vivo. Ficam nullable para receber o versionamento histórico quando vierem.
  vigencia_inicio   DATE,
  vigencia_fim      DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Regra estrutural da tabela oficial: os 3 primeiros dígitos do cClassTrib
  -- repetem o CST. Vale como constraint de banco, não só de aplicação.
  CONSTRAINT chk_cclasstrib_prefixo_cst CHECK (left(codigo, 3) = cst)
);

COMMENT ON TABLE cclasstrib_ibscbs IS
  'Código de Classificação Tributária IBS/CBS (6 dígitos = CST + sequencial). '
  '164 códigos oficiais. CRIADA VAZIA: importar do Portal da Conformidade Fácil '
  '(SVRS/ENCAT) antes de habilitar o grupo IBSCBS. Conferir com a view '
  'cclasstrib_conferencia.';

CREATE INDEX IF NOT EXISTS idx_cclasstrib_cst ON cclasstrib_ibscbs(cst);


-- ----------------------------------------------------------------------------
-- 3. Conferência da importação
--
-- Contagem oficial por CST, da extração de 05/08/2026 (total: 164).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW cclasstrib_conferencia AS
WITH esperado(cst, qtd) AS (
  VALUES ('000', 5), ('010', 2), ('011', 5), ('200', 54), ('220', 3), ('221', 4),
         ('222', 1), ('400', 2), ('410', 38), ('510', 1), ('515', 1), ('550', 25),
         ('620', 7), ('800', 2), ('810', 1), ('811', 3), ('820', 9), ('830', 1)
)
SELECT
  e.cst,
  e.qtd                                   AS esperado,
  count(c.codigo)::INT                    AS importado,
  count(c.codigo)::INT = e.qtd            AS confere
FROM esperado e
LEFT JOIN cclasstrib_ibscbs c ON c.cst = e.cst
GROUP BY e.cst, e.qtd
ORDER BY e.cst;

COMMENT ON VIEW cclasstrib_conferencia IS
  'Compara o que foi importado em cclasstrib_ibscbs com a contagem oficial por '
  'CST (164 no total). Se alguma linha tiver confere=false, a importação está '
  'incompleta ou a tabela oficial mudou de versão.';


-- ----------------------------------------------------------------------------
-- 4. RLS — dados de referência nacional
--
-- Não têm empresa_id porque não pertencem a tenant nenhum. Leitura liberada a
-- usuário autenticado (a UI precisa montar seletores); escrita, a ninguém pela
-- API — só migration e service_role.
-- ----------------------------------------------------------------------------
ALTER TABLE cst_ibscbs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cclasstrib_ibscbs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_cst_ibscbs ON cst_ibscbs;
CREATE POLICY sel_cst_ibscbs ON cst_ibscbs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sel_cclasstrib_ibscbs ON cclasstrib_ibscbs;
CREATE POLICY sel_cclasstrib_ibscbs ON cclasstrib_ibscbs FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE cst_ibscbs        FROM anon;
REVOKE ALL ON TABLE cclasstrib_ibscbs FROM anon;
