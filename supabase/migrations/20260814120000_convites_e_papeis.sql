-- ============================================================================
-- CONVITES E PAPÉIS COM EFEITO
--
-- DOIS PROBLEMAS QUE SÓ SE RESOLVEM JUNTOS.
--
-- 1. Não havia como um segundo usuário entrar numa empresa. `empresa_membros`
--    só tem policy de SELECT, e o único INSERT vive dentro de
--    `criar_minha_empresa()`, sempre em nome de quem chama. Quem criou a
--    empresa era o único a enxergá-la, para sempre.
--
-- 2. O papel (owner/admin/operador) existia no enum e não restringia NADA:
--    `empresas_do_usuario()` devolve os vínculos sem olhar o papel, e todas as
--    policies de escrita usavam só isso.
--
-- Entregar (1) sem (2) seria abrir um buraco: convidar o cliente final daria a
-- ele poder de mexer na configuração fiscal da empresa. Por isso vão na mesma
-- migration.
--
-- ONDE ISTO DIVERGE DO PADRÃO DE MERCADO, e a favor. A prática comum em SaaS
-- B2B é checar papel no código da aplicação. Aqui a checagem desce para o
-- BANCO: quem decide o que um `operador` pode escrever é a policy, não a tela.
-- Uma requisição forjada — Server Action chamada direto, cliente HTTP próprio —
-- esbarra na mesma regra. Tela que esconde botão é conveniência; policy é
-- controle.
--
-- O QUE CADA PAPEL PODE
--
--   operador  emite nota, cadastra cliente, lê tudo da empresa.
--             NÃO mexe em configuração fiscal. NÃO convida ninguém.
--   admin     tudo do operador + configuração fiscal + convidar operador.
--   owner     tudo + convidar admin + revogar convite de qualquer papel.
--
-- O recorte do operador é o que torna o convite ao cliente final seguro: ele
-- emite em nome da empresa sem poder trocar regime tributário, emissor ou
-- certificado — que é exatamente a promessa que o playbook comercial fazia e o
-- sistema ainda não cumpria.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper de papel. É a peça que faltava para a policy saber quem é quem.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.empresas_do_usuario_no_papel(p_papeis membro_papel[])
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT empresa_id FROM empresa_membros
  WHERE user_id = auth.uid() AND papel = ANY(p_papeis);
$$;

COMMENT ON FUNCTION public.empresas_do_usuario_no_papel IS
  'Empresas em que o usuário logado tem um dos papéis informados. Use nas '
  'policies de ESCRITA; `empresas_do_usuario()` (sem papel) serve para leitura.';

/** Papel do usuário logado numa empresa, ou NULL se não for membro. */
CREATE OR REPLACE FUNCTION public.meu_papel(p_empresa_id UUID)
RETURNS membro_papel
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT papel FROM empresa_membros
  WHERE user_id = auth.uid() AND empresa_id = p_empresa_id;
$$;

GRANT EXECUTE ON FUNCTION public.empresas_do_usuario_no_papel TO authenticated;
GRANT EXECUTE ON FUNCTION public.meu_papel TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. As policies de ESCRITA passam a olhar o papel.
--
-- As de LEITURA continuam abertas a qualquer membro: quem entra na empresa
-- precisa enxergar a operação, e esconder dado de quem foi convidado a operá-lo
-- não protege ninguém.
-- ----------------------------------------------------------------------------

-- Configuração fiscal da empresa: operador fica de fora. É aqui que se troca
-- regime tributário, emissor e certificado — decisões que respondem pelo CNPJ.
DROP POLICY IF EXISTS upd_empresas ON empresas;
CREATE POLICY upd_empresas ON empresas FOR UPDATE
  USING (id IN (SELECT empresas_do_usuario_no_papel(ARRAY['owner','admin']::membro_papel[])))
  WITH CHECK (id IN (SELECT empresas_do_usuario_no_papel(ARRAY['owner','admin']::membro_papel[])));

-- Clientes (tomadores): trabalho de operação, os três papéis fazem. Trocada
-- mesmo assim para deixar de ser `FOR ALL` implícito e passar a ser explícita —
-- policy que não diz quem pode é policy que ninguém revisa.
DROP POLICY IF EXISTS all_clientes ON clientes;
CREATE POLICY sel_clientes ON clientes FOR SELECT
  USING (empresa_id IN (SELECT empresas_do_usuario()));
CREATE POLICY ins_clientes ON clientes FOR INSERT
  WITH CHECK (empresa_id IN (SELECT empresas_do_usuario_no_papel(ARRAY['owner','admin','operador']::membro_papel[])));
CREATE POLICY upd_clientes ON clientes FOR UPDATE
  USING (empresa_id IN (SELECT empresas_do_usuario_no_papel(ARRAY['owner','admin','operador']::membro_papel[])))
  WITH CHECK (empresa_id IN (SELECT empresas_do_usuario_no_papel(ARRAY['owner','admin','operador']::membro_papel[])));
-- Apagar cliente é destrutivo e não é rotina de quem só emite.
CREATE POLICY del_clientes ON clientes FOR DELETE
  USING (empresa_id IN (SELECT empresas_do_usuario_no_papel(ARRAY['owner','admin']::membro_papel[])));

-- Emitir nota é o trabalho do operador — o motivo de ele existir.
DROP POLICY IF EXISTS ins_notas ON notas_fiscais;
CREATE POLICY ins_notas ON notas_fiscais FOR INSERT
  WITH CHECK (empresa_id IN (SELECT empresas_do_usuario_no_papel(ARRAY['owner','admin','operador']::membro_papel[])));

-- ----------------------------------------------------------------------------
-- 3. Convites.
--
-- TOKEN GUARDADO COM HASH, nunca em claro. É prática consolidada em SaaS B2B e
-- a razão é direta: um convite pendente é uma credencial de acesso à empresa.
-- Vazamento de banco com token em claro entregaria acesso a todas as empresas
-- com convite aberto. O hash é calculado na aplicação (SHA-256); o valor bruto
-- só existe no e-mail e na URL.
--
-- O CONVITE É PRESO AO E-MAIL. Sem isso, encaminhar a mensagem entregaria a
-- empresa a quem recebesse o link.
-- ----------------------------------------------------------------------------
CREATE TABLE convites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email       TEXT NOT NULL CHECK (position('@' IN email) > 1),
  papel       membro_papel NOT NULL,
  -- SHA-256 em hex: 64 caracteres.
  token_hash  TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  expira_em   TIMESTAMPTZ NOT NULL,
  criado_por  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  aceito_em   TIMESTAMPTZ,
  aceito_por  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revogado_em TIMESTAMPTZ,
  CHECK (aceito_em IS NULL OR revogado_em IS NULL)
);

COMMENT ON TABLE convites IS
  'Convites para entrar numa empresa. `token_hash` é SHA-256 do token que vai '
  'no e-mail — o valor bruto nunca é gravado.';

-- Um convite PENDENTE por (empresa, e-mail). Reconvidar antes de expirar deve
-- reaproveitar ou substituir, não acumular convites válidos para o mesmo
-- destinatário — cada um seria uma credencial extra em circulação.
CREATE UNIQUE INDEX uq_convite_pendente ON convites (empresa_id, lower(email))
  WHERE aceito_em IS NULL AND revogado_em IS NULL;

CREATE INDEX idx_convites_empresa ON convites (empresa_id, criado_em DESC);

ALTER TABLE convites ENABLE ROW LEVEL SECURITY;

-- Quem administra a empresa vê os convites dela. Note que a policy NÃO expõe
-- nada útil para forjar acesso: `token_hash` é hash, e o convidado não precisa
-- ler a tabela para aceitar (a função abaixo é SECURITY DEFINER).
CREATE POLICY sel_convites ON convites FOR SELECT
  USING (empresa_id IN (SELECT empresas_do_usuario_no_papel(ARRAY['owner','admin']::membro_papel[])));

GRANT SELECT ON convites TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Criar convite.
--
-- SECURITY DEFINER porque `convites` não tem policy de INSERT e `empresa_membros`
-- não deve ganhar uma: manter a escrita concentrada em funções auditáveis é o
-- que impede alguém se auto-adicionar a uma empresa qualquer.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_convite(
  p_empresa_id UUID,
  p_email      TEXT,
  p_papel      membro_papel,
  p_token_hash TEXT,
  p_dias       INT DEFAULT 7
) RETURNS convites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_papel_quem membro_papel;
  v_email      TEXT := lower(trim(p_email));
  v_convite    convites;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT papel INTO v_papel_quem FROM empresa_membros
  WHERE user_id = auth.uid() AND empresa_id = p_empresa_id;

  IF v_papel_quem IS NULL OR v_papel_quem = 'operador' THEN
    RAISE EXCEPTION 'Só owner ou admin podem convidar para esta empresa';
  END IF;

  -- Ninguém concede poder acima do próprio: admin convida operador; só owner
  -- cria outro admin ou owner. Sem esta regra, um admin faria a si mesmo owner
  -- por caminho indireto — convidando um segundo e-mail seu como owner.
  IF v_papel_quem = 'admin' AND p_papel <> 'operador' THEN
    RAISE EXCEPTION 'Admin só pode convidar operador; papel % exige owner', p_papel;
  END IF;

  IF EXISTS (
    SELECT 1 FROM empresa_membros m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.empresa_id = p_empresa_id AND lower(u.email) = v_email
  ) THEN
    RAISE EXCEPTION 'Este e-mail já é membro da empresa';
  END IF;

  -- Reconvite substitui o pendente: o token antigo deixa de valer no mesmo
  -- instante em que o novo nasce, então nunca há dois válidos em circulação.
  UPDATE convites SET revogado_em = now()
  WHERE empresa_id = p_empresa_id AND lower(email) = v_email
    AND aceito_em IS NULL AND revogado_em IS NULL;

  INSERT INTO convites (empresa_id, email, papel, token_hash, expira_em, criado_por)
  VALUES (p_empresa_id, v_email, p_papel, p_token_hash,
          now() + make_interval(days => GREATEST(p_dias, 1)), auth.uid())
  RETURNING * INTO v_convite;

  RETURN v_convite;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Aceitar convite.
--
-- Recebe o HASH, não o token: quem chama já calculou. Assim o valor bruto não
-- aparece em log de banco nem em plano de consulta.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aceitar_convite(p_token_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_convite convites;
  v_email   TEXT := lower(auth.jwt() ->> 'email');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Faça login para aceitar o convite';
  END IF;

  SELECT * INTO v_convite FROM convites WHERE token_hash = p_token_hash FOR UPDATE;

  -- Mensagem única para "não existe" e "já usado": distinguir as duas
  -- confirmaria a existência de um token a quem está tentando adivinhar.
  IF NOT FOUND OR v_convite.aceito_em IS NOT NULL OR v_convite.revogado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Convite inválido ou já utilizado';
  END IF;

  IF v_convite.expira_em < now() THEN
    RAISE EXCEPTION 'Convite expirado. Peça um novo ao administrador da empresa';
  END IF;

  -- O convite é do e-mail convidado, não de quem tem o link.
  IF v_email IS NULL OR v_email <> lower(v_convite.email) THEN
    RAISE EXCEPTION 'Este convite foi enviado para outro e-mail (%). Entre com essa conta',
      v_convite.email;
  END IF;

  -- Já ser membro não é erro: é o usuário clicando duas vezes no link. Marca
  -- como aceito e devolve a empresa, em vez de assustar com exceção.
  IF NOT EXISTS (
    SELECT 1 FROM empresa_membros
    WHERE empresa_id = v_convite.empresa_id AND user_id = auth.uid()
  ) THEN
    INSERT INTO empresa_membros (empresa_id, user_id, papel)
    VALUES (v_convite.empresa_id, auth.uid(), v_convite.papel);
  END IF;

  UPDATE convites SET aceito_em = now(), aceito_por = auth.uid()
  WHERE id = v_convite.id;

  RETURN v_convite.empresa_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Revogar convite pendente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revogar_convite(p_convite_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa UUID;
  v_papel   membro_papel;
BEGIN
  SELECT empresa_id INTO v_empresa FROM convites
  WHERE id = p_convite_id AND aceito_em IS NULL AND revogado_em IS NULL;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Convite não encontrado ou já encerrado';
  END IF;

  SELECT papel INTO v_papel FROM empresa_membros
  WHERE user_id = auth.uid() AND empresa_id = v_empresa;

  IF v_papel IS NULL OR v_papel = 'operador' THEN
    RAISE EXCEPTION 'Sem permissão para revogar convites desta empresa';
  END IF;

  UPDATE convites SET revogado_em = now() WHERE id = p_convite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_convite, public.aceitar_convite, public.revogar_convite
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_convite, public.aceitar_convite, public.revogar_convite
  TO authenticated;
