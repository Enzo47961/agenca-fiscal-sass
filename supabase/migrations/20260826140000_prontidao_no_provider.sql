-- ---------------------------------------------------------------------------
-- PRONTIDÃO DA EMPRESA JUNTO AO PROVEDOR FISCAL
--
-- O PROBLEMA. Cadastrar 600 CNPJs na Focus era, até aqui, 600 operações
-- manuais: abrir a tela de configurações de cada empresa e subir o certificado,
-- porque o cadastro no provedor só acontecia como efeito colateral do envio do
-- .pfx. A documentação oficial (consultada em 26/08/2026) mostrou que
-- `arquivo_certificado_base64` é OPCIONAL no `POST /v2/empresas` — dá para
-- cadastrar antes, e deixar só a credencial como pendência.
--
-- POR QUE UMA COLUNA DE ESTADO, E NÃO INFERIR DE provider_empresa_id.
-- Inferir de `provider_empresa_id IS NULL` confunde três situações que são
-- diferentes para quem opera a carteira: "nunca tentei", "está em andamento" e
-- "tentei e falhou". Quem tem 600 empresas precisa saber exatamente quantas
-- estão em cada uma — é a diferença entre uma tela acionável e uma tela que só
-- informa. Mesmo raciocínio da máquina de estados de notas_fiscais.
--
-- O CHECK É O QUE IMPEDE MENTIRA DE ESTADO. 'cadastrada' sem
-- provider_empresa_id seria um estado que afirma o que não aconteceu, e mais
-- adiante vai existir uma guarda que libera emissão real olhando justamente
-- para isto. Deixar a coerência a cargo do código significaria confiar em todos
-- os caminhos de escrita, presentes e futuros; o banco recusa e acabou.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_status') THEN
    CREATE TYPE provider_status AS ENUM (
      'pendente',     -- existe aqui, ainda não foi ao provedor
      'cadastrando',  -- job em andamento
      'cadastrada',   -- existe no provedor, com id conhecido
      'falhou'        -- o provedor recusou; provider_erro diz por quê
    );
  END IF;
END $$;

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS provider_status provider_status NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS provider_erro TEXT,
  ADD COLUMN IF NOT EXISTS provider_sincronizado_em TIMESTAMPTZ;

COMMENT ON COLUMN empresas.provider_status IS
  'Situação do cadastro desta empresa junto ao provedor fiscal. Escrita apenas '
  'pelo job de sincronização (service_role).';
COMMENT ON COLUMN empresas.provider_erro IS
  'Última recusa do provedor, como veio. Preservada para diagnóstico — o motivo '
  'costuma ser dado cadastral (IM ausente, município não atendido).';
COMMENT ON COLUMN empresas.provider_sincronizado_em IS
  'Quando o estado acima foi confirmado contra o provedor pela última vez.';

-- Empresas que JÁ tinham id do provedor vieram do fluxo antigo (envio de
-- certificado). Elas estão cadastradas de fato — nascer 'pendente' faria o job
-- tentar recriá-las.
UPDATE empresas
   SET provider_status = 'cadastrada',
       provider_sincronizado_em = COALESCE(provider_sincronizado_em, now())
 WHERE provider_empresa_id IS NOT NULL
   AND provider_status <> 'cadastrada';

-- Coerência de estado, independente de quem escreve.
ALTER TABLE empresas
  DROP CONSTRAINT IF EXISTS empresas_cadastrada_exige_id;
ALTER TABLE empresas
  ADD CONSTRAINT empresas_cadastrada_exige_id
  CHECK (provider_status <> 'cadastrada' OR provider_empresa_id IS NOT NULL);

-- O job varre exatamente isto: o que ainda não está cadastrado. Índice parcial
-- porque, em regime, a esmagadora maioria das linhas está 'cadastrada' e não
-- interessa à varredura.
CREATE INDEX IF NOT EXISTS idx_empresas_provider_pendentes
  ON empresas (provider_status)
  WHERE provider_status <> 'cadastrada';
