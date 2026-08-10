-- ============================================================================
-- BASE DE CÁLCULO DO IBS/CBS EM notas_fiscais  (item B7 da auditoria pós-C5)
--
-- Até aqui o sistema usava `valor_servico_centavos` — o valor BRUTO — como base
-- do IBS/CBS. A base da NFS-e não é o bruto: é o bruto menos um conjunto de
-- deduções. Usar o bruto superestima a base e, com ela, o tributo destacado.
--
-- FÓRMULA (Nota Técnica SE/CGNFS-e nº 009/2026, v1.0.1):
--
--   até 2026:    vBC = vServ − descIncond − ajusteBC − vISSQN − vPIS − vCOFINS
--   2027 a 2032: vBC = vServ − descIncond − ajusteBC − vISSQN
--
-- `ajusteBC` é `vCalcAjusteBCIBSCBS` OU `vCalcAjusteBCLocImoveis` — as duas
-- ocupam o mesmo lugar na fórmula, cada uma para um tipo de operação. A NT-009
-- atualiza a NT-004 (que chamava o campo de `vCalcReeRepRes`), sem revogá-la.
--
-- POR QUE GUARDAR OS COMPONENTES, E NÃO SÓ O RESULTADO: a base é o número que
-- o Fisco confere. Guardar só o total tornaria impossível provar como ele foi
-- obtido depois que alíquota, fórmula ou dados de entrada mudarem. Cada coluna
-- aqui é um termo da fórmula.
--
-- Espelho em código: `calcularBaseIbsCbs()` em src/lib/fiscal/reforma.ts.
-- ============================================================================

-- Tipo do ajuste — diz QUAL tag da DPS carrega o valor. Um ajuste sem tipo
-- sairia no XML sem endereço.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_ajuste_base_ibscbs') THEN
    CREATE TYPE tipo_ajuste_base_ibscbs AS ENUM ('ibscbs', 'loc_imoveis');
  END IF;
END $$;

COMMENT ON TYPE tipo_ajuste_base_ibscbs IS
  'ibscbs = vCalcAjusteBCIBSCBS (glosa de saúde, operações de terceiros); '
  'loc_imoveis = vCalcAjusteBCLocImoveis (locação de bens imóveis, subitem 99.03).';

ALTER TABLE notas_fiscais
  -- descIncond. O desconto CONDICIONADO não entra na fórmula.
  ADD COLUMN IF NOT EXISTS desconto_incondicionado_centavos INTEGER NOT NULL DEFAULT 0,

  -- vCalcAjusteBCIBSCBS ou vCalcAjusteBCLocImoveis, conforme o tipo.
  ADD COLUMN IF NOT EXISTS ajuste_base_centavos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ajuste_base_tipo     tipo_ajuste_base_ibscbs,

  -- vISSQN. Guardamos o valor EFETIVAMENTE usado, derivado ou informado, para
  -- que a base seja reproduzível só com o que está gravado nesta linha.
  ADD COLUMN IF NOT EXISTS issqn_centavos  INTEGER NOT NULL DEFAULT 0,

  -- vPIS e vCOFINS — existem só até 2026.
  ADD COLUMN IF NOT EXISTS pis_centavos    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cofins_centavos INTEGER NOT NULL DEFAULT 0,

  -- vBC: o resultado. Nullable porque as notas anteriores a esta migration não
  -- têm base calculada, e preenchê-las com o valor bruto repetiria justamente o
  -- erro que estamos corrigindo. NULL aqui significa "nota do modelo antigo".
  ADD COLUMN IF NOT EXISTS ibscbs_base_centavos INTEGER;

COMMENT ON COLUMN notas_fiscais.ibscbs_base_centavos IS
  'vBC do IBS/CBS (NT SE/CGNFS-e 009/2026). NULL = nota criada antes da '
  'implementação da fórmula; NÃO equivale a valor_servico_centavos.';

-- ---------------------------------------------------------------------------
-- Integridade. Segunda camada: mesmo que a validação em TypeScript falhe por
-- bug, o insert é recusado aqui (mesmo padrão do grupo IBSCBS).
-- ---------------------------------------------------------------------------

ALTER TABLE notas_fiscais
  DROP CONSTRAINT IF EXISTS chk_componentes_bc_nao_negativos,
  DROP CONSTRAINT IF EXISTS chk_ajuste_base_tem_tipo,
  DROP CONSTRAINT IF EXISTS chk_pis_cofins_ate_2026,
  DROP CONSTRAINT IF EXISTS chk_base_ibscbs_nao_negativa;

ALTER TABLE notas_fiscais
  ADD CONSTRAINT chk_componentes_bc_nao_negativos CHECK (
    desconto_incondicionado_centavos >= 0
    AND ajuste_base_centavos >= 0
    AND issqn_centavos >= 0
    AND pis_centavos >= 0
    AND cofins_centavos >= 0
  ),

  -- Valor sem tipo não tem tag onde sair no XML.
  ADD CONSTRAINT chk_ajuste_base_tem_tipo CHECK (
    ajuste_base_centavos = 0 OR ajuste_base_tipo IS NOT NULL
  ),

  -- PIS/COFINS deixam de existir em 2027. Reivindicar a dedução depois disso é
  -- erro de dado, não caso de borda. EXTRACT sobre DATE é imutável, então pode
  -- entrar em CHECK.
  ADD CONSTRAINT chk_pis_cofins_ate_2026 CHECK (
    EXTRACT(YEAR FROM competencia) <= 2026
    OR (pis_centavos = 0 AND cofins_centavos = 0)
  ),

  -- Deduções maiores que o valor do serviço: preferimos recusar a gravar zero,
  -- pelo mesmo motivo do código — zerar em silêncio emite nota com base errada
  -- e aparência de correta.
  ADD CONSTRAINT chk_base_ibscbs_nao_negativa CHECK (
    ibscbs_base_centavos IS NULL OR ibscbs_base_centavos >= 0
  );
