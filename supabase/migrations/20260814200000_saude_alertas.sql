-- ============================================================================
-- REGISTRO DE SAÚDE OPERACIONAL
--
-- Guarda o nível apurado a cada mudança. A tabela É o mecanismo de "avisa só
-- quando muda": o vigia compara o nível atual com a última linha e só grava —
-- e só manda e-mail — quando eles diferem.
--
-- Sem isso, um alerta de hora em hora viraria ruído, e ruído a gente aprende a
-- ignorar, que é o oposto do que um alerta serve. É o mesmo raciocínio da PK
-- de `franquia_alertas` e do aviso de prazo na tela de configurações.
--
-- Também vira histórico: dá para responder "quantas vezes ficamos degradados
-- no mês" sem depender de log de aplicação, que expira.
-- ============================================================================

CREATE TABLE saude_alertas (
  id         BIGSERIAL PRIMARY KEY,
  nivel      TEXT        NOT NULL CHECK (nivel IN ('ok','atencao','critico')),
  falhadas   INT         NOT NULL DEFAULT 0,
  concluidas INT         NOT NULL DEFAULT 0,
  presas     INT         NOT NULL DEFAULT 0,
  motivos    TEXT[]      NOT NULL DEFAULT '{}',
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saude_alertas_recentes ON saude_alertas (criado_em DESC);

COMMENT ON TABLE saude_alertas IS
  'Uma linha por MUDANÇA de nível de saúde. Não é log de execução: o vigia roda '
  'de hora em hora e só grava quando o nível muda.';

ALTER TABLE saude_alertas ENABLE ROW LEVEL SECURITY;
-- Sem policy: é dado operacional NOSSO, não de tenant. Nenhum usuário logado
-- tem por que ler a saúde da plataforma inteira.

GRANT SELECT, INSERT ON saude_alertas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE saude_alertas_id_seq TO service_role;
