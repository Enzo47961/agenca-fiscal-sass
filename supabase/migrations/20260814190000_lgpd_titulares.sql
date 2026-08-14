-- ============================================================================
-- LGPD — DIREITOS DO TITULAR
--
-- Os dados pessoais aqui são de TERCEIROS: os tomadores de serviço dos clientes
-- do escritório. Nome, CPF, e-mail, telefone e endereço de pessoas que nunca
-- usaram o sistema e provavelmente nem sabem que ele existe.
--
-- ----------------------------------------------------------------------------
-- O CONFLITO QUE GOVERNA ESTE DESENHO
--
-- O titular tem direito à eliminação (LGPD art. 18, VI). E a nota fiscal tem de
-- ser guardada: o CTN (art. 195, parágrafo único) exige a conservação dos
-- documentos fiscais até a prescrição dos créditos tributários — cinco anos na
-- contagem usual.
--
-- Os dois não se contradizem, e a própria LGPD resolve: o art. 16, I autoriza
-- conservar dados pessoais para "cumprimento de obrigação legal ou regulatória
-- pelo controlador".
--
-- PORTANTO, e esta é a decisão central: `anonimizar_titular()` NÃO APAGA NOTA
-- FISCAL. Ela limpa o cadastro do cliente — o que existe por conveniência
-- nossa — e deixa intacto o documento fiscal, que existe por exigência da lei.
-- Apagar a nota para "atender a LGPD" criaria um problema fiscal maior que o
-- que se pretendia resolver, e para o CONTRIBUINTE, não para nós.
--
-- O que sai: nome, e-mail, telefone e endereço do cadastro.
-- O que fica: a nota emitida, com os dados que ela já carrega por obrigação.
--
-- NÃO É CONSELHO JURÍDICO. É a leitura de dois dispositivos citados acima,
-- implementada de forma auditável. Quem responde pelo tratamento é o
-- escritório, e a decisão de anonimizar é dele — por isso o registro guarda
-- QUEM pediu e POR QUÊ.
-- ============================================================================

CREATE TABLE anonimizacoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id    UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  -- Guardado em HASH, nunca em claro. Serve para provar "este titular foi
  -- atendido" sem manter o dado pessoal que se acabou de remover — gravá-lo
  -- aqui desfaria a própria anonimização.
  documento_hash TEXT NOT NULL CHECK (char_length(documento_hash) = 64),
  motivo        TEXT NOT NULL CHECK (char_length(motivo) BETWEEN 10 AND 500),
  solicitado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notas_preservadas INT NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE anonimizacoes IS
  'Trilha de atendimento a pedidos de eliminação (LGPD art. 18, VI). O documento '
  'do titular fica em hash: registrar em claro desfaria a anonimização.';

CREATE INDEX idx_anonimizacoes_empresa ON anonimizacoes (empresa_id, criado_em DESC);

ALTER TABLE anonimizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY sel_anonimizacoes ON anonimizacoes FOR SELECT
  USING (empresa_id IN (SELECT empresas_do_usuario_no_papel(ARRAY['owner','admin']::membro_papel[])));

GRANT SELECT ON anonimizacoes TO authenticated;

-- Marca no cadastro, para a tela não oferecer anonimizar duas vezes e para a
-- listagem mostrar o estado sem consultar outra tabela.
ALTER TABLE clientes ADD COLUMN anonimizado_em TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- Anonimizar um titular.
--
-- Papel: operador NÃO anonimiza. É ato irreversível sobre dado de terceiro, e
-- responde por ele quem responde pela empresa.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anonimizar_titular(
  p_cliente_id     UUID,
  p_motivo         TEXT,
  p_documento_hash TEXT
) RETURNS anonimizacoes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente clientes;
  v_papel   membro_papel;
  v_notas   INT;
  v_reg     anonimizacoes;
BEGIN
  SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  IF v_cliente.anonimizado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este titular já foi anonimizado em %', v_cliente.anonimizado_em;
  END IF;

  IF auth.role() <> 'service_role' THEN
    SELECT papel INTO v_papel FROM empresa_membros
    WHERE user_id = auth.uid() AND empresa_id = v_cliente.empresa_id;

    IF v_papel IS NULL THEN
      RAISE EXCEPTION 'Acesso negado a este cliente';
    END IF;
    IF v_papel = 'operador' THEN
      RAISE EXCEPTION 'Operador não anonimiza titular. Peça a um administrador da empresa';
    END IF;
  END IF;

  IF char_length(coalesce(p_motivo,'')) < 10 THEN
    RAISE EXCEPTION 'Descreva o motivo do pedido (mínimo 10 caracteres) — é o que sustenta a trilha de atendimento';
  END IF;

  SELECT count(*) INTO v_notas FROM notas_fiscais WHERE cliente_id = p_cliente_id;

  -- O cadastro é limpo; a NOTA FISCAL não é tocada (CTN art. 195 c/c LGPD
  -- art. 16, I). O CPF/CNPJ tambem fica: e ele que identifica o tomador no
  -- documento ja emitido, e apaga-lo quebraria o vinculo entre a nota e o
  -- registro que a lei manda conservar.
  -- `endereco` é NOT NULL no schema, então vira objeto VAZIO em vez de nulo. O
  -- efeito é o mesmo — nenhum dado pessoal sobra — sem afrouxar a restrição da
  -- tabela só para acomodar esta rotina.
  UPDATE clientes SET
    nome           = 'Titular anonimizado',
    email          = NULL,
    telefone       = NULL,
    endereco       = '{}'::jsonb,
    anonimizado_em = now()
  WHERE id = p_cliente_id;

  INSERT INTO anonimizacoes
    (empresa_id, cliente_id, documento_hash, motivo, solicitado_por, notas_preservadas)
  VALUES
    (v_cliente.empresa_id, p_cliente_id, p_documento_hash, p_motivo, auth.uid(), v_notas)
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$$;

-- ----------------------------------------------------------------------------
-- Exportar os dados de um titular (LGPD art. 18, II e V — acesso e portabilidade).
--
-- Devolve o cadastro e as notas em que ele aparece. É o que se entrega quando
-- o titular pergunta "o que vocês têm sobre mim".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exportar_dados_titular(p_cliente_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente clientes;
  v_papel   membro_papel;
BEGIN
  SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  IF auth.role() <> 'service_role' THEN
    SELECT papel INTO v_papel FROM empresa_membros
    WHERE user_id = auth.uid() AND empresa_id = v_cliente.empresa_id;
    IF v_papel IS NULL THEN
      RAISE EXCEPTION 'Acesso negado a este cliente';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'cadastro', jsonb_build_object(
      'nome', v_cliente.nome,
      'documento', v_cliente.cpf_cnpj,
      'email', v_cliente.email,
      'telefone', v_cliente.telefone,
      'endereco', v_cliente.endereco,
      'cadastrado_em', v_cliente.created_at,
      'anonimizado_em', v_cliente.anonimizado_em
    ),
    'notas_fiscais', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', n.numero_nfse,
        'competencia', n.competencia,
        'descricao', n.descricao_servico,
        'valor_centavos', n.valor_servico_centavos,
        'status', n.status,
        'emitida_em', n.emitida_em
      ) ORDER BY n.created_at)
      FROM notas_fiscais n WHERE n.cliente_id = p_cliente_id
    ), '[]'::jsonb),
    'base_legal_da_retencao',
      'Notas fiscais são conservadas por obrigação legal (CTN art. 195, parágrafo único), '
      'hipótese autorizada pela LGPD art. 16, I. A anonimização remove o cadastro e preserva '
      'o documento fiscal.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.anonimizar_titular, public.exportar_dados_titular FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anonimizar_titular, public.exportar_dados_titular TO authenticated;
