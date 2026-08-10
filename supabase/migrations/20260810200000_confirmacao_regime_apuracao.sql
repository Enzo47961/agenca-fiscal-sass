-- ============================================================================
-- CONFIRMAÇÃO DA OPÇÃO DE REGIME DE APURAÇÃO (prazo de setembro/2026)
--
-- O art. 41, § 3º da LC 214/2025 dá ao optante pelo Simples Nacional a escolha
-- de apurar IBS/CBS pelo regime regular. A comunicação da escolha tem prazo:
-- setembro de 2026. Quem não se manifestar permanece no regime unificado.
--
-- O PROBLEMA QUE ESTA COLUNA RESOLVE. Depois do A6 a empresa tem
-- `regime_apuracao_ibscbs_sn`, mas o valor de quem NUNCA abriu a tela é
-- `ambos_pelo_sn` — exatamente o mesmo de quem abriu, leu e decidiu ficar no
-- unificado. São situações diferentes e o banco não as distinguia: uma precisa
-- de aviso antes do prazo, a outra não.
--
-- Não dá para inferir pela `data_opcao_regime_regular`: ela só existe para quem
-- optou pelo regular, então o caso "decidiu ficar no unificado" continuaria
-- indistinguível do "nunca viu".
--
-- SEMÂNTICA: NULL = ninguém confirmou nada, o valor atual é o default de
-- onboarding. Preenchida = alguém salvou a tela de dados fiscais com o bloco de
-- apuração visível, o que é manifestação. Não é registro de quem comunicou ao
-- Fisco — isso acontece fora daqui — e sim de que a escolha no sistema foi
-- consciente.
-- ============================================================================

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS regime_apuracao_confirmado_em TIMESTAMPTZ;

COMMENT ON COLUMN empresas.regime_apuracao_confirmado_em IS
  'Quando o usuario confirmou a opcao de apuracao de IBS/CBS no Simples '
  '(art. 41 §3 da LC 214/2025, prazo de setembro/2026). NULL = valor ainda e o '
  'default de onboarding e ninguem decidiu. Nao registra a comunicacao ao '
  'Fisco, que acontece fora do sistema.';

-- Consulta previsível para "quem ainda não decidiu e está sob o prazo".
-- Parcial porque quem não é optante não tem escolha a fazer.
CREATE INDEX IF NOT EXISTS idx_empresas_apuracao_nao_confirmada
  ON empresas (situacao_simples_nacional)
  WHERE regime_apuracao_confirmado_em IS NULL
    AND situacao_simples_nacional <> 'nao_optante';
