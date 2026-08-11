-- ============================================================================
-- DOCUMENTOS QUE AJUSTAM A BASE DE CÁLCULO DO IBS/CBS  (gReeRepRes)
--
-- O ajuste de base nunca foi um valor a digitar. A DPS referencia os DOCUMENTOS
-- que originam o reembolso/repasse/ressarcimento — um a um, com tipo,
-- identificação e valor — e o Ambiente de Dados Nacional soma, produzindo
-- `vCalcAjusteBCIBSCBS` do lado NFS-e (o prefixo `vCalc` é a pista).
--
-- Até aqui `ajuste_base_centavos` era um total digitado que NÃO tinha como ser
-- transmitido: a nota saía com base maior que a nossa prévia, em silêncio. Por
-- isso a versão anterior recusava a emissão. Esta migration troca o total livre
-- pela lista, e o total passa a ser derivado dela.
--
-- POR QUE JSONB E NÃO TABELA FILHA. A alternativa relacional exigiria inserir a
-- nota e depois os documentos — duas operações, sem transação entre elas no
-- caminho do PostgREST. Se a segunda falhasse, sobraria uma nota declarando
-- ajuste sem os documentos que o justificam: exatamente a divergência silenciosa
-- que este trabalho existe para eliminar. Com JSONB o insert é UM só e a
-- atomicidade é de graça.
--
-- O que se perde é consulta relacional entre notas — e não há caso de uso para
-- isso: os documentos são payload da nota, lidos junto com ela, nunca agregados
-- entre si. Mesmo raciocínio de `notas_fiscais_tentativas.payload_erro`.
--
-- Espelho em código: src/lib/fiscal/ajuste-base.ts.
-- FONTE: referência de campos da Focus para NFS-e nacional (grupo
-- `documentos_referenciados`, coleção 1-100) e Anexo VI V1.04.00.
-- ============================================================================

ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS documentos_ajuste_base JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN notas_fiscais.documentos_ajuste_base IS
  'Documentos referenciados que ajustam a base do IBS/CBS (gReeRepRes). Lista, '
  'nunca um total: quem soma e o Ambiente de Dados Nacional. '
  '`ajuste_base_centavos` e derivado desta coluna.';

ALTER TABLE notas_fiscais
  DROP CONSTRAINT IF EXISTS chk_documentos_ajuste_base_array,
  DROP CONSTRAINT IF EXISTS chk_ajuste_base_exige_documentos;

ALTER TABLE notas_fiscais
  ADD CONSTRAINT chk_documentos_ajuste_base_array CHECK (
    jsonb_typeof(documentos_ajuste_base) = 'array'
    AND jsonb_array_length(documentos_ajuste_base) <= 100
  ),

  -- A amarração que impede o estado que motivou tudo isto: ajuste sem os
  -- documentos que o originam, ou documentos sem ajuste correspondente. Não
  -- confere a SOMA — isso é do código, e duplicar aritmética no CHECK só criaria
  -- duas verdades — mas garante que os dois lados existam ou não existam juntos.
  ADD CONSTRAINT chk_ajuste_base_exige_documentos CHECK (
    (ajuste_base_centavos = 0 AND jsonb_array_length(documentos_ajuste_base) = 0)
    OR (ajuste_base_centavos > 0 AND jsonb_array_length(documentos_ajuste_base) > 0)
  );

-- Consulta de auditoria: quais notas tiveram base ajustada, por empresa.
-- Parcial porque a esmagadora maioria das notas não tem ajuste nenhum.
CREATE INDEX IF NOT EXISTS idx_notas_com_ajuste_base
  ON notas_fiscais (empresa_id, competencia DESC)
  WHERE ajuste_base_centavos > 0;
