-- ============================================================================
-- CONVERGÊNCIA DE PRIVILÉGIOS ENTRE AMBIENTES
-- (defeito encontrado em 12/08/2026, ao aplicar as 17 migrations pendentes no
--  projeto hospedado spxiaucinjsgbipaormf pela primeira vez)
--
-- O QUE ESTAVA ERRADO. A migration 20260810180000 concede a `authenticated`
-- exatamente o recorte de cada policy — e comenta, nas suas linhas 72-76, que
-- UPDATE em `notas_fiscais` fica DE FORA de propósito, porque mudar status é
-- atribuição exclusiva de `transicionar_status_nota()`.
--
-- Ela cumpre isso em banco novo, mas NÃO em banco que já existia: ela só
-- concede e só revoga do `anon`. Nunca retira do `authenticated` o que ele já
-- tivesse antes. Medido nos dois ambientes, mesma migration, resultado
-- diferente:
--
--   notas_fiscais / authenticated
--     local (db reset)  → arDxtm     ..... INSERT + SELECT, como projetado
--     produção          → arwdDxtm   ..... + UPDATE (w) + DELETE (d)
--
-- A divergência valia para 14 das 15 relações (só `clientes` coincidia, porque
-- ali o CRUD é intencional). A causa é a data: o projeto hospedado nasceu em
-- 05/07/2026 carregando as default privileges ANTIGAS do Supabase, que
-- concediam ALL a anon e authenticated. O comentário da 20260810180000 diz que
-- esse padrão "mudou" — mudou para projetos criados pelo CLI atual, não para
-- este.
--
-- HAVIA BRECHA? Não em produção hoje. `notas_fiscais` tem policy apenas de
-- INSERT e SELECT; sem policy de UPDATE, o RLS não deixa nenhuma linha
-- qualificar, e o comando afeta zero linhas mesmo com o privilégio. O que se
-- perdeu foi a segunda camada: a máquina de estados passou a ser defendida só
-- pelo RLS. Basta alguém escrever uma policy de UPDATE para outro fim — um
-- "editar rascunho", por exemplo — e a porta abre sem que ninguém tenha
-- decidido abri-la. Defesa em profundidade existe para o dia em que a primeira
-- camada muda.
--
-- POR QUE UMA MIGRATION NOVA. Regra 14: migrations são imutáveis. Editar a
-- 20260810180000 não alcançaria este banco, onde ela já consta como aplicada.
--
-- IDEMPOTENTE E NEUTRA NO LOCAL. Revogar privilégio não detido é no-op, e o
-- que se revoga aqui é imediatamente reconcedido onde a policy justifica. Num
-- `db reset` este arquivo não muda nada — ele existe para os ambientes que
-- carregam história.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabelas e views: zera a escrita de `authenticated` e reconcede o recorte.
--
-- SELECT não entra no revoke: ele está correto nos dois ambientes, e derrubá-lo
-- para reerguer criaria uma janela desnecessária. Aqui se corrige escrita.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Reconcede, idêntico ao critério da 20260810180000.

-- Configurações da empresa: a tela salva dados fiscais e provider. Sem DELETE —
-- não existe fluxo de apagar empresa.
GRANT UPDATE ON TABLE empresas TO authenticated;

-- Clientes: CRUD completo pela tela, com RLS limitando ao tenant (policy ALL).
GRANT INSERT, UPDATE, DELETE ON TABLE clientes TO authenticated;

-- Notas: cria pela tela (status `pendente`, regra 5). UPDATE e DELETE seguem
-- fora — é o ponto inteiro desta migration.
GRANT INSERT ON TABLE notas_fiscais TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sequences: `authenticated` precisa de UPDATE (nextval) e nada além.
--
-- Alvo medido no local: authenticated=w. Produção trazia rwU do padrão antigo.
-- ---------------------------------------------------------------------------
REVOKE SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reafirma o bloqueio do `anon`. Nada neste produto é acessível sem sessão.
-- ---------------------------------------------------------------------------
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

-- ---------------------------------------------------------------------------
-- 4. A causa raiz: as default privileges.
--
-- Sem isto, os passos 1 a 3 corrigem só o presente. Em produção, o padrão de
-- `postgres` para tabelas novas ainda era:
--
--   anon=arwdDxtm | authenticated=arwdDxtm
--
-- ou seja, a PRÓXIMA migration que criasse uma tabela nasceria com escrita
-- aberta para qualquer usuário logado — e o defeito voltaria meses depois,
-- longe da causa, que é precisamente o cenário que a 20260810180000 tentava
-- evitar na sua seção 4.
--
-- Alvo (medido no local): tabelas → Dxtm; sequences → w.
-- `service_role` não é tocado: a 20260810180000 já o configura, e ele ignora
-- RLS por definição.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, USAGE ON SEQUENCES FROM anon, authenticated;
