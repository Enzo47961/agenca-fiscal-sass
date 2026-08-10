-- ============================================================================
-- PRIVILÉGIOS DE TABELA  (defeito de disponibilidade encontrado em 10/08/2026)
--
-- O QUE ESTAVA ERRADO. Nenhuma migration jamais concedeu privilégio de tabela.
-- O projeto inteiro se apoiava em RLS — e RLS NÃO concede acesso, apenas
-- restringe linhas de quem já tem o privilégio. Enquanto o banco de
-- desenvolvimento era antigo, isso não aparecia: versões anteriores do Supabase
-- traziam `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon,
-- authenticated, service_role` no schema `public`.
--
-- O padrão mudou. Num Postgres 17 criado pelo Supabase CLI atual, o `public`
-- nasce trancado: as default privileges do papel `postgres` concedem apenas
-- D (TRUNCATE), x (REFERENCES), t (TRIGGER) e m (MAINTAIN) — nenhum SELECT,
-- INSERT, UPDATE ou DELETE. Verificado neste banco:
--
--   pg_default_acl → postgres | r | {postgres=arwdDxtm/postgres,
--                                    anon=Dxtm/postgres,
--                                    authenticated=Dxtm/postgres,
--                                    service_role=Dxtm/postgres}
--
-- CONSEQUÊNCIA, e ela é total: em qualquer ambiente recriado do zero (staging,
-- disaster recovery, `db reset`, CI, máquina nova de quem entrar no time),
-- TODA leitura e escrita via PostgREST falha com "permission denied for table".
-- Não é degradação, é indisponibilidade — e silenciosa até alguém abrir a
-- aplicação. Foi assim que apareceu: o CLI de sincronização das tabelas
-- fiscais, rodando com service_role, não conseguiu ler `cclasstrib_ibscbs`.
--
-- É a mesma classe de defeito dos itens C1 e C3 da auditoria: o ambiente de
-- desenvolvimento carregava um estado que as migrations não reproduziam.
--
-- CRITÉRIO DOS GRANTS ABAIXO. Cada concessão espelha a política de RLS que já
-- existe na tabela — nada foi ampliado. Onde a policy é só de SELECT, o grant é
-- só de SELECT; onde existe policy de INSERT, o grant acompanha. RLS continua
-- sendo quem decide QUAIS linhas; o grant decide QUAL operação.
--
-- `anon` fica de fora de propósito, e as migrations 20260805180000 e
-- 20260805200000 já o revogavam nominalmente das tabelas de domínio. Nada neste
-- produto é acessível sem sessão.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. service_role — motor Inngest, webhooks e o CLI de sincronização.
--
-- Ele ignora RLS por definição (BYPASSRLS), então o grant amplo aqui não abre
-- porta nova: quem chega com essa chave já é o backend. O que faltava era o
-- privilégio, não a permissão.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------------
-- 2. authenticated — o usuário logado, sempre filtrado por RLS.
--
-- Tabela por tabela, no mesmo recorte das policies existentes.
-- ---------------------------------------------------------------------------

-- Somente leitura: quem escreve nelas é o motor (service_role) ou uma função
-- SECURITY DEFINER (`criar_minha_empresa`, `transicionar_status_nota`).
GRANT SELECT ON TABLE assinaturas              TO authenticated;
GRANT SELECT ON TABLE empresa_membros          TO authenticated;
GRANT SELECT ON TABLE faturas_excedente        TO authenticated;
GRANT SELECT ON TABLE notas_fiscais_tentativas TO authenticated;

-- Configurações da empresa: a tela salva dados fiscais e provider. Sem DELETE —
-- não existe fluxo de apagar empresa, e conceder o que ninguém usa é superfície
-- de graça.
GRANT SELECT, UPDATE ON TABLE empresas TO authenticated;

-- Clientes: CRUD completo pela tela, com RLS limitando ao tenant (policy ALL).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clientes TO authenticated;

-- Notas: cria pela tela (status `pendente`, regra 5) e lê. UPDATE fica DE FORA
-- deliberadamente — mudar status é atribuição exclusiva de
-- `transicionar_status_nota()`, e um UPDATE direto contornaria a máquina de
-- estados inteira, que é justamente onde mora a correção do IDOR (C1).
GRANT SELECT, INSERT ON TABLE notas_fiscais TO authenticated;

-- Tabelas de domínio nacional: conteúdo normativo público, leitura apenas.
GRANT SELECT ON TABLE cst_ibscbs            TO authenticated;
GRANT SELECT ON TABLE cclasstrib_ibscbs     TO authenticated;
GRANT SELECT ON TABLE ccredpres_ibscbs      TO authenticated;
GRANT SELECT ON TABLE item_lc116_cclasstrib TO authenticated;
GRANT SELECT ON TABLE fiscal_fonte_versao   TO authenticated;

-- Views de consumo. Uma view roda com os privilégios de quem a definiu, mas o
-- SELECT sobre a própria view continua sendo exigido de quem consulta.
GRANT SELECT ON cclasstrib_nfse             TO authenticated, service_role;
GRANT SELECT ON cclasstrib_conferencia      TO authenticated, service_role;
GRANT SELECT ON item_lc116_cclasstrib_nfse  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Reafirma o bloqueio do `anon`.
--
-- O REVOKE vem DEPOIS dos GRANTs de propósito: `GRANT ... ON ALL TABLES` acima
-- não alcança `anon`, mas manter o revoke explícito documenta a intenção e
-- protege contra alguém acrescentar um grant amplo no futuro sem perceber.
-- ---------------------------------------------------------------------------
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Tabelas futuras.
--
-- Sem isto, a próxima migration que criar uma tabela repete o defeito — e o
-- sintoma volta a ser "permission denied" num ambiente novo, meses depois,
-- longe da causa. Vale só para objetos criados pelo papel `postgres`, que é
-- quem aplica as migrations.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- `authenticated` NÃO entra no default: tabela nova deve começar inacessível e
-- receber o grant explícito quando a policy dela for escrita. Errar para o lado
-- de negar é o que se espera de multi-tenant.
