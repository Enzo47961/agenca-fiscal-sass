-- ============================================================================
-- ÍNDICES DE LISTAGEM  (item M10 da auditoria)
--
-- As duas consultas mais quentes do painel não tinham índice que as cobrisse:
--
-- 1. `notas_fiscais ORDER BY created_at DESC LIMIT 20` filtrando por empresa.
--    Existia `idx_notas_empresa_status (empresa_id, status)`, que serve para a
--    contagem por status, mas não para a ordenação — o Postgres filtrava por
--    empresa e ordenava o resultado inteiro em memória a cada carregamento.
--
-- 2. `clientes ORDER BY nome` filtrando por empresa, agora com paginação
--    (`range()`). `idx_clientes_empresa (empresa_id)` sozinho obriga a ordenar
--    todos os clientes do tenant para devolver 50.
--
-- A ordem das colunas importa: igualdade primeiro (empresa_id), depois a coluna
-- de ordenação, no MESMO sentido do ORDER BY. Assim o índice entrega as linhas
-- já ordenadas e o LIMIT corta cedo, sem sort.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notas_empresa_created_desc
  ON notas_fiscais (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nome
  ON clientes (empresa_id, nome);

-- Faturamento do mês: empresa + status + data de emissão. Parcial em 'emitida'
-- porque é o único status que entra no cálculo — índice menor, e o planner o
-- escolhe justamente na consulta que interessa.
CREATE INDEX IF NOT EXISTS idx_notas_faturamento_mes
  ON notas_fiscais (empresa_id, emitida_em)
  WHERE status = 'emitida';

COMMENT ON INDEX idx_notas_empresa_created_desc IS
  'Cobre a lista de notas recentes do painel (ORDER BY created_at DESC LIMIT 20).';
COMMENT ON INDEX idx_clientes_empresa_nome IS
  'Cobre a listagem paginada de clientes (ORDER BY nome + range).';
COMMENT ON INDEX idx_notas_faturamento_mes IS
  'Parcial: só notas emitidas, para a soma de faturamento do mês corrente.';
