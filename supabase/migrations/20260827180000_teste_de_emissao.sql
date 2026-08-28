-- ---------------------------------------------------------------------------
-- TESTE DE EMISSÃO EM HOMOLOGAÇÃO
--
-- POR QUE ESTE TESTE EXISTE. A Focus foi explícita (27/08/2026): não há
-- endpoint que diga o que falta na configuração de uma empresa, e a forma de
-- descobrir é *"efetuar um teste de emissão e conferir o retorno da API"*. O
-- mapa de municípios já elimina a maior parte das tentativas inúteis; o que
-- sobra só se resolve tentando.
--
-- POR QUE O CÓDIGO DE SERVIÇO É COLETADO, E NÃO ADIVINHADO. Um código inventado
-- que o município recusa produziria a pior resposta possível: "configuração com
-- problema" quando o problema era o nosso chute. Como o teste existe para
-- separar config boa de config ruim, um falso negativo aqui destrói o valor
-- inteiro da funcionalidade.
--
-- Quem sabe o código é o escritório — é a atividade principal do cliente dele,
-- e informá-lo uma vez por empresa é trabalho trivial perto de investigar uma
-- recusa ambígua depois.
--
-- O RESULTADO FICA EM COLUNA PRÓPRIA, e não em `provider_status`. São eixos
-- diferentes: `provider_status` diz se a empresa EXISTE no provedor;
-- `teste_emissao_ok` diz se ela CONSEGUE emitir. Uma empresa pode estar
-- perfeitamente cadastrada e ainda assim ser recusada pela prefeitura por falta
-- de habilitação municipal — e misturar as duas coisas numa coluna só apagaria
-- justamente a distinção que o teste existe para revelar.
-- ---------------------------------------------------------------------------

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS codigo_servico_teste TEXT,
  ADD COLUMN IF NOT EXISTS teste_emissao_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS teste_emissao_ok     BOOLEAN,
  ADD COLUMN IF NOT EXISTS teste_emissao_erro   TEXT;

COMMENT ON COLUMN empresas.codigo_servico_teste IS
  'Código de serviço (LC 116) usado na emissão de teste em homologação. '
  'Informado pelo escritório: adivinhar produziria falso negativo.';
COMMENT ON COLUMN empresas.teste_emissao_ok IS
  'Resultado do último teste. NULL = nunca testada. Eixo distinto de '
  'provider_status: cadastrada não implica apta a emitir.';
COMMENT ON COLUMN empresas.teste_emissao_erro IS
  'Recusa do provedor/prefeitura COMO VEIO. É a única explicação confiável do '
  'que precisa ser corrigido naquela empresa.';

-- Resultado sem data seria afirmação sem quando, e o teste envelhece: uma
-- aprovação de três meses atrás não diz nada sobre a configuração de hoje.
ALTER TABLE empresas
  DROP CONSTRAINT IF EXISTS empresas_teste_exige_data;
ALTER TABLE empresas
  ADD CONSTRAINT empresas_teste_exige_data
  CHECK (teste_emissao_ok IS NULL OR teste_emissao_em IS NOT NULL);

-- A varredura do painel: quem ainda não passou no teste.
CREATE INDEX IF NOT EXISTS idx_empresas_teste_pendente
  ON empresas (teste_emissao_ok)
  WHERE teste_emissao_ok IS DISTINCT FROM true;
