-- ---------------------------------------------------------------------------
-- MAPA DOS MUNICÍPIOS PARA NFS-e
--
-- POR QUE ISTO EXISTE. A Focus respondeu em 27/08/2026 que não há fluxo
-- recomendado para onboarding em escala, e que "é preciso validar a emissão em
-- CADA EMPRESA". Mas a API de municípios dela devolve, por município, os dados
-- que permitem descartar a maior parte das tentativas ANTES de gastá-las: se a
-- NFS-e está habilitada, se existe ambiente de homologação, quais campos são
-- obrigatórios e se o serviço está no ar.
--
-- Cachear isso muda a economia do onboarding. Sem o cache, descobrir que um
-- município não tem homologação custaria uma tentativa de emissão por empresa
-- daquele município. Com ele, custa uma consulta por município — e o país
-- inteiro cabe em 56 requisições de 100 registros.
--
-- É TABELA DE REFERÊNCIA, NÃO DE TENANT. Não tem `empresa_id` e não deve ter:
-- o fato de Fortaleza exigir certificado não pertence a nenhum escritório. Segue
-- o mesmo desenho de `cst_ibscbs` e `cclasstrib_ibscbs` — leitura para todo
-- autenticado, escrita só pelo job (service_role).
--
-- O QUE ESTA TABELA NÃO SABE, e é bom estar escrito: quando
-- `requer_certificado` é falso, ela não diz qual é a alternativa (login e senha
-- da prefeitura, ou token de fornecedor terceiro — os dois existem). E
-- `possui_homologacao` significa "é possível", não "está pronto": há municípios
-- em que o ambiente existe mas depende de liberação manual, pedido por e-mail
-- ou token obtido fora da API.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS municipios_nfse (
  codigo_ibge   TEXT PRIMARY KEY CHECK (codigo_ibge ~ '^[0-9]{7}$'),
  nome          TEXT NOT NULL,
  uf            TEXT NOT NULL CHECK (char_length(uf) = 2),

  -- Elegibilidade e ambiente
  nfse_habilitada     BOOLEAN NOT NULL DEFAULT false,
  possui_homologacao  BOOLEAN,
  possui_cancelamento BOOLEAN,
  requer_certificado  BOOLEAN,
  provedor            TEXT,

  -- Situação operacional. `status` é texto livre de propósito: os valores vêm
  -- do provedor ("ativo", "fora do ar", "pausado"...) e enumerá-los aqui faria
  -- a sincronização quebrar no dia em que ele acrescentar um.
  status                     TEXT,
  previsao_reimplementacao   DATE,
  ultima_emissao             TIMESTAMPTZ,

  -- Campos que AQUELE município exige. É o que permite a validação local, de
  -- custo zero, antes de qualquer tentativa de emissão.
  endereco_obrigatorio            BOOLEAN,
  cpf_cnpj_obrigatorio            BOOLEAN,
  cnae_obrigatorio                BOOLEAN,
  item_lista_servico_obrigatorio  BOOLEAN,
  codigo_tributario_obrigatorio   BOOLEAN,

  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE municipios_nfse IS
  'Cache do mapa de municípios do provedor fiscal. Referência, não dado de '
  'tenant: sem empresa_id e sem RLS por carteira.';
COMMENT ON COLUMN municipios_nfse.possui_homologacao IS
  'Se o município TEM ambiente de teste. Não garante que ele esteja liberado '
  'para a empresa — há casos que exigem pedido no portal ou por e-mail.';
COMMENT ON COLUMN municipios_nfse.requer_certificado IS
  'Falso NÃO significa "sem credencial": pode ser login/senha da prefeitura ou '
  'token de fornecedor terceiro. A API não distingue.';

-- A varredura que interessa é "municípios onde dá para testar", e ela roda
-- toda vez que alguém prepara uma carteira.
CREATE INDEX IF NOT EXISTS idx_municipios_nfse_testaveis
  ON municipios_nfse (codigo_ibge)
  WHERE nfse_habilitada = true AND possui_homologacao = true;

ALTER TABLE municipios_nfse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_municipios_nfse ON municipios_nfse;
CREATE POLICY sel_municipios_nfse ON municipios_nfse
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE municipios_nfse FROM anon;
GRANT SELECT ON TABLE municipios_nfse TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE municipios_nfse TO service_role;
