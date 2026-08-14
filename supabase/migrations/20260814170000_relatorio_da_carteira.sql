-- ============================================================================
-- RELATÓRIO CONSOLIDADO DA CARTEIRA (painel de parceiro)
--
-- O escritório opera dezenas de CNPJs e hoje só enxerga UM por vez — o da
-- empresa ativa. Para fechar o mês, conferir o que cada cliente emitiu ou
-- descobrir quem parou de emitir, ele precisaria trocar de empresa dezenas de
-- vezes e anotar num papel.
--
-- POR QUE UMA FUNÇÃO E NÃO CONSULTAS NA APLICAÇÃO. Seriam N+1 consultas — uma
-- por empresa — e a carteira grande é justamente o caso que interessa. Aqui é
-- uma varredura só, agregada no banco.
--
-- O ALCANCE VEM DOS VÍNCULOS, NÃO DE PARÂMETRO. A função não recebe lista de
-- empresas: ela usa `empresas_do_usuario()`. Assim não existe parâmetro para
-- forjar — quem decide o que aparece é a tabela de vínculos, e o pior que
-- alguém consegue é ver a própria carteira.
--
-- SECURITY DEFINER com filtro explícito por `auth.uid()`: o mesmo padrão das
-- outras funções do projeto. Sem o filtro, DEFINER veria tudo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.relatorio_carteira(
  p_inicio DATE,
  p_fim    DATE
)
RETURNS TABLE (
  empresa_id        UUID,
  razao_social      TEXT,
  nome_fantasia     TEXT,
  cnpj              TEXT,
  papel             membro_papel,
  emitidas          BIGINT,
  canceladas        BIGINT,
  falhadas          BIGINT,
  em_andamento      BIGINT,
  faturado_centavos BIGINT,
  ultima_emissao    TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH minhas AS (
    SELECT m.empresa_id, m.papel
    FROM empresa_membros m
    WHERE m.user_id = auth.uid()
  ),
  -- `p_fim` é INCLUSIVO na tela ("de 01/08 a 31/08"), então o intervalo aqui
  -- vai até o dia seguinte, exclusivo. Comparar `<= p_fim` contra TIMESTAMPTZ
  -- perderia tudo que foi emitido depois da meia-noite do último dia.
  periodo AS (
    SELECT p_inicio::timestamptz AS de, (p_fim + 1)::timestamptz AS ate
  )
  SELECT
    e.id,
    e.razao_social,
    e.nome_fantasia,
    e.cnpj,
    minhas.papel,
    count(*) FILTER (WHERE n.status = 'emitida'),
    count(*) FILTER (WHERE n.status = 'cancelada'),
    count(*) FILTER (WHERE n.status = 'falhou'),
    count(*) FILTER (WHERE n.status IN ('pendente','reprocessando','cancelando')),
    -- Só nota EMITIDA soma faturamento. Cancelada saiu do mundo; falhada nunca
    -- entrou. Somar as três daria um número que não bate com nada.
    coalesce(sum(n.valor_servico_centavos) FILTER (WHERE n.status = 'emitida'), 0)::bigint,
    max(n.emitida_em) FILTER (WHERE n.status = 'emitida')
  FROM minhas
  JOIN empresas e ON e.id = minhas.empresa_id
  -- LEFT JOIN de propósito: empresa sem nota nenhuma no período PRECISA
  -- aparecer, com zeros. É justamente o cliente que parou de emitir — a linha
  -- mais útil do relatório para quem quer agir.
  LEFT JOIN notas_fiscais n
    ON n.empresa_id = e.id
   AND n.created_at >= (SELECT de FROM periodo)
   AND n.created_at <  (SELECT ate FROM periodo)
  GROUP BY e.id, e.razao_social, e.nome_fantasia, e.cnpj, minhas.papel
  ORDER BY e.razao_social;
$$;

COMMENT ON FUNCTION public.relatorio_carteira IS
  'Consolidado por empresa da carteira do usuário logado, no período. Empresa '
  'sem nota aparece com zeros — é o cliente que parou de emitir.';

REVOKE ALL ON FUNCTION public.relatorio_carteira FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_carteira TO authenticated;
