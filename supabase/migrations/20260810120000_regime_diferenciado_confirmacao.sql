-- ============================================================================
-- CONFIRMAÇÃO DE ELEGIBILIDADE DO REGIME DIFERENCIADO  (item C7 da auditoria)
--
-- Até aqui, qualquer operador marcava "redução de 60%" em qualquer nota. Nada
-- ligava a escolha a CNAE, atividade ou NBS: era um <select> livre. Em 2026 a
-- apuração é informativa e o erro é um número errado na nota; a partir de
-- 01/01/2027 vira recolhimento a menor, com o tenant exposto.
--
-- O QUE ESTA MIGRATION FAZ, E O QUE NÃO FAZ. Ela não valida elegibilidade —
-- validar de verdade exige a correlação CNAE/atividade ↔ regime, que é decisão
-- contábil e não existe ainda (segue como pendência). O que ela faz é tirar o
-- "cliquei sem ver": regime diferente de `padrao` passa a exigir uma
-- confirmação explícita, e a confirmação fica REGISTRADA na nota — quem
-- confirmou e quando. Isso não impede o erro, mas cria a trilha de auditoria
-- que hoje não existe, e é o que dá para sustentar sem inventar norma.
--
-- Espelho em código: `solicitarEmissaoSchema` em src/services/notas.ts.
-- ============================================================================

ALTER TABLE notas_fiscais
  -- Quem confirmou. Vem sempre de auth.uid() na Server Action, nunca do
  -- cliente. ON DELETE SET NULL e não CASCADE: se o usuário for removido, a
  -- NOTA não pode sumir junto — é documento fiscal. Perde-se o autor, não o
  -- registro, e o `_em` abaixo continua provando que houve confirmação.
  ADD COLUMN IF NOT EXISTS regime_confirmado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regime_confirmado_em  TIMESTAMPTZ;

COMMENT ON COLUMN notas_fiscais.regime_confirmado_por IS
  'Usuário que confirmou o enquadramento em regime diferenciado (C7). NULL '
  'quando regime_ibscbs = padrao, ou quando o autor foi removido depois.';

COMMENT ON COLUMN notas_fiscais.regime_confirmado_em IS
  'Quando a confirmação foi dada. Sobrevive à remoção do usuário, então é ele '
  'que prova que a confirmação existiu.';

-- ---------------------------------------------------------------------------
-- Integridade. Segunda camada, mesmo padrão do grupo IBSCBS e do vBC: ainda
-- que a validação em TypeScript falhe por bug, o insert é recusado aqui.
-- ---------------------------------------------------------------------------

ALTER TABLE notas_fiscais
  DROP CONSTRAINT IF EXISTS chk_regime_diferenciado_confirmado;

-- NOT VALID de propósito. A regra vale para tudo que for gravado DAQUI PARA A
-- FRENTE, que é o objetivo; as notas criadas antes dela existir não são
-- reprovadas retroativamente. Elas não têm como ter a confirmação — ninguém
-- pediu — e derrubar a migration por causa delas só criaria a tentação de
-- preencher a coluna com um valor inventado, que é pior que a ausência: um
-- registro de auditoria falso.
--
-- Para validar o passado depois de um backfill consciente:
--   ALTER TABLE notas_fiscais VALIDATE CONSTRAINT chk_regime_diferenciado_confirmado;
ALTER TABLE notas_fiscais
  ADD CONSTRAINT chk_regime_diferenciado_confirmado CHECK (
    regime_ibscbs = 'padrao'
    OR (regime_confirmado_por IS NOT NULL AND regime_confirmado_em IS NOT NULL)
  ) NOT VALID;

-- Consulta de auditoria previsível: "que notas foram enquadradas em regime
-- diferenciado, por quem e quando". Parcial porque o caso `padrao` é a
-- maioria esmagadora das linhas e não interessa aqui.
CREATE INDEX IF NOT EXISTS idx_notas_regime_confirmacao
  ON notas_fiscais (empresa_id, regime_confirmado_em DESC)
  WHERE regime_ibscbs <> 'padrao';
