-- ============================================================================
-- FRANQUIA GLOBAL DO PROVIDER — o "risco silencioso" da margem (13/08/2026)
--
-- O PROBLEMA, que é comercial e não técnico. O plano Growth da Focus dá uma
-- franquia GLOBAL de 4.000 notas para a nossa conta inteira. Nós vendemos ao
-- escritório um pool LOCAL de `CNPJs x 100` notas. As duas contas não se
-- encontram:
--
--   Escritório A: 30 CNPJs, pool 3.000, usou 2.500  -> não cobramos excedente
--   Escritório B: 20 CNPJs, pool 2.000, usou 1.800  -> não cobramos excedente
--   -------------------------------------------------------------------------
--   Total emitido: 4.300 contra franquia de 4.000 -> PAGAMOS 300 x R$0,12
--
-- Ninguém estourou o próprio pool, então não há o que faturar. O prejuízo é
-- silencioso: aparece na fatura da Focus, não em lugar nenhum do sistema.
--
-- POR QUE UMA TABELA E NÃO UMA CONSTANTE. Mesmo motivo da tabela de alíquotas
-- de IBS/CBS: o número vem de um contrato que muda sem nos avisar. Quando o
-- plano virar Enterprise, ou a Focus revisar a franquia, isso tem que ser
-- alteração de DADO — não de código com deploy. Constante hardcoded é como a
-- vigência de 2027 virou um bloqueio sem válvula de escape.
--
-- O QUE ESTA MIGRATION NÃO FAZ: bloquear emissão. Nota fiscal não deixa de ser
-- emitida porque a NOSSA margem apertou — o custo de uma nota não emitida é do
-- cliente, e é maior. Isto aqui é instrumento de aviso, e só.
-- ============================================================================

CREATE TABLE franquia_provider (
  id                       BIGSERIAL PRIMARY KEY,
  provider                 TEXT        NOT NULL,
  plano                    TEXT        NOT NULL,
  notas_franquia           INT         NOT NULL CHECK (notas_franquia > 0),
  -- Centavos, regra 15. R$0,12 = 12.
  custo_excedente_centavos INT         NOT NULL CHECK (custo_excedente_centavos >= 0),
  vigencia_inicio          DATE        NOT NULL,
  vigencia_fim             DATE,
  fonte                    TEXT        NOT NULL,
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

COMMENT ON TABLE franquia_provider IS
  'Franquia global contratada junto ao provider fiscal. Alterar aqui quando o '
  'plano mudar — nunca no código.';

-- Só uma vigência aberta por provider: duas linhas sem fim tornariam
-- ambíguo qual franquia vale hoje, e a ambiguidade apareceria como número
-- errado no alerta, que é pior que não ter alerta.
CREATE UNIQUE INDEX uq_franquia_vigente ON franquia_provider (provider)
  WHERE vigencia_fim IS NULL;

INSERT INTO franquia_provider
  (provider, plano, notas_franquia, custo_excedente_centavos, vigencia_inicio, fonte)
VALUES
  ('focusnfe', 'Growth', 4000, 12, '2026-08-13',
   'Documento comercial da Focus NFe: Growth R$548,00, CNPJs ilimitados, '
   'pacote de 4.000 notas, excedente R$0,12 na faixa 4.001-10.000.');

ALTER TABLE franquia_provider ENABLE ROW LEVEL SECURITY;
-- Sem policy: é dado NOSSO, de custo, não de tenant. Nenhum usuário logado tem
-- por que ler a nossa margem. Só o motor (service_role, que ignora RLS).

-- ----------------------------------------------------------------------------
-- Consumo do mês, agregado.
--
-- Conta nota EMITIDA, por `emitida_em`. Nota que falhou não entra: não houve
-- documento na prefeitura.
--
-- RESSALVA HONESTA, registrada aqui porque some do resto: o contrato da Focus
-- diz "cada nota emitida OU RECEBIDA conta como uma unidade". Recebimento
-- acontece fora deste sistema e não temos como contar. Portanto este número é
-- um PISO do consumo real, não o total. O limiar de alerta em 80% existe
-- também por causa disso.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consumo_franquia_mes(p_referencia DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  competencia    DATE,
  notas_emitidas BIGINT,
  franquia       INT,
  custo_excedente_centavos INT,
  dia_do_mes     INT,
  dias_no_mes    INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mes AS (
    SELECT date_trunc('month', p_referencia)::date AS inicio,
           (date_trunc('month', p_referencia) + INTERVAL '1 month')::date AS fim
  ),
  f AS (
    SELECT notas_franquia, custo_excedente_centavos
    FROM franquia_provider
    WHERE vigencia_inicio <= p_referencia
      AND (vigencia_fim IS NULL OR vigencia_fim >= p_referencia)
    ORDER BY vigencia_inicio DESC
    LIMIT 1
  )
  SELECT
    mes.inicio,
    (SELECT count(*) FROM notas_fiscais n
      WHERE n.status = 'emitida'
        AND n.emitida_em >= mes.inicio
        AND n.emitida_em <  mes.fim),
    f.notas_franquia,
    f.custo_excedente_centavos,
    (p_referencia - mes.inicio + 1)::int,
    (mes.fim - mes.inicio)::int
  FROM mes, f;
$$;

-- ----------------------------------------------------------------------------
-- Quem está consumindo. Sem isto o alerta diz "estamos em 85%" e não diz o que
-- fazer — e um alerta sobre o qual não dá para agir vira alerta ignorado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consumo_franquia_por_empresa(
  p_referencia DATE DEFAULT CURRENT_DATE,
  p_limite     INT  DEFAULT 10
)
RETURNS TABLE (empresa_id UUID, razao_social TEXT, notas_emitidas BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.empresa_id, e.razao_social, count(*)
  FROM notas_fiscais n
  JOIN empresas e ON e.id = n.empresa_id
  WHERE n.status = 'emitida'
    AND n.emitida_em >= date_trunc('month', p_referencia)
    AND n.emitida_em <  date_trunc('month', p_referencia) + INTERVAL '1 month'
  GROUP BY n.empresa_id, e.razao_social
  ORDER BY count(*) DESC
  LIMIT GREATEST(p_limite, 0);
$$;

-- ----------------------------------------------------------------------------
-- Registro de alertas já enviados.
--
-- A UNIQUE é o mecanismo de idempotência: um alerta por nível por mês. Sem
-- isso, o vigia diário mandaria o mesmo e-mail 20 dias seguidos, e a partir do
-- terceiro ninguém mais abriria — o mesmo raciocínio do aviso de prazo na tela
-- de configurações: aviso que incomoda vira aviso ignorado.
-- ----------------------------------------------------------------------------
CREATE TABLE franquia_alertas (
  competencia    DATE        NOT NULL,
  nivel          TEXT        NOT NULL CHECK (nivel IN ('atencao','alerta','estouro')),
  notas_emitidas INT         NOT NULL,
  projecao       INT         NOT NULL,
  enviado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (competencia, nivel)
);

COMMENT ON TABLE franquia_alertas IS
  'Um alerta por nível por mês. A PK é o que impede repetição diária.';

ALTER TABLE franquia_alertas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.consumo_franquia_mes        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consumo_franquia_por_empresa FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumo_franquia_mes         TO service_role;
GRANT EXECUTE ON FUNCTION public.consumo_franquia_por_empresa TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON franquia_provider, franquia_alertas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE franquia_provider_id_seq TO service_role;
