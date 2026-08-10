-- ============================================================================
-- FONTES OFICIAIS DO cClassTrib — texto integral, vigencia e correlacao
--
-- Origem de CADA dado deste arquivo, sem excecao:
--
--   [F1] Portal SVRS — Tabela de Classificacao Tributaria da RT
--        https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria
--        JSON `dadosOriginais` embarcado na pagina.
--        Publicacao mais recente na tabela: 2026-06-22
--        SHA-256 do conteudo importado: f2f0688022232d5d7a7bacfd18f8864085765b46642af118173be0e9800fb1cc
--
--   [F2] Anexo VIII — Correlacao Item LC116 / NBS / cIndOp / cClassTrib
--        V1.01.00 (NT 008), planilha oficial do portal da NFS-e:
--        https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/
--          anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-01-00.xlsx
--
-- POR QUE ESTA MIGRATION EXISTE. A tabela do banco estava correta nos codigos,
-- CST e indicadores — a conferencia contra [F1] deu ZERO divergencia nesses
-- campos. O que faltava era outra coisa:
--
--   1. As descricoes eram PARAFRASES nossas, nao o texto oficial. Em geral a
--      descricao + `artigo_lc214` reconstituia o original, mas nem sempre: o
--      200002 estava como "Fornecimento ou importacao para produtor rural nao
--      contribuinte ou TAC" enquanto o oficial fala em "tratores, maquinas e
--      implementos agricolas". Numa tela onde o usuario ESCOLHE pela descricao,
--      parafrase e erro de enquadramento esperando acontecer.
--   2. Vigencia nao era modelada. 220001/220002/220003 tem vigencia encerrada
--      em 2026-01-01 e continuavam indistinguiveis dos vigentes.
--   3. Nao havia como saber de qual versao da fonte os dados vieram.
--
-- O que NAO mudou e por que: `perc_reducao_ibs/cbs` continuam em FRACAO
-- (0.6000), enquanto [F1] publica percentual (60.0). Mesma informacao, unidade
-- diferente; a fracao e o que o codigo consome. A conversao esta registrada em
-- `perc_reducao_ibs_oficial` para conferencia direta contra a fonte.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fiscal_fonte_versao (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte         TEXT        NOT NULL,
  url           TEXT        NOT NULL,
  versao        TEXT,
  publicado_em  DATE,
  hash_conteudo TEXT        NOT NULL,
  registros     INTEGER     NOT NULL,
  importado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fonte, hash_conteudo)
);

COMMENT ON TABLE fiscal_fonte_versao IS
  'Procedencia das tabelas fiscais oficiais. Uma linha por importacao que '
  'ALTEROU algo — reimportar conteudo identico nao gera linha nova (UNIQUE '
  'por hash). E o que responde "de qual versao da fonte veio este dado".';

ALTER TABLE cclasstrib_ibscbs
  -- Texto integral da fonte. `descricao` continua existindo como rotulo curto
  -- para tela estreita; o oficial e o que vale para decidir.
  ADD COLUMN IF NOT EXISTS descricao_oficial       TEXT,
  ADD COLUMN IF NOT EXISTS nome_reduzido           TEXT,
  ADD COLUMN IF NOT EXISTS vigencia_inicio         DATE,
  ADD COLUMN IF NOT EXISTS vigencia_fim            DATE,
  ADD COLUMN IF NOT EXISTS url_legislacao          TEXT,
  -- Reducoes como a fonte publica (percentual), ao lado das nossas em fracao.
  ADD COLUMN IF NOT EXISTS perc_reducao_ibs_oficial NUMERIC(7,5),
  ADD COLUMN IF NOT EXISTS perc_reducao_cbs_oficial NUMERIC(7,5),
  ADD COLUMN IF NOT EXISTS publicado_em            DATE;

COMMENT ON COLUMN cclasstrib_ibscbs.descricao_oficial IS
  'Texto integral de [F1]. E o que deve ser exibido ao usuario na escolha.';
COMMENT ON COLUMN cclasstrib_ibscbs.vigencia_fim IS
  'NULL = vigente. Codigo com vigencia encerrada nao pode ser declarado em '
  'nota de competencia posterior a esta data.';


-- ---------------------------------------------------------------------------
-- [F1] Texto oficial, vigencia e procedencia dos 164 cClassTrib.
-- ---------------------------------------------------------------------------
UPDATE cclasstrib_ibscbs AS c SET
  descricao_oficial        = v.desc_of,
  nome_reduzido            = v.nome_red,
  vigencia_inicio          = v.ini::DATE,
  vigencia_fim             = v.fim::DATE,
  url_legislacao           = v.url,
  perc_reducao_ibs_oficial = v.red_ibs,
  perc_reducao_cbs_oficial = v.red_cbs,
  publicado_em             = v.pub::DATE
FROM (VALUES
  ('000001', 'Situações tributadas integralmente pelo IBS e CBS.', 'Situações tributadas integralmente pelo IBS e CBS.', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art4', 0.0, 0.0, '2026-06-22'),
  ('000002', 'Exploração de via, observado o art. 11 da Lei Complementar nº 214, de 2025.', 'Exploração de via', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art11', 0.0, 0.0, '2026-06-22'),
  ('000003', 'Regime automotivo - projetos incentivados, observado o art. 311 da Lei Complementar nº 214, de 2025.', 'Regime automotivo - projetos incentivados (art. 311)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art311', 0.0, 0.0, '2026-06-22'),
  ('000004', 'Regime automotivo - projetos incentivados, observado o art. 312 da Lei Complementar nº 214, de 2025.', 'Regime automotivo - projetos incentivados (art. 312)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art312', 0.0, 0.0, '2026-06-22'),
  ('000005', 'Operação com EAC destinado à mistura com gasolina A, mas com saída do biocombustível com destinação diversa, observado o art. 179 da Lei Complementar nº 214, de 2025.', 'Operação com EAC destinado à mistura com gasolina A, mas com saída do biocombustível com destinação diversa', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art179
', 0.0, 0.0, '2026-06-22'),
  ('010001', 'Operações do FGTS não realizadas pela Caixa Econômica Federal, observado o art. 212 da Lei Complementar nº 214, de 2025.', 'Operações do FGTS não realizadas pela Caixa Econômica Federal', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art212', 0.0, 0.0, '2026-06-22'),
  ('010002', 'Operações do serviço financeiro', 'Operações do serviço financeiro', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art233
', 0.0, 0.0, '2026-06-22'),
  ('011001', 'Planos de assistência funerária, observado o art. 236 da Lei Complementar nº 214, de 2025.', 'Planos de assistência funerária.', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art236', 60.0, 60.0, '2026-06-22'),
  ('011002', 'Planos de assistência à saúde, observado o art. 237 da Lei Complementar nº 214, de 2025.', 'Planos de assistência à saúde', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art237', 60.0, 60.0, '2026-06-22'),
  ('011003', 'Intermediação de planos de assistência à saúde, observado o art. 240 da Lei Complementar nº 214, de 2025.', 'Intermediação de planos de assistência à saúde', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art240', 60.0, 60.0, '2026-06-22'),
  ('011004', 'Concursos e prognósticos, observado o art. 246 da Lei Complementar nº 214, de 2025.', 'Concursos e prognósticos', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art246', 0.0, 0.0, '2026-06-22'),
  ('011005', 'Planos de assistência à saúde de animais domésticos, observado o art. 243 da Lei Complementar nº 214, de 2025.', 'Planos de assistência à saúde de animais domésticos', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art243', 30.0, 30.0, '2026-06-22'),
  ('200001', 'Serviços de transporte de bens até as zonas de processamento de exportação e bens exportados a partir das zonas de processamento de exportação, observado o art. 103 da Lei Complementar n 214, de 2025.', 'Serviços de transporte de bens até as zonas de processamento de exportação e bens exportados a partir das zonas de processamento de exportação', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art103', 100.0, 100.0, '2026-06-22'),
  ('200002', 'Fornecimento ou importação de tratores, máquinas e implementos agrícolas, destinados a produtor rural não contribuinte, e de veículos de transporte de carga destinados a transportador autônomo de carga pessoa física não contribuinte, observado o art. 110 da Lei Complementar nº 214, de 2025.', 'Fornecimento ou importação para produtor rural não contribuinte ou TAC', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art110', 100.0, 100.0, '2026-06-22'),
  ('200003', 'Vendas de produtos destinados à alimentação humana relacionados no Anexo I da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH, que compõem a Cesta Básica Nacional de Alimentos, criada nos termos do art. 8º da Emenda Constitucional nº 132, de 20 de dezembro de 2023, observado o art. 125 da Lei Complementar nº 214, de 2025.', 'Vendas de produtos destinados à alimentação humana (Anexo I)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art125', 100.0, 100.0, '2026-06-22'),
  ('200004', 'Fornecimento de dispositivos médicos com a especificação das respectivas classificações da NCM/SH previstas no Anexo XII da Lei Complementar nº 214, de 2025, observado o art. 144 da Lei Complementar nº 214, de 2025.', 'Fornecimento de dispositivos médicos (Anexo XII)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art144', 100.0, 100.0, '2026-06-22'),
  ('200005', 'Fornecimento de dispositivos médicos com a especificação das respectivas classificações da NCM/SH previstas no Anexo IV da Lei Complementar nº 214, de 2025, quando adquiridos por órgãos da administração pública direta, autarquias, fundações públicas e entidades de saúde imunes, observado o art. 144 da Lei Complementar nº 214, de 2025.', 'Fornecimento de dispositivos médicos para órgãos da administração pública e entidades de saúde imunes (Anexo IV)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art144', 100.0, 100.0, '2026-06-22'),
  ('200006', 'Situação de emergência de saúde pública reconhecida pelo Poder Legislativo federal, estadual, distrital ou municipal competente, ato conjunto do Ministro da Fazenda e do Comitê Gestor do IBS poderá ser editado, a qualquer momento, para incluir dispositivos não listados no Anexo XII da Lei Complementar nº 214, de 2025, limitada a vigência do benefício ao período e à localidade da emergência de saúde pública, observado o art. 144 da Lei Complementar nº 214, de 2025.', 'Situação de emergência de saúde pública reconhecida pelo Poder público', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art144', 100.0, 100.0, '2026-06-22'),
  ('200007', 'Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência relacionados no Anexo XIII da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH, observado o art. 145 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência (Anexo XIII)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art145', 100.0, 100.0, '2026-06-22'),
  ('200008', 'Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência relacionados no Anexo V da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH, quando adquiridos por órgãos da administração pública direta, autarquias, fundações públicas e entidades imunes, observado o art. 145 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência adquiridos por órgãos da administração pública (Anexo V)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art145', 100.0, 100.0, '2026-06-22'),
  ('200009', 'Fornecimento dos medicamentos registrados na Anvisa, observado o art. 146 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos medicamentos registrados na Anvisa', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146', 100.0, 100.0, '2026-06-22'),
  ('200010', 'Fornecimento dos medicamentos registrados na Anvisa, quando adquiridos por órgãos da administração pública direta, autarquias, fundações públicas e entidades imunes, observado o art. 146 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos medicamentos registrados na Anvisa, adquiridos por órgãos da administração pública', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146', 100.0, 100.0, '2026-06-22'),
  ('200011', 'Fornecimento das composições para nutrição enteral e parenteral, composições especiais e fórmulas nutricionais destinadas às pessoas com erros inatos do metabolismo relacionadas no Anexo VI da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH, quando adquiridas por órgãos da administração pública direta, autarquias e fundações públicas, observado o art. 146 da Lei Complementar nº 214, de 2025.', 'Fornecimento das composições para nutrição enteral e parenteral quando adquiridas por órgãos da administração pública (Anexo VI)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146', 100.0, 100.0, '2026-06-22'),
  ('200012', 'Situação de emergência de saúde pública reconhecida pelo Poder Legislativo federal, estadual, distrital ou municipal competente, ato conjunto do Ministro da Fazenda e do Comitê Gestor do IBS poderá ser editado, a qualquer momento, limitada a vigência do benefício ao período e à localidade da emergência de saúde pública, observado o art. 146 da Lei Complementar nº 214, de 2025.', 'Situação de emergência de saúde pública reconhecida pelo Poder público', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146', 100.0, 100.0, '2026-06-22'),
  ('200013', 'Fornecimento de tampões higiênicos, absorventes higiênicos internos ou externos, descartáveis ou reutilizáveis, calcinhas absorventes e coletores menstruais, observado o art. 147 da Lei Complementar nº 214, de 2025.', 'Fornecimento de tampões higiênicos, absorventes higiênicos internos ou externos', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art147', 100.0, 100.0, '2026-06-22'),
  ('200014', 'Fornecimento dos produtos hortícolas, frutas e ovos, relacionados no Anexo XV da Lei Complementar nº 214 , de 2025, com a especificação das respectivas classificações da NCM/SH e desde que não cozidos, observado o art. 148 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos produtos hortícolas, frutas e ovos (Anexo XV) ', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art148', 100.0, 100.0, '2026-06-22'),
  ('200015', 'Venda de automóveis de passageiros de fabricação nacional de, no mínimo, 4 (quatro) portas, inclusive a de acesso ao bagageiro, quando adquiridos por motoristas profissionais que exerçam, comprovadamente, em automóvel de sua propriedade, atividade de condutor autônomo de passageiros, na condição de titular de autorização, permissão ou concessão do poder público, e que destinem o automóvel à utilização na categoria de aluguel (táxi), ou por pessoas com deficiência física, visual, auditiva, deficiência mental severa ou profunda, transtorno do espectro autista, com prejuízos na comunicação social e em padrões restritos ou repetitivos de comportamento de nível moderado ou grave, nos termos da legislação relativa à matéria, observado o disposto no art. 149 da Lei Complementar nº 214, de 2025.', 'Venda de automóveis de passageiros de fabricação nacional adquiridos por motoristas profissionais ou pessoas com deficiência', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art149', 100.0, 100.0, '2026-06-22'),
  ('200016', 'Prestação de serviços de pesquisa e desenvolvimento por Instituição Científica, Tecnológica e de Inovação (ICT) sem fins lucrativos para a administração pública direta, autarquias e fundações públicas ou para o contribuinte sujeito ao regime regular do IBS e da CBS, observado o disposto no art. 156  da Lei Complementar nº 214, de 2025.', 'Prestação de serviços de pesquisa e desenvolvimento por Instituição Científica, Tecnológica e de Inovação (ICT)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art156', 100.0, 100.0, '2026-06-22'),
  ('200017', 'Operações relacionadas ao FGTS, considerando aquelas necessárias à aplicação da Lei nº 8.036, de 1990, realizadas pelo Conselho Curador ou Secretaria Executiva do FGTS, observado o art. 212 da Lei Complementar nº 214, de 2025.', 'Operações relacionadas ao FGTS', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art212', 100.0, 100.0, '2026-06-22'),
  ('200018', 'Operações de resseguro e retrocessão ficam sujeitas à incidência à alíquota zero, inclusive quando os prêmios de resseguro e retrocessão forem cedidos ao exterior, observado o art. 223 da Lei Complementar nº 214, de 2025.', 'Operações de resseguro e retrocessão', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art223', 100.0, 100.0, '2026-06-22'),
  ('200019', 'Importador dos serviços financeiros que seja contribuinte e tenha direito de apropriação de créditos na aquisição do mesmo serviço financeiro no País, observado o art. 231 da Lei Complementar nº 214, de 2025.', 'Importador dos serviços financeiros contribuinte', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art231', 100.0, 100.0, '2026-06-22'),
  ('200020', 'Operação praticada por sociedades cooperativas optantes por regime específico do IBS e CBS, quando o associado destinar bem ou serviço à cooperativa de que participa, e a cooperativa fornecer bem ou serviço ao associado sujeito ao regime regular do IBS e da CBS, observado o art. 271 da Lei Complementar nº 214, de 2025.', 'Operação praticada por sociedades cooperativas optantes por regime específico do IBS e CBS', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art271', 100.0, 100.0, '2026-06-22'),
  ('200021', 'Serviços de transporte público coletivo de passageiros ferroviário e hidroviário urbanos, semiurbanos e metropolitanos, observado o art. 285 da Lei Complementar nº 214, de 2025.', 'Serviços de transporte público coletivo de passageiros ferroviário e hidroviário', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art285', 100.0, 100.0, '2026-06-22'),
  ('200022', 'Operação originada fora da Zona Franca de Manaus que destine bem material industrializado de origem nacional a contribuinte estabelecido na Zona Franca de Manaus que seja habilitado nos termos do art. 442 da Lei Complementar nº 214, de 2025, e sujeito ao regime regular do IBS e da CBS ou optante pelo regime do Simples Nacional de que trata o art. 12 da Lei Complementar nº 123, de 2006, observado o art. 445 da Lei Complementar nº 214, de 2025.', 'Operação originada fora da ZFM que destine bem material industrializado a contribuinte estabelecido na ZFM', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art445', 100.0, 100.0, '2026-06-22'),
  ('200023', 'Operação realizada por indústria incentivada que destine bem material intermediário para outra indústria incentivada na Zona Franca de Manaus, desde que a entrega ou disponibilização dos bens ocorra dentro da referida área, observado o art. 448 da Lei Complementar nº 214, de 2025.', 'Operação realizada por indústria incentivada que destine bem material intermediário para outra indústria incentivada na ZFM', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art448', 100.0, 100.0, '2026-06-22'),
  ('200024', 'Operação originada fora das Áreas de Livre Comércio que destine bem material industrializado de origem nacional a contribuinte estabelecido nas Áreas de Livre Comércio que seja habilitado nos termos do art. 456 da Lei Complementar nº 214, de 2025, e sujeito ao regime regular do IBS e da CBS ou optante pelo regime do Simples Nacional de que trata o art. 12 da Lei Complementar nº 123, de 2006, observado o art. 463 da Lei Complementar nº 214, de 2025.', 'Operação originada fora das Áreas de Livre Comércio destinadas a contribuinte estabelecido nas Áreas de Livre Comércio', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art463', 100.0, 100.0, '2026-06-22'),
  ('200025', 'Fornecimento dos serviços de educação relacionados ao Programa Universidade para Todos (Prouni), instituído pela Lei nº 11.096, de 13 de janeiro de 2005, observado o art. 308 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos serviços de educação relacionados ao Programa Universidade para Todos (Prouni)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art308', 60.0, 100.0, '2026-06-22'),
  ('200026', 'Locação de imóveis localizados nas zonas reabilitadas, pelo prazo de 5 (cinco) anos, contado da data de expedição do habite-se, e relacionados a projetos de reabilitação urbana de zonas históricas e de áreas críticas de recuperação e reconversão urbanística dos Municípios ou do Distrito Federal, a serem delimitadas por lei municipal ou distrital, observado o art. 158 da Lei Complementar nº 214, de 2025.', 'Locação de imóveis localizados nas zonas reabilitadas', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art158', 80.0, 80.0, '2026-06-22'),
  ('200027', 'Operações de locação, cessão onerosa e arrendamento de bens imóveis, observado o art. 261 da Lei Complementar nº 214, de 2025.', 'Operações de locação, cessão onerosa e arrendamento de bens imóveis', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art261', 70.0, 70.0, '2026-06-22'),
  ('200028', 'Fornecimento dos serviços de educação relacionados no Anexo II da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da Nomenclatura Brasileira de Serviços, Intangíveis e Outras Operações que Produzam Variações no Patrimônio (NBS), observado o art. 129 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos serviços de educação (Anexo II)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art129', 60.0, 60.0, '2026-06-22'),
  ('200029', 'Fornecimento dos serviços de saúde humana relacionados no Anexo III da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NBS, observado o art. 130 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos serviços de saúde humana (Anexo III)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art130', 60.0, 60.0, '2026-06-22'),
  ('200030', 'Venda dos dispositivos médicos relacionados no Anexo IV da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH, observado o art. 131 da Lei Complementar nº 214, de 2025.', 'Venda dos dispositivos médicos  (Anexo IV)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art131', 60.0, 60.0, '2026-06-22'),
  ('200031', 'Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência relacionados no Anexo V da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH, observado o art. 132 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência (Anexo V) ', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art132', 60.0, 60.0, '2026-06-22'),
  ('200032', 'Fornecimento dos medicamentos registrados na Anvisa ou produzidos por farmácias de manipulação, ressalvados os medicamentos sujeitos à alíquota zero de que trata o art. 146 da Lei Complementar nº 214, de 2025, observado o art. 133 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos medicamentos registrados na Anvisa ou produzidos por farmácias de manipulação, ressalvados os medicamentos sujeitos à alíquota zero', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art133', 60.0, 60.0, '2026-06-22'),
  ('200033', 'Fornecimento das composições para nutrição enteral e parenteral, composições especiais e fórmulas nutricionais destinadas às pessoas com erros inatos do metabolismo relacionadas no Anexo VI da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH, observado o art. 133 da Lei Complementar nº 214, de 2025.', 'Fornecimento das composições para nutrição enteral e parenteral (Anexo VI)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art133', 60.0, 60.0, '2026-06-22'),
  ('200034', 'Fornecimento dos alimentos destinados ao consumo humano relacionados no Anexo VII da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH, observado o art. 135 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos alimentos destinados ao consumo humano (Anexo VII)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art135', 60.0, 60.0, '2026-06-22'),
  ('200035', 'Fornecimento dos produtos de higiene pessoal e limpeza relacionados no Anexo VIII da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH, observado o art. 136 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos produtos de higiene pessoal e limpeza (Anexo VIII)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art136', 60.0, 60.0, '2026-06-22'),
  ('200036', 'Fornecimento de produtos agropecuários, aquícolas, pesqueiros, florestais e extrativistas vegetais in natura, observado o art. 137 da Lei Complementar nº 214, de 2025.', 'Fornecimento de produtos agropecuários, aquícolas, pesqueiros, florestais e extrativistas vegetais in natura', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art137', 60.0, 60.0, '2026-06-22'),
  ('200037', 'Fornecimento de serviços ambientais de conservação ou recuperação da vegetação nativa, mesmo que fornecidos sob a forma de manejo sustentável de sistemas agrícolas, agroflorestais e agrossilvopastoris, em conformidade com as definições e requisitos da legislação específica, observado o art. 137 da Lei Complementar nº 214, de 2025.', 'Fornecimento de serviços ambientais de conservação ou recuperação da vegetação nativa', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art137', 60.0, 60.0, '2026-06-22'),
  ('200038', 'Fornecimento dos insumos agropecuários e aquícolas relacionados no Anexo IX da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH e da NBS, observado o art. 138 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos insumos agropecuários e aquícolas (Anexo IX)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art138', 60.0, 60.0, '2026-06-22'),
  ('200039', 'Fornecimento dos bens e serviços listados no Anexo X da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH e NBS, nos casos relacionados com produções nacionais artísticas, culturais, de eventos, jornalísticas e audiovisuais, observado o art. 139 da Lei Complementar nº 214, de 2025.', 'Fornecimento dos bens e serviços relacionados com produções nacionais artísticas, culturais, de eventos, jornalísticas e audiovisuais (Anexo X)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art139', 60.0, 60.0, '2026-06-22'),
  ('200040', 'Fornec dos seguintes serv de comunic instit à admin púb direta, autarq e fund púb: serviços direcionados ao planej, criação, programação e manutenção de páginas eletrônicas da admin pública, ao monitor e gestão de suas redes sociais e à otimização de páginas e canais digitais para mecanismos de buscas e produção de mensagens, infográficos, painéis interativos e conteúdo institucional, serviços de relações com a imprensa, que reúnem estrat org para promover e reforçar a comunicação dos órgãos e das entidades contratantes com seus públicos de interesse, por meio da interação com prof da imprensa, e serviços de relações públicas, que compreendem o esforço de comunic planej, coeso e contínuo que tem por obj estab adequada percepção da atuação e dos obj instituc, a partir do estímulo à compreensão mútua e da manut de padrões de relac e fluxos de inf entre os órgãos e as entidades contrat e seus públicos de interesse, no País e no exterior, obs o art. 140 da Lei Compl nº 214, de 2025', 'Fornecimento de serviços de comunicação institucional à administração pública', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art140', 60.0, 60.0, '2026-06-22'),
  ('200041', 'Operações relacionadas às seguintes atividades desportivas: fornecimento de serviço de educação desportiva, classificado no código 1.2205.12.00 da NBS, e gestão e exploração do desporto por associações e clubes esportivos filiados ao órgão estadual ou federal responsável pela coordenação dos desportos, inclusive por meio de venda de ingressos para eventos desportivos, fornecimento oneroso ou não de bens e serviços, inclusive ingressos, por meio de programas de sócio-torcedor, cessão dos direitos desportivos dos atletas e transferência de atletas para outra entidade desportiva ou seu retorno à atividade em outra entidade desportiva, observado o art. 141 da Lei Complementar nº 214, de 2025.', 'Fornecimento de serviço de educação desportiva (art. 141. I)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art141', 60.0, 60.0, '2026-06-22'),
  ('200042', 'Operações relacionadas às seguintes atividades desportivas: gestão e exploração do desporto por associações e clubes esportivos filiados ao órgão estadual ou federal responsável pela coordenação dos desportos, observado o art. 141 da Lei Complementar nº 214, de 2025.', 'Fornecimento de serviço de gestão e exploração do desporto (art. 141. II)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art141', 60.0, 60.0, '2026-06-22'),
  ('200043', 'Fornecimento à administração pública direta, autarquias e fundações púbicas dos serviços e dos bens relativos à soberania e à segurança nacional, à segurança da informação e à segurança cibernética relacionados no Anexo XI da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NBS e da NCM/SH, observado o art. 142 da Lei Complementar nº 214, de 2025.', 'Fornecimento à administração pública dos serviços e dos bens relativos à soberania (Anexo XI)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art142', 60.0, 60.0, '2026-06-22'),
  ('200044', 'Operações e prestações de serviços de segurança da informação e segurança cibernética desenvolvidos por sociedade que tenha sócio brasileiro com o mínimo de 20% (vinte por cento) do seu capital social, relacionados no Anexo XI da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NBS e da NCM/SH, observado o art. 142 da Lei Complementar nº 214, de 2025.', 'Operações e prestações de serviços de segurança da informação e segurança cibernética desenv por sociedade que tenha sócio brasileiro (Anexo XI)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art142', 60.0, 60.0, '2026-06-22'),
  ('200045', 'Operações relacionadas a projetos de reabilitação urbana de zonas históricas e de áreas críticas de recuperação e reconversão urbanística dos Municípios ou do Distrito Federal, a serem delimitadas por lei municipal ou distrital, observado o art. 158 da Lei Complementar nº 214, de 2025.', 'Operações relacionadas a projetos de reabilitação urbana de zonas históricas e de áreas críticas de recuperação e reconversão urbanística', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art158', 60.0, 60.0, '2026-06-22'),
  ('200046', 'Operações com bens imóveis, observado o art. 261 da Lei Complementar nº 214, de 2025.', 'Operações com bens imóveis', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art261', 50.0, 50.0, '2026-06-22'),
  ('200047', 'Bares e Restaurantes, observado o art. 275 da Lei Complementar nº 214, de 2025.', 'Bares e Restaurantes', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art275', 40.0, 40.0, '2026-06-22'),
  ('200048', 'Hotelaria, Parques de Diversão e Parques Temáticos, observado o art. 281 da Lei Complementar nº 214, de 2025.', 'Hotelaria, Parques de Diversão e Parques Temáticos', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art281', 40.0, 40.0, '2026-06-22'),
  ('200049', 'Transporte coletivo de passageiros rodoviário, ferroviário e hidroviário intermunicipais e interestaduais, observado o art. 286 da Lei Complementar nº 214, de 2025.', 'Transporte coletivo de passageiros rodoviário, ferroviário e hidroviário', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art286', 40.0, 40.0, '2026-06-22'),
  ('200050', 'Serviços de transporte aéreo regional coletivo de passageiros ou de carga, observado o art. 287 da Lei Complementar nº 214, de 2025.', 'Serviços de transporte aéreo regional coletivo de passageiros ou de carga', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art287', 40.0, 40.0, '2026-06-22'),
  ('200051', 'Agências de Turismo, observado o art. 289 da Lei Complementar nº 214, de 2025.', 'Agências de Turismo', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art289', 40.0, 40.0, '2026-06-22'),
  ('200052', 'Prestação de serviços das seguintes profissões intelectuais de natureza científica, literária ou artística, submetidas à fiscalização por conselho profissional: administradores, advogados, arquitetos e urbanistas, assistentes sociais, bibliotecários, biólogos, contabilistas, economistas, economistas domésticos, profissionais de educação física, engenheiros e agrônomos, estatísticos, médicos veterinários e zootecnistas, museólogos, químicos, profissionais de relações públicas, técnicos industriais e técnicos agrícolas, observado o art. 127 da Lei Complementar nº 214, de 2025.', 'Prestação de serviços de profissões intelectuais', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art127', 30.0, 30.0, '2026-06-22'),
  ('200053', 'Fornecimento de medicamentos registrados na Anvisa, quando  classificados como soros ou vacinas, observado o art. 146 da Lei Complementar nº 214, de 2025.', 'Fornecimento de medicamentos registrados na Anvisa, quando  classificados como soros ou vacinas', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146', 100.0, 100.0, '2026-06-22'),
  ('200054', 'Fornecimento de bem material pela cooperativa de produção agropecuária a associado não sujeito ao regime regular do IBS e da CBS com anulação de créditos referentes ao bem fornecido, observado o art. 271 da Lei Complementar nº 214, de 2025.', 'Fornecimento de bem material pela cooperativa de produção agropecuária a associado não sujeito ao regime regular do IBS e da CBS', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art271
', 100.0, 100.0, '2026-06-22'),
  ('220001', 'Incorporação imobiliária submetida ao regime especial de tributação, observado o art. 485 da Lei Complementar nº 214, de 2025.', 'Incorporação imobiliária submetida ao regime especial de tributação', '2025-05-05', '2026-01-01', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art485', 0.0, 0.0, '2026-06-22'),
  ('220002', 'Incorporação imobiliária submetida ao regime especial de tributação, observado o art. 485 da Lei Complementar nº 214, de 2025.', 'Incorporação imobiliária submetida ao regime especial de tributação', '2025-05-05', '2026-01-01', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art485', 0.0, 0.0, '2026-06-22'),
  ('220003', 'Alienação de imóvel decorrente de parcelamento do solo, observado o art. 486 da Lei Complementar nº 214, de 2025.', 'Alienação de imóvel decorrente de parcelamento do solo', '2025-05-05', '2026-01-01', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art486', 0.0, 0.0, '2026-06-22'),
  ('221001', 'Locação, cessão onerosa ou arrendamento de bem imóvel com alíquota sobre a receita bruta, observado o art. 487 da Lei Complementar nº 214, de 2025.', 'Locação, cessão onerosa ou arrendamento de bem imóvel com alíquota sobre a receita bruta', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art484
', 0.0, 0.0, '2026-06-22'),
  ('221002', 'Incorporação imobiliária submetida ao regime especial de tributação, observado o art. 485 da Lei Complementar nº 214, de 2025.', 'Incorporação imobiliária submetida ao regime especial de tributação', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art485', 0.0, 0.0, '2026-06-22'),
  ('221003', 'Incorporação imobiliária submetida ao regime especial de tributação, observado o art. 485 da Lei Complementar nº 214, de 2025.', 'Incorporação imobiliária submetida ao regime especial de tributação', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art485', 0.0, 0.0, '2026-06-22'),
  ('221004', 'Alienação de imóvel decorrente de parcelamento do solo, observado o art. 486 da Lei Complementar nº 214, de 2025.', 'Alienação de imóvel decorrente de parcelamento do solo', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art486', 0.0, 0.0, '2026-06-22'),
  ('222001', 'Transporte internacional de passageiros, caso os trechos de ida e volta sejam vendidos em conjunto, a base de cálculo será a metade do valor cobrado, observado o Art. 12 § 8º da Lei Complementar nº 214, de 2025.', 'Transporte internacional de passageiros, caso os trechos de ida e volta sejam vendidos em conjunto', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art12', 0.0, 0.0, '2026-06-22'),
  ('400001', 'Fornecimento de serviços de transporte público coletivo de passageiros rodoviário e metroviário de caráter urbano, semiurbano e metropolitano, sob regime de autorização, permissão ou concessão pública, observado o art. 157 da Lei Complementar nº 214, de 2025.', 'Fornecimento de serviços de transporte público coletivo de passageiros rodoviário e metroviário', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art157', 0.0, 0.0, '2026-06-22'),
  ('400002', 'Fornecimento de serviços de transporte público coletivo de passageiros rodoviário e metroviário de caráter urbano, semiurbano e metropolitano, sob regime de autorização, permissão ou concessão pública, com medição por quilômetro rodado, observado o art. 157 da Lei Complementar nº 214, de 2025.', 'Fornecimento de serviços de transporte público coletivo de passageiros rodoviário e metroviário com medição por quilômetro rodado', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art157', 0.0, 0.0, '2026-06-22'),
  ('410001', 'Fornecimento de bonificações quando constem do respectivo documento fiscal e que não dependam de evento posterior, observado o art. 5º da Lei Complementar nº 214, de 2025.', 'Fornecimento de bonificações quando constem no documento fiscal e que não dependam de evento posterior', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art5', 0.0, 0.0, '2026-06-22'),
  ('410002', 'Transferências entre estabelecimentos pertencentes ao mesmo contribuinte, observado o art. 6º da Lei Complementar nº 214, de 2025.', 'Transferências entre estabelecimentos pertencentes ao mesmo contribuinte', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art6', 0.0, 0.0, '2026-06-22'),
  ('410003', 'Doações que não tenham por objeto bens ou serviços que tenham permitido a apropriação de créditos pelo doador, observado o art. 6º da Lei Complementar nº 214, de 2025.
', 'Doações sem contraprestação em benefício do doador
', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art6', 0.0, 0.0, '2026-06-22'),
  ('410004', 'Exportações de bens e serviços, observado o art. 8º da Lei Complementar nº 214, de 2025.', 'Exportações de bens e serviços', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art8', 0.0, 0.0, '2026-06-22'),
  ('410005', 'Fornecimentos realizados pela União, pelos Estados, pelo Distrito Federal e pelos Municípios, observado o art. 9º da Lei Complementar nº 214, de 2025.', 'Fornecimentos realizados pela União, pelos Estados, pelo Distrito Federal e pelos Municípios', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9', 0.0, 0.0, '2026-06-22'),
  ('410006', 'Fornecimentos realizados por entidades religiosas e templos de qualquer culto, inclusive suas organizações assistenciais e beneficentes, observado o art. 9º da Lei Complementar nº 214, de 2025.', 'Fornecimentos realizados por entidades religiosas e templos de qualquer culto', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9', 0.0, 0.0, '2026-06-22'),
  ('410007', 'Fornecimentos realizados por partidos políticos, inclusive suas fundações, entidades sindicais dos trabalhadores e instituições de educação e de assistência social, sem fins lucrativos, observado o art. 9º da Lei Complementar nº 214, de 2025.', 'Fornecimentos realizados por partidos políticos, entidades sindicais e instituições de educação e de assistência social', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9', 0.0, 0.0, '2026-06-22'),
  ('410008', 'Fornecimentos de livros, jornais, periódicos e do papel destinado a sua impressão, observado o art. 9º da Lei Complementar nº 214, de 2025.', 'Fornecimentos de livros, jornais, periódicos e do papel destinado a sua impressão', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9', 0.0, 0.0, '2026-06-22'),
  ('410009', 'Fornecimentos de fonogramas e videofonogramas musicais produzidos no Brasil contendo obras musicais ou literomusicais de autores brasileiros e/ou obras em geral interpretadas por artistas brasileiros, bem como os suportes materiais ou arquivos digitais que os contenham, salvo na etapa de replicação industrial de mídias ópticas de leitura a laser, observado o art. 9º da Lei Complementar nº 214, de 2025.', 'Fornecimentos de fonogramas e videofonogramas musicais produzidos no Brasil', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9', 0.0, 0.0, '2026-06-22'),
  ('410010', 'Fornecimentos de serviço de comunicação nas modalidades de radiodifusão sonora e de sons e imagens de recepção livre e gratuita, observado o art. 9º da Lei Complementar nº 214, de 2025.', 'Fornecimentos de serviço de comunicação nas modalidades de radiodifusão sonora e de sons e imagens de recepção livre e gratuita', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9', 0.0, 0.0, '2026-06-22'),
  ('410011', 'Fornecimentos de ouro, quando definido em lei como ativo financeiro ou instrumento cambial, observado o art. 9º da Lei Complementar nº 214, de 2025.', 'Fornecimentos de ouro, quando definido em lei como ativo financeiro ou instrumento cambial', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9', 0.0, 0.0, '2026-06-22'),
  ('410012', 'Fornecimento de condomínio edilício não optante pelo regime regular, observado o art. 26 da Lei Complementar nº 214, de 2025.', 'Fornecimento de condomínio edilício não optante pelo regime regular', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art26', 0.0, 0.0, '2026-06-22'),
  ('410013', 'Exportações de combustíveis, observado o art. 98 da Lei Complementar nº 214, de 2025.', 'Exportações de combustíveis', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art98', 0.0, 0.0, '2026-06-22'),
  ('410014', 'Fornecimento de produtor rural não contribuinte, observado o art. 164 da Lei Complementar nº 214, de 2025.', 'Fornecimento de produtor rural não contribuinte', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art164', 0.0, 0.0, '2026-06-22'),
  ('410015', 'Fornecimento por transportador autônomo não contribuinte, observado o art. 169 da Lei Complementar nº 214, de 2025.', 'Fornecimento por transportador autônomo não contribuinte', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art169', 0.0, 0.0, '2026-06-22'),
  ('410016', 'Fornecimento ou aquisição de resíduos sólidos, observado o art. 170 da Lei Complementar nº 214, de 2025.', 'Fornecimento ou aquisição de resíduos sólidos', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art170', 0.0, 0.0, '2026-06-22'),
  ('410017', 'Aquisição de bem móvel com crédito presumido sob condição de revenda realizada, observado o art. 171 da Lei Complementar nº 214, de 2025.', 'Aquisição de bem móvel com crédito presumido sob condição de revenda realizada', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art171', 0.0, 0.0, '2026-06-22'),
  ('410018', 'Operações relacionadas aos fundos garantidores e executores de políticas públicas, inclusive de habitação, previstos em lei, assim entendidas os serviços prestados ao fundo pelo seu agente operador e por entidade encarregada da sua administração, observado o art. 213 da Lei Complementar nº 214, de 2025.', 'Operações relacionadas aos fundos garantidores e executores de políticas públicas', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art213', 0.0, 0.0, '2026-06-22'),
  ('410019', 'Exclusão da gorjeta na base de cálculo no fornecimento de alimentação, observado o art. 274 da Lei Complementar nº 214, de 2025.', 'Exclusão da gorjeta na base de cálculo no fornecimento de alimentação', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art274', 0.0, 0.0, '2026-06-22'),
  ('410020', 'Exclusão do valor de intermediação na base de cálculo no fornecimento de alimentação, observado o art. 274 da Lei Complementar nº 214, de 2025.', 'Exclusão do valor de intermediação na base de cálculo no fornecimento de alimentação', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art274', 0.0, 0.0, '2026-06-22'),
  ('410021', 'Contribuição de que trata o art. 149-A da Constituição Federal, observado o art. 12 da Lei Complementar nº 214, de 2025.', 'Contribuição de que trata o art. 149-A da Constituição Federal', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art12', 0.0, 0.0, '2026-06-22'),
  ('410022', 'Consolidação da propriedade pelo credor de bens móveis ou imóveis que tenham sido objeto de garantia, observado o art. 200 da Lei Complementar nº 214, de 2025.
', 'Consolidação da propriedade do bem pelo credor
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art200', 0.0, 0.0, '2026-06-22'),
  ('410023', 'Alienação de bens móveis ou imóveis que tenham sido objeto de garantia constituída em favor de credor em que o prestador da garantia não seja contribuinte, observado o art. 200 da Lei Complementar nº 214, de 2025.
', 'Alienação de bens móveis ou imóveis que tenham sido objeto de garantia em que o prestador da garantia não seja contribuinte
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art200', 0.0, 0.0, '2026-06-22'),
  ('410024', 'Consolidação da propriedade pelo grupo de consórcio de bem que tenha sido objeto de garantia, observado o art. 204 da Lei Complementar nº 214, de 2025.
', 'Consolidação da propriedade do bem pelo grupo de consórcio
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art204', 0.0, 0.0, '2026-06-22'),
  ('410025', 'Alienação de bem que tenha sido objeto de garantia constituída em favor do grupo de consórcio em que o prestador da garantia não seja contribuinte, observado o art. 204 da Lei Complementar nº 214, de 2025.
', 'Alienação de bem que tenha sido objeto de garantia em que o prestador da garantia não seja contribuinte
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art204', 0.0, 0.0, '2026-06-22'),
  ('410026', 'Doações sem contraprestação em benefício do doador, com anulação de crédito apropriados pelo doador referente ao fornecimento doado, observado o art. 6º da Lei Complementar nº 214, de 2025.
', 'Doação com anulação de crédito
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art6
', 0.0, 0.0, '2026-06-22'),
  ('410027', 'Fornecimento de bens e serviços, desde que vinculados direta e exclusivamente à exportação de bens materiais ou associados à entrega no exterior de bens materiais, observado o art. 6º da Lei Complementar nº 214, de 2025.', 'Exportação de serviço ou de bem imaterial', '2025-11-19', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art80', 0.0, 0.0, '2026-06-22'),
  ('410028', 'Operações com bens imóveis realizadas por pessoas físicas não consideradas contribuintes do regime regular do IBS e da CBS, observado o art. 251 da Lei Complementar nº 214, de 2025.', 'Operações com bens imóveis realizadas por pessoas físicas não consideradas contribuintes', '2025-11-19', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art251', 0.0, 0.0, '2026-06-22'),
  ('410029', 'Operações não sujeitas à incidência de IBS e de CBS, alcançadas apenas por obrigação acessória do ICMS, observado o art. 4º da Lei Complementar nº 214, de 2025.', 'Operações acobertadas somente pelo ICMS', '2025-11-19', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art4', 0.0, 0.0, '2026-06-22'),
  ('410030', 'Estorno de crédito apropriado de bens adquiridos e venham a perecer, deteriorar-se ou ser objeto de roubo, furto ou extravio, observado o art. 47 da Lei Complementar nº 214, de 2025.', 'Estorno de crédito por perecimento, deteriorização, roubo, furto ou extravio.', '2025-11-19', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art47', 0.0, 0.0, '2026-06-22'),
  ('410031', 'Fornecimento em período anterior ao início de vigência de incidências de CBS e IBS, observado o art. 544 da Lei Complementar nº 214, de 2025.', 'Fornecimento em período anterior ao início de vigência de incidências de CBS e IBS', '2025-11-19', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art544', 0.0, 0.0, '2026-06-22'),
  ('410032', 'Tributos incidentes na operação que não integram a base de cálculo do IBS e da CBS, observado o art. 12 da Lei Complementar nº 214, de 2025.', 'Tributos incidentes na operação que não integram a base de cálculo do IBS e da CBS', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art12', 0.0, 0.0, '2026-06-22'),
  ('410033', 'Operações com bens imóveis, inclusive operações com direitos reais sobre bens imóveis, realizadas por Fundos de Investimento Imobiliário (FII) e Fundos de Investimento nas Cadeias Produtivas do Agronegócio (Fiagro), observado o art. 26 da Lei Complementar nº 214, de 2025.', 'Operações de Fundos de Investimento Imobiliário (FII) e Fundos de Investimento nas Cadeias Produtivas do Agronegócio (Fiagro)', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art26', 0.0, 0.0, '2026-06-22'),
  ('410034', 'Fundos de investimento cujo patrimônio seja constituído exclusivamente por aplicações em participações societárias, certificados, direitos, títulos, valores mobiliários e demais ativos financeiros permitidos pela Comissão de Valores Mobiliários, observado o art. 26 da Lei Complementar nº 214, de 2025.', 'Operações de fundos de investimento', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art26', 0.0, 0.0, '2026-06-22'),
  ('410035', 'Fornecimento realizado por nanoempreendedor, observado o art. 26 da Lei Complementar nº 214, de 2025.', 'Fornecimento realizado por nanoempreendedor', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art26', 0.0, 0.0, '2026-06-22'),
  ('410036', 'Descontos incondicionais, observado o art. 12 da Lei Complementar nº 214, de 2025.', 'Descontos incondicionais', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art12', 0.0, 0.0, '2026-06-22'),
  ('410037', 'Importação de bens materiais sem incidência de IBS e CBS, observado o art. 66 da Lei Complementar nº 214, de 2025.', 'Importação de bens materiais sem incidência de IBS e CBS', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art66', 0.0, 0.0, '2026-06-22'),
  ('410999', 'Operações não onerosas sem previsão de tributação, não especificadas anteriormente, observado o art. 4º da Lei Complementar nº 214, de 2025.', 'Operações não onerosas sem previsão de tributação, não especificadas anteriormente', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art4', 0.0, 0.0, '2026-06-22'),
  ('510001', 'Operações, sujeitas a diferimento, com energia elétrica ou com direitos a ela relacionados, relativas à importação, geração, comercialização, distribuição e transmissão, observado o art. 28 da Lei Complementar nº 214, de 2025.', 'Operações, sujeitas a diferimento, com energia elétrica, relativas à importação, geração, comercialização, distribuição e transmissão', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art28', 0.0, 0.0, '2026-06-22'),
  ('515001', 'Operações, sujeitas a diferimento, com insumos agropecuários e aquícolas, observado o art. 138 da Lei Complementar nº 214, de 2025.', 'Operações, sujeitas a diferimento, com insumos agropecuários e aquícolas (Anexo IX)', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art138
', 60.0, 60.0, '2026-06-22'),
  ('550001', 'Exportações de bens materiais, observado o art. 82 da Lei Complementar nº 214, de 2025.', 'Exportações de bens materiais', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art82', 0.0, 0.0, '2026-06-22'),
  ('550002', 'Regime de Trânsito, observado o art. 84 da Lei Complementar nº 214, de 2025.', 'Regime de Trânsito', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art84', 0.0, 0.0, '2026-06-22'),
  ('550003', 'Regimes de Depósito, observado o art. 85 da Lei Complementar nº 214, de 2025.', 'Regimes de Depósito  (art. 85)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art85', 0.0, 0.0, '2026-06-22'),
  ('550004', 'Regimes de Depósito, observado o art. 87 da Lei Complementar nº 214, de 2025.', 'Regimes de Depósito (art. 87)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art87', 0.0, 0.0, '2026-06-22'),
  ('550005', 'Regimes de Depósito, observado o art. 87 da Lei Complementar nº 214, de 2025.', 'Regimes de Depósito (art. 87, Parágrafo único)', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art87', 0.0, 0.0, '2026-06-22'),
  ('550006', 'Regimes de Permanência Temporária, observado o art. 88 da Lei Complementar nº 214, de 2025.', 'Regimes de Permanência Temporária', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art88', 0.0, 0.0, '2026-06-22'),
  ('550007', 'Regimes de Aperfeiçoamento, observado o art. 90 da Lei Complementar nº 214, de 2025.', 'Regimes de Aperfeiçoamento', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art90', 0.0, 0.0, '2026-06-22'),
  ('550008', 'Importação de bens para o Regime de Repetro-Temporário, de que tratam o inciso I do art. 93 da Lei Complementar nº 214, de 2025.', 'Importação de bens para o Regime de Repetro-Temporário', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93', 0.0, 0.0, '2026-06-22'),
  ('550009', 'GNL-Temporário, de que trata o inciso II do art. 93 da Lei Complementar nº 214, de 2025.', 'GNL-Temporário', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93', 0.0, 0.0, '2026-06-22'),
  ('550010', 'Repetro-Permanente, de que trata o inciso III do art. 93 da Lei Complementar nº 214, de 2025.', 'Repetro-Permanente', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93', 0.0, 0.0, '2026-06-22'),
  ('550011', 'Repetro-Industrialização, de que trata o inciso IV do art. 93 da Lei Complementar nº 214, de 2025.', 'Repetro-Industrialização', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93', 0.0, 0.0, '2026-06-22'),
  ('550012', 'Repetro-Nacional, de que trata o inciso V do art. 93 da Lei Complementar nº 214, de 2025.', 'Repetro-Nacional', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93', 0.0, 0.0, '2026-06-22'),
  ('550013', 'Repetro-Entreposto, de que trata o inciso VI do art. 93 da Lei Complementar nº 214, de 2025.', 'Repetro-Entreposto', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93', 0.0, 0.0, '2026-06-22'),
  ('550014', 'Zona de Processamento de Exportação, observado os arts. 99, 100 e 102 da Lei Complementar nº 214, de 2025.', 'Zona de Processamento de Exportação', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art99', 0.0, 0.0, '2026-06-22'),
  ('550015', 'Regime Tributário para Incentivo à Modernização e à Ampliação da Estrutura Portuária - Reporto, observado o art. 105 da Lei Complementar nº 214, de 2025.', 'Regime Tributário para Incentivo à Modernização e à Ampliação da Estrutura Portuária', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art105', 0.0, 0.0, '2026-06-22'),
  ('550016', 'Regime Especial de Incentivos para o Desenvolvimento da Infraestrutura - Reidi, observado o art. 106 da Lei Complementar nº 214, de 2025.', 'Regime Especial de Incentivos para o Desenvolvimento da Infraestrutura', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art106', 0.0, 0.0, '2026-06-22'),
  ('550017', 'Regime Tributário para Incentivo à Atividade Econômica Naval – Renaval, observado o art. 107 da Lei Complementar nº 214, de 2025.', 'Regime Tributário para Incentivo à Atividade Econômica Naval', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art107', 0.0, 0.0, '2026-06-22'),
  ('550018', 'Desoneração da aquisição de bens de capital, observado o art. 109 da Lei Complementar nº 214, de 2025.', 'Desoneração da aquisição de bens de capital', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art109', 0.0, 0.0, '2026-06-22'),
  ('550019', 'Importação de bem material por indústria incentivada para utilização na Zona Franca de Manaus, observado o art. 443 da Lei Complementar nº 214, de 2025.', 'Importação de bem material por indústria incentivada para utilização na ZFM', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art443', 0.0, 0.0, '2026-06-22'),
  ('550020', 'Áreas de livre comércio, observado o art. 461 da Lei Complementar nº 214, de 2025.', 'Áreas de livre comércio', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art461', 0.0, 0.0, '2026-06-22'),
  ('550021', 'Fornecimento de produtos agropecuários in natura para contribuinte do regime regular que promova industrialização destinada a exportação, observado o art. 82 da Lei Complementar nº 214, de 2025.
', 'Industrialização destinada a exportações
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art82
', 0.0, 0.0, '2026-06-22'),
  ('550022', 'Regime Especial de Incentivos para a Produção de Hidrogênio de Baixa Emissão de Carbono (Rehidro),  observado o art. 106 da Lei Complementar nº 214, de 2025.', 'Regime Especial de Incentivos para a Produção de Hidrogênio de Baixa Emissão de Carbono (Rehidro)', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art106', 0.0, 0.0, '2026-06-22'),
  ('550023', 'Operações com hidrocarbonetos líquidos derivados de petróleo não combustíveis ou de gás natural, inclusive nafta, observado o art. 172 da Lei Complementar nº 214, de 2025.', 'Operações com hidrocarbonetos líquidos derivados de petróleo não combustíveis ou de gás natural, inclusive nafta', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art172', 0.0, 0.0, '2026-06-22'),
  ('550024', 'Importações e nas aquisições no mercado interno de máquinas, equipamentos e veículos destinados a utilização nas atividades de que trata o inciso IIIdo art. 107 efetuadas para incorporação a seu ativo imobilizado, observado o art. 107 da Lei Complementar nº 214, de 2025.', 'Regime Tributário para Incentivo à Atividade Naval - Renaval (Art. 107, II)', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art107', 0.0, 0.0, '2026-06-22'),
  ('550025', 'Importações e nas aquisições no mercado interno de matérias-primas, produtos intermediários, partes, peças e componentes para utilização na construção, conservação, modernização e reparo de embarcações pré-registradas ou registradas no REB, observado o art. 107 da Lei Complementar nº 214, de 2025.', 'Regime Tributário para Incentivo à Atividade Naval - Renaval (Art. 107, III)', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art107', 0.0, 0.0, '2026-06-22'),
  ('620001', 'Tributação monofásica sobre combustíveis, observados os art. 172 da Lei Complementar nº 214, de 2025.', 'Tributação monofásica sobre combustíveis', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art172', 0.0, 0.0, '2026-06-22'),
  ('620002', 'Tributação monofásica com responsabilidade pela retenção sobre combustíveis, observado o art. 178 da Lei Complementar nº 214, de 2025.', 'Tributação monofásica com responsabilidade pela retenção sobre combustíveis', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art178', 0.0, 0.0, '2026-06-22'),
  ('620003', 'Tributação monofásica com responsabilidade de retenção de tributos por terceiros, observado o art. 178 da Lei Complementar nº 214, de 2025.', 'Tributação monofásica com responsabilidade de retenção de tributos por terceiros', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art178', 0.0, 0.0, '2026-06-22'),
  ('620004', 'Tributação monofásica sobre mistura de EAC com gasolina A em percentual superior ou inferior ao obrigatório, observado o art. 179 da Lei Complementar nº 214, de 2025.', 'Tributação monofásica sobre mistura de EAC com gasolina A em percentual superior ao obrigatório', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art179', 0.0, 0.0, '2026-06-22'),
  ('620005', 'Tributação monofásica sobre mistura de EAC com gasolina A em percentual superior ou inferior ao obrigatório, observado o art. 179 da Lei Complementar nº 214, de 2025.', 'Tributação monofásica sobre mistura de EAC com gasolina A em percentual inferior ao obrigatório', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art179', 0.0, 0.0, '2026-06-22'),
  ('620006', 'Tributação monofásica sobre combustíveis cobrada anteriormente, observador o art. 180 da Lei Complementar nº 214, de 2025.', 'Tributação monofásica sobre combustíveis cobrada anteriormente', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art180', 0.0, 0.0, '2026-06-22'),
  ('620007', 'Perecimento, deteriorização, roubo, furto ou extravio no regime monofásico sem estorno de crédito, observado o art. 47 da Lei Complementar nº 214, de 2025.', 'Perecimento, deteriorização, roubo, furto ou extravio no regime monofásico', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art47', 0.0, 0.0, '2026-06-22'),
  ('800001', 'Fusão, cisão ou incorporação, observado o art. 55 da Lei Complementar nº 214, de 2025.', 'Fusão, cisão ou incorporação', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art55', 0.0, 0.0, '2026-06-22'),
  ('800002', 'Transferência de crédito do associado, inclusive as cooperativas singulares, para cooperativa de que participa das operações antecedentes às operações em que fornece bens e serviços e os créditos presumidos, observado o art. 272 da Lei Complementar nº 214, de 2025.', 'Transferência de crédito do associado, inclusive as cooperativas singulares', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art272', 0.0, 0.0, '2026-06-22'),
  ('810001', 'Crédito presumido sobre o valor apurado nos fornecimentos a partir da Zona Franca de Manaus, observado o art. 450 da Lei Complementar nº 214, de 2025.', 'Crédito presumido sobre o valor apurado nos fornecimentos a partir da ZFM', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art450', 0.0, 0.0, '2026-06-22'),
  ('811001', 'Anulação de crédito proporcional ao valor das operações imunes e isentas, observado o art. 51 da Lei Complementar nº 214, de 2025.
', 'Anulação de Crédito por Saídas Imunes/Isentas
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art51
', 0.0, 0.0, '2026-06-22'),
  ('811002', 'Débitos de notas fiscais não processadas na apuração, observado o art. 45 da Lei Complementar nº 214, de 2025.
', 'Débitos de notas fiscais não processadas na apuração
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art45
', 0.0, 0.0, '2026-06-22'),
  ('811003', 'Débitos apurados após o desenquadramento do regime Simples Nacional, observado o art. 41 da Lei Complementar nº 214, de 2025.
', 'Desenquadramento do Simples Nacional
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art41
', 0.0, 0.0, '2026-06-22'),
  ('820001', 'Documento com informações de fornecimento de serviços de planos de assistência à saúde elencados no art. 234 da Lei Complementar nº 214, de 2025, mas com tributação realizada por outro meio', 'Documento com informações de fornecimento de serviços de planos de assistência à saúde elencados no art. 234 da Lei Complementar nº214, de 2025', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art234', 0.0, 0.0, '2026-06-22'),
  ('820002', 'Documento com informações de fornecimento de serviços de planos de assinstência funerária, mas com tributação realizada por outro meio, observado o art. 236 da Lei Complementar nº 214, de 2025.', 'Documento com informações de fornecimento de serviços de planos de assinstência funerária', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art236', 0.0, 0.0, '2026-06-22'),
  ('820003', 'Documento com informações de fornecimento de serviços de planos de assinstência à saúde de animais domésticos, mas com tributação realizada por outro meio, observado o art. 243 da Lei Complementar nº 214, de 2025.', 'Documento com informações de fornecimento de serviços de planos de assistência à saúde de animais domésticos', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art243', 0.0, 0.0, '2026-06-22'),
  ('820004', 'Documento com informações de prestação de serviços de consursos de prognósticos, mas com tributação realizada por outro meio, observado o art. 248 da Lei Complementar nº 214, de 2025.', 'Documento com informações de prestação de serviços de consursos de prognósticos', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art248', 0.0, 0.0, '2026-06-22'),
  ('820005', 'Documento com informações de alienação de bens imóveis, mas com tributação realizada por outro meio,, observado o art. 254 da Lei Complementar nº 214, de 2025.', 'Documento com informações de alienação de bens imóveis', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art254', 0.0, 0.0, '2026-06-22'),
  ('820006', 'Documento com informações de fornecimento de serviços de exploração de via, mas com tributação realizada por outro meio, observado o art. 11 da Lei Complementar nº 214, de 2025.
', 'Documento com informações de fornecimento de serviços de exploração de via
', '2025-09-30', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art11
', 0.0, 0.0, '2026-06-22'),
  ('820007', 'Documento com informações de fornecimento de serviços financeiros, mas com tributação realizada por outro meio, observado o art. 181 da Lei Complementar nº 214, de 2025.', 'Documento com informações de fornecimento de serviços financeiros', '2025-11-19', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art181', 0.0, 0.0, '2026-06-22'),
  ('820008', 'Documento com informações de fornecimento de serviço continuado, mas com tributação realizada em fatura anterior, observado o art. 10 da Lei Complementar nº 214, de 2025.', 'Documento com informações de fornecimento de serviço continuado, mas com tributação realizada em fatura anterior', '2025-11-19', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art10', 0.0, 0.0, '2026-06-22'),
  ('820009', 'Cobrança relativa a fornecimentos declarados em outro documento, observado o art. 60 da Lei Complementar nº 214, de 2025.', 'Cobrança relativa a fornecimentos declarados em outro documento', '2026-01-01', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art60', 0.0, 0.0, '2026-06-22'),
  ('830001', 'Documento com  exclusão da base de cálculo da CBS e do IBS refrente à energia elétrica fornecida pela distribuidora à unidade consumidora, conforme  Art 28, parágrafos 3° e 4°.', 'Documento com exclusão da BC da CBS e do IBS de energia elétrica fornecida pela distribuidora à UC', '2025-05-05', NULL, 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art28', 0.0, 0.0, '2026-06-22')
) AS v(codigo, desc_of, nome_red, ini, fim, url, red_ibs, red_cbs, pub)
WHERE c.codigo = v.codigo;

-- Coerencia com a fracao que o codigo consome: se as duas deixarem de bater,
-- alguem mexeu numa sem mexer na outra.
ALTER TABLE cclasstrib_ibscbs
  DROP CONSTRAINT IF EXISTS chk_reducao_fracao_x_percentual;
ALTER TABLE cclasstrib_ibscbs
  ADD CONSTRAINT chk_reducao_fracao_x_percentual CHECK (
    perc_reducao_ibs_oficial IS NULL
    OR (ABS(perc_reducao_ibs * 100 - perc_reducao_ibs_oficial) < 0.001
        AND ABS(perc_reducao_cbs * 100 - perc_reducao_cbs_oficial) < 0.001)
  );


-- ---------------------------------------------------------------------------
-- [F2] Correlacao oficial item da LC 116 -> cClassTrib.
--
-- Esta e a tabela que tira o mapeamento do terreno do "achismo": para 147 dos
-- 208 itens o Anexo VIII indica UM unico cClassTrib. `ordem` preserva a
-- sequencia da planilha — o primeiro e o caso geral, os seguintes sao
-- alternativas condicionadas a situacao especifica.
--
-- ATENCAO: correlacao NAO e elegibilidade. O Anexo VIII diz quais codigos se
-- relacionam ao ITEM DE SERVICO; se aquele contribuinte especifico pode usar
-- um deles depende do enquadramento dele. Por isso so o caso geral
-- (000001, tributacao integral) e aplicado sem confirmacao.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS item_lc116_cclasstrib (
  item_lc116 TEXT    NOT NULL,
  cclasstrib TEXT    NOT NULL REFERENCES cclasstrib_ibscbs(codigo),
  ordem      INTEGER NOT NULL,
  PRIMARY KEY (item_lc116, cclasstrib)
);

COMMENT ON TABLE item_lc116_cclasstrib IS
  'Anexo VIII V1.01.00 (NT 008) — correlacao item da lista da LC 116/2003 com '
  'os cClassTrib possiveis. Correlacao, nao elegibilidade.';

CREATE INDEX IF NOT EXISTS idx_item_lc116_cclasstrib_item
  ON item_lc116_cclasstrib (item_lc116, ordem);

INSERT INTO item_lc116_cclasstrib (item_lc116, cclasstrib, ordem) VALUES
  ('01.01', '000001', 1),
  ('01.01', '200043', 2),
  ('01.01', '200044', 3),
  ('01.02', '000001', 1),
  ('01.02', '200043', 2),
  ('01.02', '200044', 3),
  ('01.03', '000001', 1),
  ('01.04', '000001', 1),
  ('01.04', '200043', 2),
  ('01.04', '200044', 3),
  ('01.05', '000001', 1),
  ('01.06', '000001', 1),
  ('01.06', '200043', 2),
  ('01.06', '200044', 3),
  ('01.07', '000001', 1),
  ('01.08', '000001', 1),
  ('01.08', '200040', 2),
  ('01.09', '000001', 1),
  ('02.01', '000001', 1),
  ('02.01', '200016', 2),
  ('03.02', '000001', 1),
  ('03.03', '200027', 1),
  ('03.04', '200027', 1),
  ('03.05', '000001', 1),
  ('03.05', '200039', 2),
  ('04.01', '200029', 1),
  ('04.02', '200029', 1),
  ('04.03', '200029', 1),
  ('04.04', '200029', 1),
  ('04.05', '200029', 1),
  ('04.06', '200029', 1),
  ('04.07', '200029', 1),
  ('04.08', '200029', 1),
  ('04.09', '200029', 1),
  ('04.10', '200029', 1),
  ('04.11', '200029', 1),
  ('04.12', '200029', 1),
  ('04.13', '200029', 1),
  ('04.14', '200029', 1),
  ('04.15', '200029', 1),
  ('04.16', '200029', 1),
  ('04.17', '200029', 1),
  ('04.18', '200029', 1),
  ('04.19', '200029', 1),
  ('04.20', '200029', 1),
  ('04.21', '200029', 1),
  ('04.22', '820001', 1),
  ('04.23', '820001', 1),
  ('05.01', '200052', 1),
  ('05.01', '200038', 2),
  ('05.02', '000001', 1),
  ('05.02', '200038', 2),
  ('05.03', '000001', 1),
  ('05.03', '200038', 2),
  ('05.04', '000001', 1),
  ('05.04', '200038', 2),
  ('05.05', '000001', 1),
  ('05.06', '000001', 1),
  ('05.07', '000001', 1),
  ('05.07', '200038', 2),
  ('05.08', '000001', 1),
  ('05.09', '820003', 1),
  ('06.01', '000001', 1),
  ('06.02', '000001', 1),
  ('06.03', '000001', 1),
  ('06.04', '200041', 1),
  ('06.04', '000001', 2),
  ('06.05', '000001', 1),
  ('06.06', '000001', 1),
  ('07.01', '200052', 1),
  ('07.01', '000001', 2),
  ('07.01', '200038', 3),
  ('07.02', '200046', 1),
  ('07.02', '200045', 2),
  ('07.02', '200038', 3),
  ('07.03', '000001', 1),
  ('07.03', '200045', 2),
  ('07.03', '200052', 3),
  ('07.04', '200046', 1),
  ('07.04', '200045', 2),
  ('07.05', '200046', 1),
  ('07.05', '200045', 2),
  ('07.05', '200038', 3),
  ('07.06', '200046', 1),
  ('07.06', '200045', 2),
  ('07.07', '200046', 1),
  ('07.07', '200045', 2),
  ('07.08', '200046', 1),
  ('07.08', '200045', 2),
  ('07.09', '000001', 1),
  ('07.10', '000001', 1),
  ('07.10', '200045', 2),
  ('07.11', '000001', 1),
  ('07.12', '000001', 1),
  ('07.13', '000001', 1),
  ('07.13', '200038', 2),
  ('07.16', '000001', 1),
  ('07.16', '200038', 2),
  ('07.16', '200037', 3),
  ('07.17', '200046', 1),
  ('07.17', '200045', 2),
  ('07.18', '000001', 1),
  ('07.18', '200045', 2),
  ('07.19', '200052', 1),
  ('07.19', '200045', 2),
  ('07.20', '000001', 1),
  ('07.20', '200045', 2),
  ('07.21', '000001', 1),
  ('07.22', '000001', 1),
  ('08.01', '200028', 1),
  ('08.01', '200025', 2),
  ('08.02', '000001', 1),
  ('08.02', '200028', 2),
  ('09.01', '200048', 1),
  ('09.02', '200051', 1),
  ('09.03', '200051', 1),
  ('10.01', '000001', 1),
  ('10.01', '011003', 2),
  ('10.02', '000001', 1),
  ('10.03', '000001', 1),
  ('10.04', '000001', 1),
  ('10.05', '200046', 1),
  ('10.05', '000001', 2),
  ('10.06', '000001', 1),
  ('10.07', '000001', 1),
  ('10.08', '000001', 1),
  ('10.09', '000001', 1),
  ('10.10', '000001', 1),
  ('11.01', '000001', 1),
  ('11.02', '000001', 1),
  ('11.03', '000001', 1),
  ('11.04', '000001', 1),
  ('11.05', '000001', 1),
  ('12.01', '200039', 1),
  ('12.01', '000001', 2),
  ('12.02', '200039', 1),
  ('12.02', '000001', 2),
  ('12.03', '200039', 1),
  ('12.03', '000001', 2),
  ('12.04', '200039', 1),
  ('12.04', '000001', 2),
  ('12.05', '200048', 1),
  ('12.06', '000001', 1),
  ('12.07', '200039', 1),
  ('12.07', '000001', 2),
  ('12.08', '200039', 1),
  ('12.08', '000001', 2),
  ('12.09', '000001', 1),
  ('12.10', '000001', 1),
  ('12.11', '200042', 1),
  ('12.11', '000001', 2),
  ('12.12', '200039', 1),
  ('12.12', '000001', 2),
  ('12.13', '200039', 1),
  ('12.13', '000001', 2),
  ('12.14', '200039', 1),
  ('12.14', '000001', 2),
  ('12.15', '200039', 1),
  ('12.15', '000001', 2),
  ('12.16', '200039', 1),
  ('12.16', '000001', 2),
  ('12.17', '000001', 1),
  ('13.02', '200039', 1),
  ('13.02', '000001', 2),
  ('13.03', '000001', 1),
  ('13.03', '200039', 2),
  ('13.04', '000001', 1),
  ('13.05', '000001', 1),
  ('14.01', '000001', 1),
  ('14.01', '200044', 2),
  ('14.02', '000001', 1),
  ('14.02', '200044', 2),
  ('14.03', '000001', 1),
  ('14.04', '000001', 1),
  ('14.05', '000001', 1),
  ('14.06', '000001', 1),
  ('14.07', '000001', 1),
  ('14.08', '000001', 1),
  ('14.09', '000001', 1),
  ('14.10', '000001', 1),
  ('14.11', '000001', 1),
  ('14.12', '000001', 1),
  ('14.13', '000001', 1),
  ('14.14', '000001', 1),
  ('15.01', '820007', 1),
  ('15.02', '820007', 1),
  ('15.03', '820007', 1),
  ('15.04', '820007', 1),
  ('15.05', '820007', 1),
  ('15.06', '820007', 1),
  ('15.07', '820007', 1),
  ('15.08', '820007', 1),
  ('15.09', '820007', 1),
  ('15.10', '820007', 1),
  ('15.11', '820007', 1),
  ('15.12', '820007', 1),
  ('15.13', '820007', 1),
  ('15.14', '820007', 1),
  ('15.15', '820007', 1),
  ('15.16', '820007', 1),
  ('15.17', '820007', 1),
  ('15.18', '820007', 1),
  ('16.01', '400001', 1),
  ('16.01', '200021', 2),
  ('16.01', '000001', 3),
  ('16.02', '000001', 1),
  ('17.01', '000001', 1),
  ('17.02', '000001', 1),
  ('17.03', '000001', 1),
  ('17.04', '000001', 1),
  ('17.05', '000001', 1),
  ('17.06', '000001', 1),
  ('17.08', '000001', 1),
  ('17.09', '200038', 1),
  ('17.09', '000001', 2),
  ('17.10', '000001', 1),
  ('17.11', '000001', 1),
  ('17.12', '200046', 1),
  ('17.12', '000001', 2),
  ('17.13', '000001', 1),
  ('17.14', '200052', 1),
  ('17.15', '000001', 1),
  ('17.16', '200052', 1),
  ('17.16', '000001', 2),
  ('17.17', '000001', 1),
  ('17.18', '000001', 1),
  ('17.19', '200052', 1),
  ('17.20', '200052', 1),
  ('17.21', '200052', 1),
  ('17.22', '000001', 1),
  ('17.23', '000001', 1),
  ('17.24', '000001', 1),
  ('17.25', '000001', 1),
  ('18.01', '000001', 1),
  ('19.01', '000001', 1),
  ('20.01', '000001', 1),
  ('20.02', '000001', 1),
  ('20.03', '000001', 1),
  ('21.01', '000001', 1),
  ('22.01', '820006', 1),
  ('23.01', '000001', 1),
  ('24.01', '000001', 1),
  ('25.01', '000001', 1),
  ('25.01', '200029', 2),
  ('25.02', '000001', 1),
  ('25.02', '200029', 2),
  ('25.03', '820002', 1),
  ('25.04', '000001', 1),
  ('25.05', '000001', 1),
  ('26.01', '000001', 1),
  ('27.01', '200052', 1),
  ('28.01', '000001', 1),
  ('29.01', '000001', 1),
  ('29.01', '200052', 2),
  ('30.01', '200052', 1),
  ('31.01', '200052', 1),
  ('32.01', '000001', 1),
  ('33.01', '000001', 1),
  ('34.01', '000001', 1),
  ('35.01', '000001', 1),
  ('35.01', '200040', 2),
  ('35.01', '200052', 3),
  ('36.01', '000001', 1),
  ('37.01', '000001', 1),
  ('37.01', '200039', 2),
  ('38.01', '200039', 1),
  ('38.01', '000001', 2),
  ('38.01', '200052', 3),
  ('39.01', '000001', 1),
  ('40.01', '000001', 1),
  ('99.02.01', '200039', 1),
  ('99.02.01', '000001', 2),
  ('99.02.01', '200038', 3),
  ('99.03.01', '200027', 1),
  ('99.03.01', '200026', 2),
  ('99.03.01', '200048', 3),
  ('99.03.02', '200027', 1),
  ('99.03.03', '200027', 1),
  ('99.03.04', '200027', 1),
  ('99.03.05', '200027', 1),
  ('99.04.01', '000001', 1)
ON CONFLICT (item_lc116, cclasstrib) DO UPDATE SET ordem = EXCLUDED.ordem;

-- RLS no mesmo padrao das demais tabelas de dominio (migration 20260805180000):
-- conteudo publico normativo, leitura para quem esta autenticado, escrita so
-- pelo service_role — que e quem o CLI de sincronizacao usa.
ALTER TABLE item_lc116_cclasstrib ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_fonte_versao   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_item_lc116_cclasstrib ON item_lc116_cclasstrib;
CREATE POLICY sel_item_lc116_cclasstrib ON item_lc116_cclasstrib
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sel_fiscal_fonte_versao ON fiscal_fonte_versao;
CREATE POLICY sel_fiscal_fonte_versao ON fiscal_fonte_versao
  FOR SELECT TO authenticated USING (true);

-- View de consumo: so o que vale para NFS-e e esta vigente hoje.
CREATE OR REPLACE VIEW item_lc116_cclasstrib_nfse AS
SELECT i.item_lc116,
       i.ordem,
       c.codigo,
       c.cst,
       c.descricao_oficial,
       c.perc_reducao_ibs,
       c.perc_reducao_cbs,
       c.ind_trib_regular,
       c.ind_cred_pres,
       c.artigo_lc214,
       c.url_legislacao
FROM item_lc116_cclasstrib i
JOIN cclasstrib_ibscbs c ON c.codigo = i.cclasstrib
WHERE c.aplica_nfse
  AND (c.vigencia_fim IS NULL OR c.vigencia_fim > CURRENT_DATE)
ORDER BY i.item_lc116, i.ordem;


INSERT INTO fiscal_fonte_versao (fonte, url, versao, publicado_em, hash_conteudo, registros)
VALUES
  ('svrs_cclasstrib', 'https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria',
   'pub-2026-06-22', '2026-06-22', 'f2f0688022232d5d7a7bacfd18f8864085765b46642af118173be0e9800fb1cc', 164),
  ('nfse_anexo_viii', 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-01-00.xlsx',
   'V1.01.00', NULL, '0e5df30846016bae1e0f9c4b0df677187b96e4b1867d2dd16fba1487de60d640', 281)
ON CONFLICT (fonte, hash_conteudo) DO NOTHING;
