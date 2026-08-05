-- ============================================================================
-- SEED das tabelas de domínio oficiais do grupo IBSCBS.
--
-- Fonte: `relatorio_pesquisa_oficial_ibscbs.md` + CSVs (05/08/2026), extração
-- ao vivo do DOM do Portal da Conformidade Fácil (SVRS/ENCAT) — o dado de
-- maior confiança da pesquisa, por não passar por nenhum modelo de resumo.
--   https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria
--   https://dfe-portal.svrs.rs.gov.br/CFF/TabelaCreditoPresumido
-- Documento normativo associado: Informe Técnico 2025.002 v1.50 (15/04/2026);
-- tabela do portal atualizada em 22/06/2026.
--
-- CONFERÊNCIA FEITA ANTES DE GERAR ESTE ARQUIVO:
--   · 164 códigos, contagem por CST idêntica à esperada em ibscbs.ts;
--   · todos com 6 dígitos, sem duplicata, prefixo sempre igual ao CST;
--   · os 18 indicadores de subgrupo do CST batem 100% com TABELA_CST —
--     ou seja, a lógica de validarDeclaracao() está confirmada correta.
--
-- O QUE ESTE SEED NÃO TRAZ (e por quê):
--   · perc_reducao_ibs / perc_reducao_cbs, ind_* e tipo_aliquota ficam NULL:
--     essas colunas existem no portal mas NÃO vieram no CSV exportado. Sem
--     elas não dá para calcular redução a partir do cClassTrib — continua
--     valendo a alíquota do regime. É lacuna de dado, não de código.
--   · vigencia_inicio / vigencia_fim ficam NULL: confirmado na pesquisa que
--     a coluna dIniVig/dFimVig NÃO EXISTE na fonte para cClassTrib e CST
--     (todas as 164 linhas vêm com "Não localizado em documentação oficial").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Alinhar a descrição de dois CSTs ao texto oficial do portal.
-- Só texto: os indicadores já estavam corretos.
-- ----------------------------------------------------------------------------
UPDATE cst_ibscbs SET descricao = 'Tributação com alíquotas uniformes'          WHERE codigo = '010';
UPDATE cst_ibscbs SET descricao = 'Tributação com alíquotas uniformes reduzidas' WHERE codigo = '011';

-- ----------------------------------------------------------------------------
-- 2. cClassTrib — 164 códigos oficiais.
-- `artigo_lc214` e `url_dispositivo` vêm da coluna `artigo_legal` do CSV,
-- que traz "Art. N da LC 214/2025 - <url do Planalto>" — separados aqui.
-- ----------------------------------------------------------------------------
INSERT INTO cclasstrib_ibscbs (codigo, cst, descricao, artigo_lc214, url_dispositivo) VALUES
  ('000001', '000', 'Situações tributadas integralmente pelo IBS e CBS.', 'Art. 4º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art4'),
  ('000002', '000', 'Exploração de via', 'Art. 11 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art11'),
  ('000003', '000', 'Regime automotivo - projetos incentivados (art. 311)', 'Art. 311 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art311'),
  ('000004', '000', 'Regime automotivo - projetos incentivados (art. 312)', 'Art. 312 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art312'),
  ('000005', '000', 'Operação com EAC destinado à mistura com gasolina A, mas com saída do biocombustível com destinação diversa', 'Art. 179 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art179'),
  ('010001', '010', 'Operações do FGTS não realizadas pela Caixa Econômica Federal', 'Art. 212 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art212'),
  ('010002', '010', 'Operações do serviço financeiro', 'Art. 233 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art233'),
  ('011001', '011', 'Planos de assistência funerária.', 'Art. 236 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art236'),
  ('011002', '011', 'Planos de assistência à saúde', 'Art. 237 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art237'),
  ('011003', '011', 'Intermediação de planos de assistência à saúde', 'Art. 240 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art240'),
  ('011004', '011', 'Concursos e prognósticos', 'Art. 246 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art246'),
  ('011005', '011', 'Planos de assistência à saúde de animais domésticos', 'Art. 243 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art243'),
  ('200001', '200', 'Serviços de transporte de bens até as zonas de processamento de exportação e bens exportados a partir das zonas de processamento de exportação', 'Art. 103 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art103'),
  ('200002', '200', 'Fornecimento ou importação para produtor rural não contribuinte ou TAC', 'Art. 110 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art110'),
  ('200003', '200', 'Vendas de produtos destinados à alimentação humana (Anexo I)', 'Art. 125 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art125'),
  ('200004', '200', 'Fornecimento de dispositivos médicos (Anexo XII)', 'Art. 144 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art144'),
  ('200005', '200', 'Fornecimento de dispositivos médicos para órgãos da administração pública e entidades de saúde imunes (Anexo IV)', 'Art. 144 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art144'),
  ('200006', '200', 'Situação de emergência de saúde pública reconhecida pelo Poder público', 'Art. 144 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art144'),
  ('200007', '200', 'Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência (Anexo XIII)', 'Art. 145 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art145'),
  ('200008', '200', 'Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência adquiridos por órgãos da administração pública (Anexo V)', 'Art. 145 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art145'),
  ('200009', '200', 'Fornecimento dos medicamentos registrados na Anvisa', 'Art. 146 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146'),
  ('200010', '200', 'Fornecimento dos medicamentos registrados na Anvisa, adquiridos por órgãos da administração pública', 'Art. 146 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146'),
  ('200011', '200', 'Fornecimento das composições para nutrição enteral e parenteral quando adquiridas por órgãos da administração pública (Anexo VI)', 'Art. 146 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146'),
  ('200012', '200', 'Situação de emergência de saúde pública reconhecida pelo Poder público', 'Art. 146 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146'),
  ('200013', '200', 'Fornecimento de tampões higiênicos, absorventes higiênicos internos ou externos', 'Art. 147 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art147'),
  ('200014', '200', 'Fornecimento dos produtos hortícolas, frutas e ovos (Anexo XV)', 'Art. 148 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art148'),
  ('200015', '200', 'Venda de automóveis de passageiros de fabricação nacional adquiridos por motoristas profissionais ou pessoas com deficiência', 'Art. 149 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art149'),
  ('200016', '200', 'Prestação de serviços de pesquisa e desenvolvimento por Instituição Científica, Tecnológica e de Inovação (ICT)', 'Art. 156 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art156'),
  ('200017', '200', 'Operações relacionadas ao FGTS', 'Art. 212 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art212'),
  ('200018', '200', 'Operações de resseguro e retrocessão', 'Art. 223 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art223'),
  ('200019', '200', 'Importador dos serviços financeiros contribuinte', 'Art. 231 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art231'),
  ('200020', '200', 'Operação praticada por sociedades cooperativas optantes por regime específico do IBS e CBS', 'Art. 271 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art271'),
  ('200021', '200', 'Serviços de transporte público coletivo de passageiros ferroviário e hidroviário', 'Art. 285 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art285'),
  ('200022', '200', 'Operação originada fora da ZFM que destine bem material industrializado a contribuinte estabelecido na ZFM', 'Art. 445 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art445'),
  ('200023', '200', 'Operação realizada por indústria incentivada que destine bem material intermediário para outra indústria incentivada na ZFM', 'Art. 448 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art448'),
  ('200024', '200', 'Operação originada fora das Áreas de Livre Comércio destinadas a contribuinte estabelecido nas Áreas de Livre Comércio', 'Art. 463 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art463'),
  ('200025', '200', 'Fornecimento dos serviços de educação relacionados ao Programa Universidade para Todos (Prouni)', 'Art. 308 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art308'),
  ('200026', '200', 'Locação de imóveis localizados nas zonas reabilitadas', 'Art. 158 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art158'),
  ('200027', '200', 'Operações de locação, cessão onerosa e arrendamento de bens imóveis', 'Art. 261 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art261'),
  ('200028', '200', 'Fornecimento dos serviços de educação (Anexo II)', 'Art. 129 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art129'),
  ('200029', '200', 'Fornecimento dos serviços de saúde humana (Anexo III)', 'Art. 130 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art130'),
  ('200030', '200', 'Venda dos dispositivos médicos (Anexo IV)', 'Art. 131 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art131'),
  ('200031', '200', 'Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência (Anexo V)', 'Art. 132 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art132'),
  ('200032', '200', 'Fornecimento dos medicamentos registrados na Anvisa ou produzidos por farmácias de manipulação, ressalvados os medicamentos sujeitos à alíquota zero', 'Art. 133 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art133'),
  ('200033', '200', 'Fornecimento das composições para nutrição enteral e parenteral (Anexo VI)', 'Art. 133 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art133'),
  ('200034', '200', 'Fornecimento dos alimentos destinados ao consumo humano (Anexo VII)', 'Art. 135 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art135'),
  ('200035', '200', 'Fornecimento dos produtos de higiene pessoal e limpeza (Anexo VIII)', 'Art. 136 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art136'),
  ('200036', '200', 'Fornecimento de produtos agropecuários, aquícolas, pesqueiros, florestais e extrativistas vegetais in natura', 'Art. 137 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art137'),
  ('200037', '200', 'Fornecimento de serviços ambientais de conservação ou recuperação da vegetação nativa', 'Art. 137 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art137'),
  ('200038', '200', 'Fornecimento dos insumos agropecuários e aquícolas (Anexo IX)', 'Art. 138 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art138'),
  ('200039', '200', 'Fornecimento dos bens e serviços relacionados com produções nacionais artísticas, culturais, de eventos, jornalísticas e audiovisuais (Anexo X)', 'Art. 139 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art139'),
  ('200040', '200', 'Fornecimento de serviços de comunicação institucional à administração pública', 'Art. 140 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art140'),
  ('200041', '200', 'Fornecimento de serviço de educação desportiva (art. 141. I)', 'Art. 141 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art141'),
  ('200042', '200', 'Fornecimento de serviço de gestão e exploração do desporto (art. 141. II)', 'Art. 141 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art141'),
  ('200043', '200', 'Fornecimento à administração pública dos serviços e dos bens relativos à soberania (Anexo XI)', 'Art. 142 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art142'),
  ('200044', '200', 'Operações e prestações de serviços de segurança da informação e segurança cibernética desenv por sociedade que tenha sócio brasileiro (Anexo XI)', 'Art. 142 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art142'),
  ('200045', '200', 'Operações relacionadas a projetos de reabilitação urbana de zonas históricas e de áreas críticas de recuperação e reconversão urbanística', 'Art. 158 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art158'),
  ('200046', '200', 'Operações com bens imóveis', 'Art. 261 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art261'),
  ('200047', '200', 'Bares e Restaurantes', 'Art. 275 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art275'),
  ('200048', '200', 'Hotelaria, Parques de Diversão e Parques Temáticos', 'Art. 281 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art281'),
  ('200049', '200', 'Transporte coletivo de passageiros rodoviário, ferroviário e hidroviário', 'Art. 286 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art286'),
  ('200050', '200', 'Serviços de transporte aéreo regional coletivo de passageiros ou de carga', 'Art. 287 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art287'),
  ('200051', '200', 'Agências de Turismo', 'Art. 289 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art289'),
  ('200052', '200', 'Prestação de serviços de profissões intelectuais', 'Art. 127 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art127'),
  ('200053', '200', 'Fornecimento de medicamentos registrados na Anvisa, quando classificados como soros ou vacinas', 'Art. 146 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art146'),
  ('200054', '200', 'Fornecimento de bem material pela cooperativa de produção agropecuária a associado não sujeito ao regime regular do IBS e da CBS', 'Art. 271 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art271'),
  ('220001', '220', 'Incorporação imobiliária submetida ao regime especial de tributação', 'Art. 485 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art485'),
  ('220002', '220', 'Incorporação imobiliária submetida ao regime especial de tributação', 'Art. 485 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art485'),
  ('220003', '220', 'Alienação de imóvel decorrente de parcelamento do solo', 'Art. 486 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art486'),
  ('221001', '221', 'Locação, cessão onerosa ou arrendamento de bem imóvel com alíquota sobre a receita bruta', 'Art. 484 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art484'),
  ('221002', '221', 'Incorporação imobiliária submetida ao regime especial de tributação', 'Art. 485 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art485'),
  ('221003', '221', 'Incorporação imobiliária submetida ao regime especial de tributação', 'Art. 485 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art485'),
  ('221004', '221', 'Alienação de imóvel decorrente de parcelamento do solo', 'Art. 486 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art486'),
  ('222001', '222', 'Transporte internacional de passageiros, caso os trechos de ida e volta sejam vendidos em conjunto', 'Art. 12 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art12'),
  ('400001', '400', 'Fornecimento de serviços de transporte público coletivo de passageiros rodoviário e metroviário', 'Art. 157 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art157'),
  ('400002', '400', 'Fornecimento de serviços de transporte público coletivo de passageiros rodoviário e metroviário com medição por quilômetro rodado', 'Art. 157 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art157'),
  ('410001', '410', 'Fornecimento de bonificações quando constem no documento fiscal e que não dependam de evento posterior', 'Art. 5º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art5'),
  ('410002', '410', 'Transferências entre estabelecimentos pertencentes ao mesmo contribuinte', 'Art. 6º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art6'),
  ('410003', '410', 'Doações sem contraprestação em benefício do doador', 'Art. 6º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art6'),
  ('410004', '410', 'Exportações de bens e serviços', 'Art. 8º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art8'),
  ('410005', '410', 'Fornecimentos realizados pela União, pelos Estados, pelo Distrito Federal e pelos Municípios', 'Art. 9º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9'),
  ('410006', '410', 'Fornecimentos realizados por entidades religiosas e templos de qualquer culto', 'Art. 9º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9'),
  ('410007', '410', 'Fornecimentos realizados por partidos políticos, entidades sindicais e instituições de educação e de assistência social', 'Art. 9º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9'),
  ('410008', '410', 'Fornecimentos de livros, jornais, periódicos e do papel destinado a sua impressão', 'Art. 9º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9'),
  ('410009', '410', 'Fornecimentos de fonogramas e videofonogramas musicais produzidos no Brasil', 'Art. 9º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9'),
  ('410010', '410', 'Fornecimentos de serviço de comunicação nas modalidades de radiodifusão sonora e de sons e imagens de recepção livre e gratuita', 'Art. 9º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9'),
  ('410011', '410', 'Fornecimentos de ouro, quando definido em lei como ativo financeiro ou instrumento cambial', 'Art. 9º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art9'),
  ('410012', '410', 'Fornecimento de condomínio edilício não optante pelo regime regular', 'Art. 26 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art26'),
  ('410013', '410', 'Exportações de combustíveis', 'Art. 98 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art98'),
  ('410014', '410', 'Fornecimento de produtor rural não contribuinte', 'Art. 164 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art164'),
  ('410015', '410', 'Fornecimento por transportador autônomo não contribuinte', 'Art. 169 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art169'),
  ('410016', '410', 'Fornecimento ou aquisição de resíduos sólidos', 'Art. 170 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art170'),
  ('410017', '410', 'Aquisição de bem móvel com crédito presumido sob condição de revenda realizada', 'Art. 171 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art171'),
  ('410018', '410', 'Operações relacionadas aos fundos garantidores e executores de políticas públicas', 'Art. 213 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art213'),
  ('410019', '410', 'Exclusão da gorjeta na base de cálculo no fornecimento de alimentação', 'Art. 274 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art274'),
  ('410020', '410', 'Exclusão do valor de intermediação na base de cálculo no fornecimento de alimentação', 'Art. 274 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art274'),
  ('410021', '410', 'Contribuição de que trata o art. 149-A da Constituição Federal', 'Art. 12 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art12'),
  ('410022', '410', 'Consolidação da propriedade do bem pelo credor', 'Art. 200 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art200'),
  ('410023', '410', 'Alienação de bens móveis ou imóveis que tenham sido objeto de garantia em que o prestador da garantia não seja contribuinte', 'Art. 200 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art200'),
  ('410024', '410', 'Consolidação da propriedade do bem pelo grupo de consórcio', 'Art. 204 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art204'),
  ('410025', '410', 'Alienação de bem que tenha sido objeto de garantia em que o prestador da garantia não seja contribuinte', 'Art. 204 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art204'),
  ('410026', '410', 'Doação com anulação de crédito', 'Art. 6º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art6'),
  ('410027', '410', 'Exportação de serviço ou de bem imaterial', 'Art. 80 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art80'),
  ('410028', '410', 'Operações com bens imóveis realizadas por pessoas físicas não consideradas contribuintes', 'Art. 251 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art251'),
  ('410029', '410', 'Operações acobertadas somente pelo ICMS', 'Art. 4º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art4'),
  ('410030', '410', 'Estorno de crédito por perecimento, deteriorização, roubo, furto ou extravio.', 'Art. 47 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art47'),
  ('410031', '410', 'Fornecimento em período anterior ao início de vigência de incidências de CBS e IBS', 'Art. 544 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art544'),
  ('410032', '410', 'Tributos incidentes na operação que não integram a base de cálculo do IBS e da CBS', 'Art. 12 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art12'),
  ('410033', '410', 'Operações de Fundos de Investimento Imobiliário (FII) e Fundos de Investimento nas Cadeias Produtivas do Agronegócio (Fiagro)', 'Art. 26 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art26'),
  ('410034', '410', 'Operações de fundos de investimento', 'Art. 26 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art26'),
  ('410035', '410', 'Fornecimento realizado por nanoempreendedor', 'Art. 26 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art26'),
  ('410036', '410', 'Descontos incondicionais', 'Art. 12 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art12'),
  ('410037', '410', 'Importação de bens materiais sem incidência de IBS e CBS', 'Art. 66 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art66'),
  ('410999', '410', 'Operações não onerosas sem previsão de tributação, não especificadas anteriormente', 'Art. 4º da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art4'),
  ('510001', '510', 'Operações, sujeitas a diferimento, com energia elétrica, relativas à importação, geração, comercialização, distribuição e transmissão', 'Art. 28 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art28'),
  ('515001', '515', 'Operações, sujeitas a diferimento, com insumos agropecuários e aquícolas (Anexo IX)', 'Art. 138 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art138'),
  ('550001', '550', 'Exportações de bens materiais', 'Art. 82 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art82'),
  ('550002', '550', 'Regime de Trânsito', 'Art. 84 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art84'),
  ('550003', '550', 'Regimes de Depósito (art. 85)', 'Art. 85 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art85'),
  ('550004', '550', 'Regimes de Depósito (art. 87)', 'Art. 87 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art87'),
  ('550005', '550', 'Regimes de Depósito (art. 87, Parágrafo único)', 'Art. 87 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art87'),
  ('550006', '550', 'Regimes de Permanência Temporária', 'Art. 88 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art88'),
  ('550007', '550', 'Regimes de Aperfeiçoamento', 'Art. 90 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art90'),
  ('550008', '550', 'Importação de bens para o Regime de Repetro-Temporário', 'Art. 93 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93'),
  ('550009', '550', 'GNL-Temporário', 'Art. 93 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93'),
  ('550010', '550', 'Repetro-Permanente', 'Art. 93 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93'),
  ('550011', '550', 'Repetro-Industrialização', 'Art. 93 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93'),
  ('550012', '550', 'Repetro-Nacional', 'Art. 93 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93'),
  ('550013', '550', 'Repetro-Entreposto', 'Art. 93 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art93'),
  ('550014', '550', 'Zona de Processamento de Exportação', 'Art. 99 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art99'),
  ('550015', '550', 'Regime Tributário para Incentivo à Modernização e à Ampliação da Estrutura Portuária', 'Art. 105 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art105'),
  ('550016', '550', 'Regime Especial de Incentivos para o Desenvolvimento da Infraestrutura', 'Art. 106 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art106'),
  ('550017', '550', 'Regime Tributário para Incentivo à Atividade Econômica Naval', 'Art. 107 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art107'),
  ('550018', '550', 'Desoneração da aquisição de bens de capital', 'Art. 109 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art109'),
  ('550019', '550', 'Importação de bem material por indústria incentivada para utilização na ZFM', 'Art. 443 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art443'),
  ('550020', '550', 'Áreas de livre comércio', 'Art. 461 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art461'),
  ('550021', '550', 'Industrialização destinada a exportações', 'Art. 82 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art82'),
  ('550022', '550', 'Regime Especial de Incentivos para a Produção de Hidrogênio de Baixa Emissão de Carbono (Rehidro)', 'Art. 106 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art106'),
  ('550023', '550', 'Operações com hidrocarbonetos líquidos derivados de petróleo não combustíveis ou de gás natural, inclusive nafta', 'Art. 172 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art172'),
  ('550024', '550', 'Regime Tributário para Incentivo à Atividade Naval - Renaval (Art. 107, II)', 'Art. 107 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art107'),
  ('550025', '550', 'Regime Tributário para Incentivo à Atividade Naval - Renaval (Art. 107, III)', 'Art. 107 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art107'),
  ('620001', '620', 'Tributação monofásica sobre combustíveis', 'Art. 172 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art172'),
  ('620002', '620', 'Tributação monofásica com responsabilidade pela retenção sobre combustíveis', 'Art. 178 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art178'),
  ('620003', '620', 'Tributação monofásica com responsabilidade de retenção de tributos por terceiros', 'Art. 178 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art178'),
  ('620004', '620', 'Tributação monofásica sobre mistura de EAC com gasolina A em percentual superior ao obrigatório', 'Art. 179 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art179'),
  ('620005', '620', 'Tributação monofásica sobre mistura de EAC com gasolina A em percentual inferior ao obrigatório', 'Art. 179 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art179'),
  ('620006', '620', 'Tributação monofásica sobre combustíveis cobrada anteriormente', 'Art. 180 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art180'),
  ('620007', '620', 'Perecimento, deteriorização, roubo, furto ou extravio no regime monofásico', 'Art. 47 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art47'),
  ('800001', '800', 'Fusão, cisão ou incorporação', 'Art. 55 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art55'),
  ('800002', '800', 'Transferência de crédito do associado, inclusive as cooperativas singulares', 'Art. 272 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art272'),
  ('810001', '810', 'Crédito presumido sobre o valor apurado nos fornecimentos a partir da ZFM', 'Art. 450 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art450'),
  ('811001', '811', 'Anulação de Crédito por Saídas Imunes/Isentas', 'Art. 51 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art51'),
  ('811002', '811', 'Débitos de notas fiscais não processadas na apuração', 'Art. 45 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art45'),
  ('811003', '811', 'Desenquadramento do Simples Nacional', 'Art. 41 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art41'),
  ('820001', '820', 'Documento com informações de fornecimento de serviços de planos de assistência à saúde elencados no art. 234 da Lei Complementar nº214, de 2025', 'Art. 234 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art234'),
  ('820002', '820', 'Documento com informações de fornecimento de serviços de planos de assinstência funerária', 'Art. 236 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art236'),
  ('820003', '820', 'Documento com informações de fornecimento de serviços de planos de assistência à saúde de animais domésticos', 'Art. 243 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art243'),
  ('820004', '820', 'Documento com informações de prestação de serviços de consursos de prognósticos', 'Art. 248 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art248'),
  ('820005', '820', 'Documento com informações de alienação de bens imóveis', 'Art. 254 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art254'),
  ('820006', '820', 'Documento com informações de fornecimento de serviços de exploração de via', 'Art. 11 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art11'),
  ('820007', '820', 'Documento com informações de fornecimento de serviços financeiros', 'Art. 181 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art181'),
  ('820008', '820', 'Documento com informações de fornecimento de serviço continuado, mas com tributação realizada em fatura anterior', 'Art. 10 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art10'),
  ('820009', '820', 'Cobrança relativa a fornecimentos declarados em outro documento', 'Art. 60 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art60'),
  ('830001', '830', 'Documento com exclusão da BC da CBS e do IBS de energia elétrica fornecida pela distribuidora à UC', 'Art. 28 da LC 214/2025', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm#art28')
ON CONFLICT (codigo) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. cCredPres — 13 códigos de crédito presumido.
--
-- DUAS RESSALVAS DA PESQUISA, registradas aqui para não se perderem:
--   · O portal exibe os códigos como inteiros (1-13), mas a NT SE/CGNFS-e 004
--     define `cCredPres` como campo de 2 DÍGITOS. Gravamos com zero à
--     esquerda ('01'..'13'), que é o que o XML deve levar — mas o
--     zero-padding NÃO foi confirmado literalmente na norma.
--   · A vigência é POR TRIBUTO (IBS e CBS têm início/fim independentes), não
--     um par único por código. Como a fonte entrega isso em texto livre
--     (ex.: "Não aplicável a IBS / 2027-01-01 (CBS)"), guardamos o texto
--     bruto em vez de forçar uma data que distorceria o dado.
--   · A atribuição "Anexo IV do IT 2025.002" NÃO foi confirmada: no portal
--     esta é uma tabela separada.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ccredpres_ibscbs (
  codigo            TEXT PRIMARY KEY CHECK (codigo ~ '^[0-9]{2}$'),
  descricao         TEXT NOT NULL,
  vigencia_inicio_bruto TEXT,
  vigencia_fim_bruto    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ccredpres_ibscbs IS
  'Códigos de crédito presumido IBS/CBS (13). Fonte: Portal da Conformidade '
  'Fácil (SVRS/ENCAT), Tabela de Crédito Presumido, extração de 05/08/2026. '
  'Vigência é por tributo (IBS e CBS independentes) e vem em texto livre.';

ALTER TABLE ccredpres_ibscbs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel_ccredpres_ibscbs ON ccredpres_ibscbs;
CREATE POLICY sel_ccredpres_ibscbs ON ccredpres_ibscbs FOR SELECT TO authenticated USING (true);
REVOKE ALL ON TABLE ccredpres_ibscbs FROM anon;

INSERT INTO ccredpres_ibscbs (codigo, descricao, vigencia_inicio_bruto, vigencia_fim_bruto) VALUES
  ('01', 'Crédito presumido da aquisição de bens e serviços de produtor rural e produtor rural integrado não contribuinte, observado o art. 168 da Lei Complementar nº 214, de 2025. [Aplicável a IBS e CBS; ApropriaDFE=Sim; ApropriaEvento=Sim; DeduzCréditoPresumido=Não]', '2027-01-01', 'Indeterminado'),
  ('02', 'Crédito presumido da aquisição de serviço de transportador autônomo de carga pessoa física não contribuinte, observado o art. 169 da Lei Complementar nº 214, de 2025. [Aplicável a IBS e CBS; ApropriaDFE=Não; ApropriaEvento=Sim; DeduzCréditoPresumido=Não]', '2027-01-01', 'Indeterminado'),
  ('03', 'Crédito presumido da aquisição de resíduos e demais materiais destinados à reciclagem, reutilização ou logística reversa adquiridos de pessoa física, cooperativa ou outra forma de organização popular, observado o art. 170 da Lei Complementar nº 214, de 2025. [ApropriaDFE=Sim; ApropriaEvento=Sim; DeduzCréditoPresumido=Não; CBS: início 01/01/2027]', '2029-01-01', 'Indeterminado'),
  ('04', 'Crédito presumido da aquisição de bens móveis usados de pessoa física não contribuinte para revenda, observado o art. 171 da Lei Complementar nº 214, de 2025. [Aplicável a IBS e CBS; ApropriaDFE=Sim; ApropriaEvento=Sim; DeduzCréditoPresumido=Sim]', '2027-01-01', 'Indeterminado'),
  ('05', 'Crédito presumido no regime automotivo, observado o art. 311 da Lei Complementar nº 214, de 2025. [IBS: não aplicável; CBS: aplicável, início 01/01/2027, fim Indeterminado; ApropriaDFE=Sim; ApropriaEvento=Não; DeduzCréditoPresumido=Não]', 'Não aplicável a IBS / 2027-01-01 (CBS)', 'Indeterminado (CBS)'),
  ('06', 'Crédito presumido no regime automotivo, observado o art. 312 da Lei Complementar nº 214, de 2025. [IBS: não aplicável; CBS: aplicável, início 01/01/2027, fim Indeterminado; ApropriaDFE=Sim; ApropriaEvento=Não; DeduzCréditoPresumido=Não]', 'Não aplicável a IBS / 2027-01-01 (CBS)', 'Indeterminado (CBS)'),
  ('07', 'Crédito presumido na aquisição por contribuinte na Zona Franca de Manaus, observado o art. 444 da Lei Complementar nº 214, de 2025. [IBS: aplicável, início 01/01/2027, fim Indeterminado; CBS: não aplicável; ApropriaDFE=Sim; ApropriaEvento=Não; DeduzCréditoPresumido=Sim]', '2027-01-01', 'Indeterminado'),
  ('08', 'Crédito presumido na aquisição por contribuinte na Zona Franca de Manaus, observado o art. 447 da Lei Complementar nº 214, de 2025. [IBS: aplicável, início Não informado, fim Indeterminado; CBS: não aplicável; ApropriaDFE=Não; ApropriaEvento=Sim; DeduzCréditoPresumido=Não]', 'Não localizado em documentação oficial (IBS: início não informado pela fonte)', 'Indeterminado'),
  ('09', 'Crédito presumido na aquisição por contribuinte na Zona Franca de Manaus, observado o art. 449 da Lei Complementar nº 214, de 2025. [IBS: aplicável, início 01/01/2029, fim Indeterminado; CBS: não aplicável; ApropriaDFE=Não; ApropriaEvento=Sim; DeduzCréditoPresumido=Não]', '2029-01-01', 'Indeterminado'),
  ('10', 'Crédito presumido na aquisição por contribuinte na Zona Franca de Manaus, observado o art. 450 da Lei Complementar nº 214, de 2025. [IBS: não aplicável; CBS: aplicável, início 01/01/2027, fim Indeterminado; ApropriaDFE=Sim; ApropriaEvento=Não; DeduzCréditoPresumido=Não]', 'Não aplicável a IBS / 2027-01-01 (CBS)', 'Indeterminado (CBS)'),
  ('11', 'Crédito presumido na aquisição por contribuinte na Área de Livre Comércio, observado o art. 462 da Lei Complementar nº 214, de 2025. [IBS: aplicável, início 01/01/2027, fim Indeterminado; CBS: não aplicável; ApropriaDFE=Sim; ApropriaEvento=Não; DeduzCréditoPresumido=Sim]', '2027-01-01', 'Indeterminado'),
  ('12', 'Crédito presumido na aquisição por contribuinte na Área de Livre Comércio, observado o art. 465 da Lei Complementar nº 214, de 2025. [IBS: aplicável, início 01/01/2029, fim Indeterminado; CBS: não aplicável; ApropriaDFE=Não; ApropriaEvento=Sim; DeduzCréditoPresumido=Não]', '2029-01-01', 'Indeterminado'),
  ('13', 'Crédito presumido na aquisição pela indústria na Área de Livre Comércio, observado o art. 467 da Lei Complementar nº 214, de 2025. [IBS: não aplicável; CBS: aplicável, início 01/01/2027, fim Indeterminado; ApropriaDFE=Sim; ApropriaEvento=Não; DeduzCréditoPresumido=Não]', 'Não aplicável a IBS / 2027-01-01 (CBS)', 'Indeterminado (CBS)')
ON CONFLICT (codigo) DO NOTHING;
