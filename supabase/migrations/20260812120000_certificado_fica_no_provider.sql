-- ============================================================================
-- O CERTIFICADO A1 DEIXA DE SER ARMAZENADO POR NÓS
--
-- DECISÃO (12/08/2026, do usuário, após confirmação do suporte da Focus): o
-- certificado passa a ser enviado ao provider e NÃO é mais guardado aqui.
--
-- POR QUE. O A1 assina documento fiscal em nome da empresa — quem tem o arquivo
-- e a senha assume obrigações no CNPJ dela. Com o multi-empresa, passaríamos a
-- guardar certificados de TERCEIROS (os clientes do escritório de
-- contabilidade), e esse risco não é diluível: por melhor que fosse a
-- criptografia, o dano de um vazamento seria jurídico, não técnico.
--
-- O provider já precisa do certificado para assinar e já é responsável por
-- guardá-lo. Repassar e não manter cópia não é transferir risco: é deixar de
-- criar um segundo lugar de onde ele pode vazar.
--
-- O que a arquitetura anterior tinha de bom — AES-256-GCM, bucket privado,
-- validação de magic bytes — continuava sendo mitigação de um risco que agora
-- simplesmente não existe. A validação de magic bytes PERMANECE no código: ela
-- rejeita arquivo que não é PFX antes de mandar para a Focus, poupando uma ida
-- de rede e devolvendo erro melhor.
--
-- Endpoints confirmados na referência da Focus:
--   POST /v2/empresas       cria a empresa com arquivo_certificado_base64
--   PUT  /v2/empresas/{id}  troca o certificado de empresa já criada
-- O retorno traz certificado_valido_ate, que é o que permite avisar antes do
-- vencimento em vez de descobrir na nota rejeitada.
-- ============================================================================

ALTER TABLE empresas
  -- Id da empresa no provider. Sem ele não dá para TROCAR o certificado depois:
  -- o PUT precisa do id, e recriar a empresa duplicaria cadastro no provider.
  ADD COLUMN IF NOT EXISTS provider_empresa_id TEXT,
  -- Espelho do que o provider devolveu. Guardamos a VALIDADE, nunca o
  -- certificado: a data é o que a tela precisa para avisar, e não é segredo.
  ADD COLUMN IF NOT EXISTS certificado_valido_de  DATE,
  ADD COLUMN IF NOT EXISTS certificado_valido_ate DATE,
  ADD COLUMN IF NOT EXISTS certificado_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS certificado_enviado_em TIMESTAMPTZ;

COMMENT ON COLUMN empresas.provider_empresa_id IS
  'Id da empresa no provider fiscal. Necessario para trocar o certificado '
  '(PUT /v2/empresas/{id}) sem duplicar cadastro.';
COMMENT ON COLUMN empresas.certificado_valido_ate IS
  'Validade informada pelo provider. O certificado em si NAO fica neste '
  'sistema — apenas esta data, para avisar antes do vencimento.';

-- Consulta do aviso de vencimento: "quais empresas vencem nos proximos N dias".
-- Parcial porque empresa sem certificado enviado nao interessa a essa varredura.
CREATE INDEX IF NOT EXISTS idx_empresas_certificado_vencendo
  ON empresas (certificado_valido_ate)
  WHERE certificado_valido_ate IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Fechamento do armazenamento antigo.
--
-- A policy que permitia gravar no bucket `certificados` é REMOVIDA. Sem ela,
-- `storage.objects` volta a negar por padrão e ninguém — nem código antigo que
-- sobrevivesse a um merge — consegue escrever certificado ali.
--
-- O BUCKET EM SI NÃO É APAGADO AQUI, e não por esquecimento: o Postgres do
-- Supabase recusa `DELETE FROM storage.buckets` com "Direct deletion from
-- storage tables is not allowed. Use the Storage API instead." (SQLSTATE
-- 42501). Remover o bucket é operação da Storage API, fora do alcance de uma
-- migration — está no `npm run certificados:remover-bucket`.
--
-- Deixar a policy cair já elimina o risco prático: bucket sem policy é bucket
-- inacessível. A remoção do bucket é higiene, não segurança.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_certificados_rw ON storage.objects;
