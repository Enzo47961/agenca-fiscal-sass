-- ============================================================================
-- CANCELAMENTO DE NFS-e
--
-- O sistema emitia e não sabia cancelar — corrigir uma nota errada era trabalho
-- fora dele, no portal da prefeitura, o que quebra a promessa de o escritório
-- operar a carteira num lugar só.
--
-- ----------------------------------------------------------------------------
-- O QUE A PESQUISA ESTABELECEU, E O QUE ELA NÃO ESTABELECEU
--
-- O achado que governa o desenho: **o prazo de cancelamento é MUNICIPAL, não
-- nacional**. Levantado em fontes oficiais de municípios diferentes:
--
--   Distrito Federal   até o dia 15 do mês seguinte ao da emissão
--   Recife             60 dias
--   Jundiaí            até o dia 15 do mês seguinte; vedado após 180 dias
--   Anápolis           Portaria 461/2025, regras próprias
--
-- Tentei ler a Resolução CGNFS-e nº 9, de 30/12/2025, que é a norma nacional
-- sobre o tema. NÃO CONSEGUI extrair o texto (PDF com fonte de codificação
-- própria). Portanto não sei se existe um prazo nacional supletivo, e **não
-- inventei um**.
--
-- CONSEQUÊNCIA DE PROJETO, e é a decisão central desta migration: o sistema
-- NÃO guarda nem valida prazo de cancelamento. Quem conhece a regra do
-- município é a prefeitura; nós tentamos e reportamos a resposta dela, com a
-- mensagem original. Um prazo chutado aqui bloquearia cancelamento legítimo em
-- município mais permissivo e daria falsa esperança em município mais restrito
-- — os dois erros piores que perguntar.
--
-- ----------------------------------------------------------------------------
-- POR QUE ASSÍNCRONO, se a API do provider é síncrona
--
-- A Focus cancela em DELETE síncrono. Ainda assim o cancelamento entra pelo
-- motor Inngest, como a emissão, por dois motivos:
--
--   1. A prefeitura cai. Cancelamento é operação com PRAZO — falhar por
--      indisponibilidade no último dia do prazo é o pior momento possível para
--      não haver retry.
--   2. Reaproveita a classificação de erro que já existe: "prefeitura fora do
--      ar" é transiente e merece insistência; "fora do prazo" é permanente e
--      não deve queimar tentativa.
--
-- ----------------------------------------------------------------------------
-- ESTADOS NOVOS
--
--   cancelando  pedido aceito, motor trabalhando
--   cancelada   prefeitura confirmou
--
-- E a transição que mais importa: `cancelando -> emitida`. Cancelamento
-- RECUSADO devolve a nota ao estado anterior — ela continua válida, porque de
-- fato continua. Deixá-la num estado de erro faria o usuário crer que a nota
-- não vale mais, quando vale.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ATENÇÃO AO PORQUÊ DE ESTA MIGRATION SER SÓ ISTO.
--
-- O Postgres não deixa USAR um valor de enum na mesma transação em que ele foi
-- criado. Como cada migration roda em uma transação, a função de transição e
-- tudo que menciona 'cancelando'/'cancelada' como literal ficam na migration
-- seguinte (20260814150000). Juntar as duas dá:
--   ERROR: unsafe use of new value "cancelando" of enum type nota_status
-- ----------------------------------------------------------------------------
ALTER TYPE nota_status ADD VALUE IF NOT EXISTS 'cancelando';
ALTER TYPE nota_status ADD VALUE IF NOT EXISTS 'cancelada';

-- Colunas do cancelamento. Não usam os valores novos como literal, então podem
-- vir aqui.
ALTER TABLE notas_fiscais
  ADD COLUMN cancelamento_solicitado_em TIMESTAMPTZ,
  ADD COLUMN cancelamento_solicitado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 15 a 255 caracteres: exigência da API do provider, verificada na
  -- documentação da Focus NFe. Validar aqui evita descobrir no meio do motor,
  -- com a nota já em `cancelando`.
  ADD COLUMN cancelamento_justificativa TEXT
    CHECK (cancelamento_justificativa IS NULL
           OR char_length(cancelamento_justificativa) BETWEEN 15 AND 255),
  ADD COLUMN cancelada_em TIMESTAMPTZ,
  ADD COLUMN url_xml_cancelamento TEXT,
  -- Recusa da prefeitura, guardada COMO VEIO. É o texto que explica ao usuário
  -- por que não deu — e, quando o motivo é prazo, é a prova de que tentamos.
  ADD COLUMN cancelamento_recusa TEXT;

COMMENT ON COLUMN notas_fiscais.cancelamento_justificativa IS
  'Motivo informado por quem pediu o cancelamento. 15-255 caracteres, exigência '
  'da API do provider fiscal.';
COMMENT ON COLUMN notas_fiscais.cancelamento_recusa IS
  'Resposta da prefeitura quando o cancelamento é recusado. Guardada literal: o '
  'prazo é municipal e a mensagem dela é a única fonte confiável do motivo.';
