-- ============================================================================
-- COMPLEMENTO do seed IBSCBS: as colunas que faltavam.
--
-- A migration anterior (20260805200000) deixou NULL as colunas de redução, os
-- indicadores e o tipo de alíquota, porque o CSV exportado não os trazia. Esta
-- migration preenche esses campos e adiciona três colunas novas. A anterior
-- fica INTACTA (regra 14: migration é imutável).
--
-- POR QUE FALTAVAM: os quatro indicadores (Tributação Regular, Crédito
-- Presumido, Estorno de Crédito, % Biocombustível) NÃO são texto na página do
-- Portal da Conformidade Fácil — são ÍCONES (`fa-check-circle` = Sim,
-- `fa-minus-circle` = Não). Qualquer extração baseada em texto os perde em
-- silêncio, devolvendo célula vazia. Esta extração leu a classe CSS do ícone.
--
-- Fonte: https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria
-- Extração ao vivo do DOM em 05/08/2026 (mesma fonte primária do seed).
--
-- CONFERÊNCIA DA TRANSCRIÇÃO (seis contagens independentes, todas batendo):
--   164 códigos distintos · distribuição por CST idêntica à oficial
--   71 aplicáveis a NFS-e · 59 com redução > 0
--   27 com tributação regular · 4 com crédito presumido
--   3 com estorno de crédito · 2 com % biocombustível
--
-- ACHADO QUE JUSTIFICA GUARDAR IBS E CBS SEPARADOS: o código 200025 é o
-- ÚNICO dos 164 em que as reduções divergem — 60% de IBS contra 100% de CBS.
-- Uma coluna única de "redução" teria corrompido exatamente esse caso.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Colunas novas
-- ----------------------------------------------------------------------------

-- Indicador de % de biocombustível (relevante só para monofasia — CST 620).
ALTER TABLE cclasstrib_ibscbs
  ADD COLUMN IF NOT EXISTS ind_perc_biocombustivel BOOLEAN NOT NULL DEFAULT false;

-- Receita Bruta do Simples Nacional: como a operação entra na receita bruta do
-- optante. Coluna "RB SN" do portal, que não estava mapeada em lugar nenhum.
--   0-Não Receita Bruta · 1-RB Interna · 2-RB Interna sem Cálculo IBS/CBS
--   3-RB Exportação Direta · 4-RB Exportação Indireta
--   5-RB Mercado Interno/Exportação · 9-Fornecimento Incompatível com SN
ALTER TABLE cclasstrib_ibscbs
  ADD COLUMN IF NOT EXISTS rb_sn SMALLINT
  CHECK (rb_sn IS NULL OR rb_sn IN (0, 1, 2, 3, 4, 5, 9));

-- O portal informa, por código, quais documentos fiscais o aceitam. Só 71 dos
-- 164 valem para NFS-e — declarar um código de NF-e numa NFS-e é rejeição
-- certa, e sem esta coluna não havia como saber.
ALTER TABLE cclasstrib_ibscbs
  ADD COLUMN IF NOT EXISTS aplica_nfse BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN cclasstrib_ibscbs.rb_sn IS
  'Tratamento na Receita Bruta do Simples Nacional (coluna RB SN do portal).';
COMMENT ON COLUMN cclasstrib_ibscbs.aplica_nfse IS
  'true quando o portal lista NFSE entre os DFes que aceitam este código.';


-- ----------------------------------------------------------------------------
-- 2. Preenchimento dos 164 códigos.
-- Percentuais em FRAÇÃO (0.6000 = 60%), coerente com o resto do domínio.
-- ----------------------------------------------------------------------------
UPDATE cclasstrib_ibscbs AS c SET
  perc_reducao_ibs        = v.red_ibs,
  perc_reducao_cbs        = v.red_cbs,
  ind_trib_regular        = v.trib_regular,
  ind_cred_pres           = v.cred_pres,
  ind_estorno_cred        = v.estorno_cred,
  ind_perc_biocombustivel = v.perc_bio,
  tipo_aliquota           = v.tipo_aliq,
  rb_sn                   = v.rb_sn,
  aplica_nfse             = v.aplica_nfse
FROM (VALUES
  ('000001', 0.0000, 0.0000, false, false, false, false, 2, 1, true),
  ('000002', 0.0000, 0.0000, false, false, false, false, 2, 1, false),
  ('000003', 0.0000, 0.0000, false, true, false, false, 2, 1, false),
  ('000004', 0.0000, 0.0000, false, true, false, false, 2, 1, false),
  ('000005', 0.0000, 0.0000, false, false, false, false, 2, 1, false),
  ('010001', 0.0000, 0.0000, false, false, false, false, 5, 9, true),
  ('010002', 0.0000, 0.0000, false, false, false, false, 5, 1, true),
  ('011001', 0.6000, 0.6000, false, false, false, false, 4, 1, false),
  ('011002', 0.6000, 0.6000, false, false, false, false, 4, 1, false),
  ('011003', 0.6000, 0.6000, false, false, false, false, 4, 1, true),
  ('011004', 0.0000, 0.0000, false, false, false, false, 4, 1, false),
  ('011005', 0.3000, 0.3000, false, false, false, false, 4, 1, false),
  ('200001', 1.0000, 1.0000, false, false, false, false, 2, 3, true),
  ('200002', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200003', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200004', 1.0000, 1.0000, false, false, false, false, 2, 1, true),
  ('200005', 1.0000, 1.0000, false, false, false, false, 2, 1, true),
  ('200006', 1.0000, 1.0000, false, false, false, false, 2, 1, true),
  ('200007', 1.0000, 1.0000, false, false, false, false, 2, 1, true),
  ('200008', 1.0000, 1.0000, false, false, false, false, 2, 1, true),
  ('200009', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200010', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200011', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200012', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200013', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200014', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200015', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200016', 1.0000, 1.0000, false, false, false, false, 2, 9, true),
  ('200017', 1.0000, 1.0000, false, false, false, false, 2, 9, true),
  ('200018', 1.0000, 1.0000, false, false, false, false, 2, 9, false),
  ('200019', 1.0000, 1.0000, false, false, false, false, 2, 0, true),
  ('200020', 1.0000, 1.0000, false, false, false, false, 2, 1, true),
  ('200021', 1.0000, 1.0000, false, false, false, false, 2, 1, true),
  ('200022', 1.0000, 1.0000, true, false, false, false, 2, 1, false),
  ('200023', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200024', 1.0000, 1.0000, true, false, false, false, 2, 1, false),
  ('200025', 0.6000, 1.0000, false, false, false, false, 2, 1, true),
  ('200026', 0.8000, 0.8000, false, false, false, false, 2, 9, true),
  ('200027', 0.7000, 0.7000, false, false, false, false, 2, 1, true),
  ('200028', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200029', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200030', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200031', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200032', 0.6000, 0.6000, false, false, false, false, 2, 1, false),
  ('200033', 0.6000, 0.6000, false, false, false, false, 2, 1, false),
  ('200034', 0.6000, 0.6000, false, false, false, false, 2, 1, false),
  ('200035', 0.6000, 0.6000, false, false, false, false, 2, 1, false),
  ('200036', 0.6000, 0.6000, false, false, false, false, 2, 1, false),
  ('200037', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200038', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200039', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200040', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200041', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200042', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200043', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200044', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200045', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('200046', 0.5000, 0.5000, false, false, false, false, 2, 1, true),
  ('200047', 0.4000, 0.4000, false, false, false, false, 2, 1, false),
  ('200048', 0.4000, 0.4000, false, false, false, false, 2, 1, true),
  ('200049', 0.4000, 0.4000, false, false, false, false, 2, 1, false),
  ('200050', 0.4000, 0.4000, false, false, false, false, 2, 1, false),
  ('200051', 0.4000, 0.4000, false, false, false, false, 2, 1, true),
  ('200052', 0.3000, 0.3000, false, false, false, false, 2, 1, true),
  ('200053', 1.0000, 1.0000, false, false, false, false, 2, 1, false),
  ('200054', 1.0000, 1.0000, false, false, true, false, 2, 9, true),
  ('220001', 0.0000, 0.0000, false, false, false, false, 1, 0, false),
  ('220002', 0.0000, 0.0000, false, false, false, false, 1, 0, false),
  ('220003', 0.0000, 0.0000, false, false, false, false, 1, 0, false),
  ('221001', 0.0000, 0.0000, false, false, false, false, 1, 1, true),
  ('221002', 0.0000, 0.0000, false, false, false, false, 1, 9, false),
  ('221003', 0.0000, 0.0000, false, false, false, false, 1, 9, false),
  ('221004', 0.0000, 0.0000, false, false, false, false, 1, 1, false),
  ('222001', 0.0000, 0.0000, false, false, false, false, 2, 5, false),
  ('400001', 0.0000, 0.0000, false, false, false, false, 2, 1, true),
  ('400002', 0.0000, 0.0000, false, false, false, false, 3, 1, false),
  ('410001', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('410002', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('410003', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('410004', 0.0000, 0.0000, false, false, false, false, 3, 3, true),
  ('410005', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('410006', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('410007', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('410008', 0.0000, 0.0000, false, false, false, false, 3, 2, true),
  ('410009', 0.0000, 0.0000, false, false, false, false, 3, 2, true),
  ('410010', 0.0000, 0.0000, false, false, false, false, 3, 2, true),
  ('410011', 0.0000, 0.0000, false, false, false, false, 3, 2, false),
  ('410012', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('410013', 0.0000, 0.0000, false, false, false, false, 3, 3, false),
  ('410014', 0.0000, 0.0000, false, true, false, false, 3, 1, true),
  ('410015', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('410016', 0.0000, 0.0000, false, true, false, false, 3, 1, false),
  ('410017', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('410018', 0.0000, 0.0000, false, false, false, false, 3, 9, false),
  ('410019', 0.0000, 0.0000, false, false, false, false, 3, 1, false),
  ('410020', 0.0000, 0.0000, false, false, false, false, 3, 1, false),
  ('410021', 0.0000, 0.0000, false, false, false, false, 3, 9, false),
  ('410022', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('410023', 0.0000, 0.0000, false, false, false, false, 3, 9, false),
  ('410024', 0.0000, 0.0000, false, false, false, false, 3, 1, false),
  ('410025', 0.0000, 0.0000, false, false, false, false, 3, 9, false),
  ('410026', 0.0000, 0.0000, false, false, true, false, 3, 0, true),
  ('410027', 0.0000, 0.0000, false, false, false, false, 3, 3, true),
  ('410028', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('410029', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('410030', 0.0000, 0.0000, false, false, true, false, 3, 0, false),
  ('410031', 0.0000, 0.0000, false, false, false, false, 3, 1, false),
  ('410032', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('410033', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('410034', 0.0000, 0.0000, false, false, false, false, 3, 9, false),
  ('410035', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('410036', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('410037', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('410999', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('510001', 0.0000, 0.0000, false, false, false, false, 3, 2, false),
  ('515001', 0.6000, 0.6000, false, false, false, false, 2, 1, true),
  ('550001', 0.0000, 0.0000, true, false, false, false, 3, 4, false),
  ('550002', 0.0000, 0.0000, true, false, false, false, 3, 0, false),
  ('550003', 0.0000, 0.0000, true, false, false, false, 3, 0, false),
  ('550004', 0.0000, 0.0000, true, false, false, false, 3, 4, false),
  ('550005', 0.0000, 0.0000, true, false, false, false, 3, 4, false),
  ('550006', 0.0000, 0.0000, true, false, false, false, 3, 0, false),
  ('550007', 0.0000, 0.0000, true, false, false, false, 3, 0, false),
  ('550008', 0.0000, 0.0000, true, false, false, false, 3, 0, false),
  ('550009', 0.0000, 0.0000, true, false, false, false, 3, 0, false),
  ('550010', 0.0000, 0.0000, true, false, false, false, 3, 0, false),
  ('550011', 0.0000, 0.0000, true, false, false, false, 3, 1, false),
  ('550012', 0.0000, 0.0000, true, false, false, false, 3, 1, false),
  ('550013', 0.0000, 0.0000, true, false, false, false, 3, 1, false),
  ('550014', 0.0000, 0.0000, true, false, false, false, 3, 4, false),
  ('550015', 0.0000, 0.0000, true, false, false, false, 3, 1, false),
  ('550016', 0.0000, 0.0000, true, false, false, false, 3, 1, true),
  ('550017', 0.0000, 0.0000, true, false, false, false, 3, 1, false),
  ('550018', 0.0000, 0.0000, true, false, false, false, 3, 1, false),
  ('550019', 0.0000, 0.0000, true, false, false, false, 3, 0, false),
  ('550020', 0.0000, 0.0000, true, false, false, false, 3, 0, false),
  ('550021', 0.0000, 0.0000, true, false, false, false, 3, 4, false),
  ('550022', 0.0000, 0.0000, true, false, false, false, 3, 1, true),
  ('550023', 0.0000, 0.0000, true, false, false, false, 3, 1, false),
  ('550024', 0.0000, 0.0000, true, false, false, false, 3, 1, false),
  ('550025', 0.0000, 0.0000, true, false, false, false, 3, 1, false),
  ('620001', 0.0000, 0.0000, false, false, false, false, 2, 9, false),
  ('620002', 0.0000, 0.0000, false, false, false, false, 2, 9, false),
  ('620003', 0.0000, 0.0000, false, false, false, false, 2, 9, false),
  ('620004', 0.0000, 0.0000, false, false, false, true, 2, 9, false),
  ('620005', 0.0000, 0.0000, false, false, false, true, 2, 9, false),
  ('620006', 0.0000, 0.0000, false, false, false, false, 2, 2, false),
  ('620007', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('800001', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('800002', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('810001', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('811001', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('811002', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('811003', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('820001', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('820002', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('820003', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('820004', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('820005', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('820006', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('820007', 0.0000, 0.0000, false, false, false, false, 3, 9, true),
  ('820008', 0.0000, 0.0000, false, false, false, false, 3, 0, false),
  ('820009', 0.0000, 0.0000, false, false, false, false, 3, 0, true),
  ('830001', 0.0000, 0.0000, false, false, false, false, 2, 0, false)
) AS v(codigo, red_ibs, red_cbs, trib_regular, cred_pres, estorno_cred, perc_bio, tipo_aliq, rb_sn, aplica_nfse)
WHERE c.codigo = v.codigo;


-- ----------------------------------------------------------------------------
-- 3. Trava de integridade: se qualquer código ficou sem preencher, a migration
--    falha aqui em vez de deixar o banco meio populado em silêncio.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_faltando INT;
  v_nfse     INT;
BEGIN
  SELECT count(*) INTO v_faltando FROM cclasstrib_ibscbs WHERE tipo_aliquota IS NULL;
  IF v_faltando > 0 THEN
    RAISE EXCEPTION 'Seed complementar incompleto: % codigos sem tipo_aliquota', v_faltando;
  END IF;

  SELECT count(*) INTO v_nfse FROM cclasstrib_ibscbs WHERE aplica_nfse;
  IF v_nfse <> 71 THEN
    RAISE EXCEPTION 'Esperados 71 codigos aplicaveis a NFS-e, encontrados %', v_nfse;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 4. View de conveniência: só o que vale para NFS-e, que é o nosso caso de uso.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW cclasstrib_nfse AS
SELECT codigo, cst, descricao, perc_reducao_ibs, perc_reducao_cbs,
       ind_trib_regular, ind_cred_pres, ind_estorno_cred, tipo_aliquota, rb_sn,
       artigo_lc214, url_dispositivo
FROM cclasstrib_ibscbs
WHERE aplica_nfse
ORDER BY codigo;

COMMENT ON VIEW cclasstrib_nfse IS
  'Os 71 cClassTrib (de 164) que o portal lista como aceitos em NFS-e.';
