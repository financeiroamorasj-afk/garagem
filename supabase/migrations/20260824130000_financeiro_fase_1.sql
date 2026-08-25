-- Fundação financeira Fase 1. É aditiva: não toca nas tabelas legadas com tenant_id.
-- As RPCs abaixo usam SECURITY DEFINER de forma deliberada: com SECURITY INVOKER,
-- a mesma role authenticated precisaria de policies de escrita direta no ledger.
-- Cada função valida auth.uid(), papel e barbearia antes de qualquer alteração.

CREATE TABLE public.financeiro_categorias (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ambos')),
  grupo_dre text NOT NULL CHECK (grupo_dre IN ('receita_servicos', 'receita_produtos', 'cmv', 'despesa_fixa', 'despesa_variavel', 'despesa_financeira', 'pro_labore', 'impostos', 'outros')),
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id, nome)
);

CREATE TABLE public.financeiro_contas_bancarias (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  instituicao text,
  tipo text NOT NULL CHECK (tipo IN ('corrente', 'poupanca', 'caixa', 'carteira_digital', 'cartao')),
  saldo_inicial numeric(15,2) NOT NULL DEFAULT 0,
  conta_principal boolean NOT NULL DEFAULT false,
  ativa boolean NOT NULL DEFAULT true,
  configuracao_repasse jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX financeiro_uma_conta_principal_ativa
  ON public.financeiro_contas_bancarias (barbearia_id) WHERE conta_principal AND ativa;

CREATE TABLE public.financeiro_contas_pagar (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  descricao text NOT NULL CHECK (length(btrim(descricao)) > 0),
  valor numeric(15,2) NOT NULL CHECK (valor >= 0),
  data_vencimento date NOT NULL,
  data_competencia date NOT NULL,
  data_liquidacao date,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'estornado', 'cancelado')),
  categoria_id uuid REFERENCES public.financeiro_categorias(id),
  conta_bancaria_id uuid REFERENCES public.financeiro_contas_bancarias(id),
  origem text NOT NULL DEFAULT 'manual',
  referencia_externa text,
  fitid text,
  agendamento_id uuid REFERENCES public.agendamentos(id),
  venda_produto_id uuid REFERENCES public.vendas_produtos(id),
  profissional_id uuid REFERENCES public.profissionais(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status <> 'pago') OR data_liquidacao IS NOT NULL)
);

CREATE TABLE public.financeiro_contas_receber (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  descricao text NOT NULL CHECK (length(btrim(descricao)) > 0),
  valor_bruto numeric(15,2) NOT NULL CHECK (valor_bruto >= 0),
  taxa numeric(15,2) NOT NULL DEFAULT 0 CHECK (taxa >= 0),
  valor_liquido numeric(15,2) GENERATED ALWAYS AS (valor_bruto - taxa) STORED,
  data_previsao date NOT NULL,
  data_liquidacao date,
  metodo_pagamento text NOT NULL,
  status text NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto', 'liquidado', 'estornado', 'cancelado')),
  conta_destino_id uuid REFERENCES public.financeiro_contas_bancarias(id),
  cliente_id uuid REFERENCES public.clientes(id),
  categoria_id uuid REFERENCES public.financeiro_categorias(id),
  origem text NOT NULL CHECK (origem IN ('servico', 'produto', 'credito', 'cupom', 'pacote', 'manual')),
  referencia_externa text,
  fitid text,
  agendamento_id uuid REFERENCES public.agendamentos(id),
  venda_produto_id uuid REFERENCES public.vendas_produtos(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (taxa <= valor_bruto),
  CHECK ((status <> 'liquidado') OR data_liquidacao IS NOT NULL)
);

CREATE TABLE public.financeiro_movimentacoes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  conta_bancaria_id uuid NOT NULL REFERENCES public.financeiro_contas_bancarias(id),
  direcao text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  valor numeric(15,2) NOT NULL CHECK (valor >= 0),
  data_competencia date NOT NULL,
  data_liquidacao date NOT NULL,
  status text NOT NULL DEFAULT 'efetivado' CHECK (status IN ('efetivado', 'estornado')),
  categoria_id uuid REFERENCES public.financeiro_categorias(id),
  origem text NOT NULL,
  transferencia_id uuid,
  idempotency_key text,
  fitid text,
  conta_pagar_id uuid REFERENCES public.financeiro_contas_pagar(id),
  conta_receber_id uuid REFERENCES public.financeiro_contas_receber(id),
  agendamento_id uuid REFERENCES public.agendamentos(id),
  venda_produto_id uuid REFERENCES public.vendas_produtos(id),
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((transferencia_id IS NULL) OR origem = 'transferencia')
);

CREATE TABLE public.financeiro_creditos_clientes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  saldo numeric(15,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id, cliente_id)
);

CREATE TABLE public.financeiro_creditos_movimentacoes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  credito_cliente_id uuid NOT NULL REFERENCES public.financeiro_creditos_clientes(id),
  motivo text NOT NULL CHECK (motivo IN ('emissao', 'uso', 'estorno', 'ajuste', 'expiracao')),
  valor numeric(15,2) NOT NULL CHECK (valor >= 0),
  saldo_antes numeric(15,2) NOT NULL CHECK (saldo_antes >= 0),
  saldo_depois numeric(15,2) NOT NULL CHECK (saldo_depois >= 0),
  origem text NOT NULL,
  referencia_externa text,
  agendamento_id uuid REFERENCES public.agendamentos(id),
  venda_produto_id uuid REFERENCES public.vendas_produtos(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (saldo_depois >= 0)
);

CREATE TABLE public.financeiro_audit_log (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  autor_id uuid REFERENCES auth.users(id),
  correlation_id text,
  origem text NOT NULL,
  entidade text NOT NULL,
  entidade_id uuid,
  antes jsonb,
  depois jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX financeiro_cp_status_data_idx ON public.financeiro_contas_pagar (barbearia_id, status, data_vencimento);
CREATE INDEX financeiro_cr_status_data_idx ON public.financeiro_contas_receber (barbearia_id, status, data_previsao);
CREATE INDEX financeiro_mov_status_data_idx ON public.financeiro_movimentacoes (barbearia_id, status, data_liquidacao);
CREATE INDEX financeiro_credito_cliente_idx ON public.financeiro_creditos_movimentacoes (barbearia_id, credito_cliente_id, created_at DESC);
CREATE UNIQUE INDEX financeiro_cp_fitid_unico ON public.financeiro_contas_pagar (barbearia_id, fitid) WHERE fitid IS NOT NULL;
CREATE UNIQUE INDEX financeiro_cr_fitid_unico ON public.financeiro_contas_receber (barbearia_id, fitid) WHERE fitid IS NOT NULL;
CREATE UNIQUE INDEX financeiro_mov_fitid_unico ON public.financeiro_movimentacoes (barbearia_id, fitid) WHERE fitid IS NOT NULL;
CREATE UNIQUE INDEX financeiro_mov_idempotency_unico ON public.financeiro_movimentacoes (barbearia_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.financeiro_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_contas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_creditos_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_creditos_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_audit_log ENABLE ROW LEVEL SECURITY;

-- Catálogo e contas podem ser administrados diretamente; títulos e ledger só por RPC.
CREATE POLICY financeiro_categorias_admin ON public.financeiro_categorias FOR ALL
  USING (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'))
  WITH CHECK (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'));
CREATE POLICY financeiro_contas_admin ON public.financeiro_contas_bancarias FOR ALL
  USING (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'))
  WITH CHECK (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'));
CREATE POLICY financeiro_cp_leitura_admin ON public.financeiro_contas_pagar FOR SELECT
  USING (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'));
CREATE POLICY financeiro_cr_leitura_admin ON public.financeiro_contas_receber FOR SELECT
  USING (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'));
CREATE POLICY financeiro_mov_leitura_admin ON public.financeiro_movimentacoes FOR SELECT
  USING (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'));
CREATE POLICY financeiro_creditos_leitura_admin ON public.financeiro_creditos_clientes FOR SELECT
  USING (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'));
CREATE POLICY financeiro_creditos_mov_leitura_admin ON public.financeiro_creditos_movimentacoes FOR SELECT
  USING (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'));
CREATE POLICY financeiro_audit_leitura_admin ON public.financeiro_audit_log FOR SELECT
  USING (barbearia_id = public.get_my_barbearia_id() AND public.get_my_role() IN ('admin', 'master'));

CREATE OR REPLACE FUNCTION public.financeiro_assert_admin()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('admin', 'master') THEN
    RAISE EXCEPTION 'FINANCEIRO_SEM_PERMISSAO';
  END IF;
  v_barbearia := public.get_my_barbearia_id();
  IF v_barbearia IS NULL THEN RAISE EXCEPTION 'FINANCEIRO_SEM_BARBEARIA'; END IF;
  RETURN v_barbearia;
END; $$;

CREATE OR REPLACE FUNCTION public.financeiro_auditar(p_barbearia uuid, p_origem text, p_entidade text, p_entidade_id uuid, p_antes jsonb, p_depois jsonb, p_correlation_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  INSERT INTO public.financeiro_audit_log (barbearia_id, autor_id, correlation_id, origem, entidade, entidade_id, antes, depois)
  VALUES (p_barbearia, auth.uid(), p_correlation_id, p_origem, p_entidade, p_entidade_id, p_antes, p_depois);
$$;

-- Liquida um título pendente e cria uma única saída efetivada. Erros abortam tudo.
CREATE OR REPLACE FUNCTION public.financeiro_pagar_conta(p_conta_pagar_id uuid, p_conta_bancaria_id uuid, p_data date, p_idempotency_key text, p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_titulo public.financeiro_contas_pagar%ROWTYPE; v_mov uuid;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  SELECT * INTO v_titulo FROM public.financeiro_contas_pagar WHERE id = p_conta_pagar_id AND barbearia_id = v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_ENCONTRADO'; END IF;
  IF v_titulo.status <> 'pendente' THEN RAISE EXCEPTION 'FINANCEIRO_TITULO_NAO_PENDENTE'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE id = p_conta_bancaria_id AND barbearia_id = v_barbearia AND ativa;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  SELECT id INTO v_mov FROM public.financeiro_movimentacoes WHERE barbearia_id = v_barbearia AND idempotency_key = p_idempotency_key;
  IF v_mov IS NOT NULL THEN RETURN jsonb_build_object('idempotente', true, 'movimentacao_id', v_mov); END IF;
  UPDATE public.financeiro_contas_pagar SET status = 'pago', data_liquidacao = p_data, conta_bancaria_id = p_conta_bancaria_id, updated_at = now() WHERE id = v_titulo.id;
  INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, categoria_id, origem, idempotency_key, conta_pagar_id, descricao)
  VALUES (v_barbearia, p_conta_bancaria_id, 'saida', v_titulo.valor, v_titulo.data_competencia, p_data, v_titulo.categoria_id, 'conta_pagar', p_idempotency_key, v_titulo.id, v_titulo.descricao) RETURNING id INTO v_mov;
  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_pagar', v_titulo.id, to_jsonb(v_titulo), jsonb_build_object('status','pago','movimentacao_id',v_mov), p_correlation_id);
  RETURN jsonb_build_object('idempotente', false, 'movimentacao_id', v_mov);
END; $$;

-- Liquida um recebível; a taxa vira saída financeira separada, sem reduzir a receita duas vezes.
CREATE OR REPLACE FUNCTION public.financeiro_receber_conta(p_conta_receber_id uuid, p_conta_bancaria_id uuid, p_data date, p_idempotency_key text, p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_titulo public.financeiro_contas_receber%ROWTYPE; v_entrada uuid; v_taxa uuid;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  SELECT * INTO v_titulo FROM public.financeiro_contas_receber WHERE id = p_conta_receber_id AND barbearia_id = v_barbearia FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_RECEBIVEL_NAO_ENCONTRADO'; END IF;
  IF v_titulo.status <> 'previsto' THEN RAISE EXCEPTION 'FINANCEIRO_RECEBIVEL_NAO_PREVISTO'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE id = p_conta_bancaria_id AND barbearia_id = v_barbearia AND ativa;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  SELECT id INTO v_entrada FROM public.financeiro_movimentacoes WHERE barbearia_id = v_barbearia AND idempotency_key = p_idempotency_key;
  IF v_entrada IS NOT NULL THEN RETURN jsonb_build_object('idempotente', true, 'movimentacao_id', v_entrada); END IF;
  UPDATE public.financeiro_contas_receber SET status = 'liquidado', data_liquidacao = p_data, conta_destino_id = p_conta_bancaria_id, updated_at = now() WHERE id = v_titulo.id;
  INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, categoria_id, origem, idempotency_key, conta_receber_id, descricao)
  VALUES (v_barbearia, p_conta_bancaria_id, 'entrada', v_titulo.valor_liquido, v_titulo.data_previsao, p_data, v_titulo.categoria_id, 'conta_receber', p_idempotency_key, v_titulo.id, v_titulo.descricao) RETURNING id INTO v_entrada;
  IF v_titulo.taxa > 0 THEN
    INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, origem, idempotency_key, conta_receber_id, descricao)
    VALUES (v_barbearia, p_conta_bancaria_id, 'saida', v_titulo.taxa, v_titulo.data_previsao, p_data, 'taxa_cartao', p_idempotency_key || ':taxa', v_titulo.id, 'Taxa financeira: ' || v_titulo.descricao) RETURNING id INTO v_taxa;
  END IF;
  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_contas_receber', v_titulo.id, to_jsonb(v_titulo), jsonb_build_object('status','liquidado','movimentacao_id',v_entrada,'taxa_movimentacao_id',v_taxa), p_correlation_id);
  RETURN jsonb_build_object('idempotente', false, 'movimentacao_id', v_entrada, 'taxa_movimentacao_id', v_taxa);
END; $$;

-- Transfere saldo entre contas em duas pontas atômicas; origem=transferencia exclui DRE.
CREATE OR REPLACE FUNCTION public.financeiro_transferir(p_origem_id uuid, p_destino_id uuid, p_valor numeric, p_data date, p_idempotency_key text, p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_transferencia uuid := extensions.uuid_generate_v4(); v_saida uuid; v_entrada uuid;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  IF p_valor < 0 OR p_origem_id = p_destino_id THEN RAISE EXCEPTION 'FINANCEIRO_TRANSFERENCIA_INVALIDA'; END IF;
  PERFORM 1 FROM public.financeiro_contas_bancarias WHERE id IN (p_origem_id, p_destino_id) AND barbearia_id = v_barbearia AND ativa GROUP BY barbearia_id HAVING count(*) = 2;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CONTA_INVALIDA'; END IF;
  SELECT id INTO v_saida FROM public.financeiro_movimentacoes WHERE barbearia_id = v_barbearia AND idempotency_key = p_idempotency_key;
  IF v_saida IS NOT NULL THEN RETURN jsonb_build_object('idempotente', true, 'movimentacao_id', v_saida); END IF;
  INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, origem, transferencia_id, idempotency_key, descricao)
  VALUES (v_barbearia, p_origem_id, 'saida', p_valor, p_data, p_data, 'transferencia', v_transferencia, p_idempotency_key, 'Transferência entre contas') RETURNING id INTO v_saida;
  INSERT INTO public.financeiro_movimentacoes (barbearia_id, conta_bancaria_id, direcao, valor, data_competencia, data_liquidacao, origem, transferencia_id, idempotency_key, descricao)
  VALUES (v_barbearia, p_destino_id, 'entrada', p_valor, p_data, p_data, 'transferencia', v_transferencia, p_idempotency_key || ':entrada', 'Transferência entre contas') RETURNING id INTO v_entrada;
  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_movimentacoes', v_saida, NULL, jsonb_build_object('transferencia_id',v_transferencia,'entrada_id',v_entrada), p_correlation_id);
  RETURN jsonb_build_object('idempotente', false, 'transferencia_id', v_transferencia, 'saida_id', v_saida, 'entrada_id', v_entrada);
END; $$;

-- Movimenta crédito em razão imutável; lock na projeção impede saldo concorrente negativo.
CREATE OR REPLACE FUNCTION public.financeiro_credito_movimentar(p_cliente_id uuid, p_motivo text, p_valor numeric, p_origem text, p_referencia_externa text DEFAULT NULL, p_correlation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_barbearia uuid; v_credito public.financeiro_creditos_clientes%ROWTYPE; v_antes numeric; v_depois numeric; v_id uuid;
BEGIN
  v_barbearia := public.financeiro_assert_admin();
  IF p_valor < 0 OR p_motivo NOT IN ('emissao','uso','estorno','ajuste','expiracao') THEN RAISE EXCEPTION 'FINANCEIRO_CREDITO_INVALIDO'; END IF;
  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id AND barbearia_id = v_barbearia;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCEIRO_CLIENTE_INVALIDO'; END IF;
  INSERT INTO public.financeiro_creditos_clientes (barbearia_id, cliente_id) VALUES (v_barbearia, p_cliente_id) ON CONFLICT (barbearia_id, cliente_id) DO NOTHING;
  SELECT * INTO v_credito FROM public.financeiro_creditos_clientes WHERE barbearia_id = v_barbearia AND cliente_id = p_cliente_id FOR UPDATE;
  v_antes := v_credito.saldo;
  v_depois := CASE WHEN p_motivo IN ('uso','expiracao') THEN v_antes - p_valor ELSE v_antes + p_valor END;
  IF v_depois < 0 THEN RAISE EXCEPTION 'FINANCEIRO_SALDO_INSUFICIENTE'; END IF;
  UPDATE public.financeiro_creditos_clientes SET saldo = v_depois, updated_at = now() WHERE id = v_credito.id;
  INSERT INTO public.financeiro_creditos_movimentacoes (barbearia_id, credito_cliente_id, motivo, valor, saldo_antes, saldo_depois, origem, referencia_externa)
  VALUES (v_barbearia, v_credito.id, p_motivo, p_valor, v_antes, v_depois, p_origem, p_referencia_externa) RETURNING id INTO v_id;
  PERFORM public.financeiro_auditar(v_barbearia, 'rpc', 'financeiro_creditos_clientes', v_credito.id, jsonb_build_object('saldo',v_antes), jsonb_build_object('saldo',v_depois,'movimentacao_id',v_id), p_correlation_id);
  RETURN jsonb_build_object('movimentacao_id', v_id, 'saldo_antes', v_antes, 'saldo_depois', v_depois);
END; $$;

REVOKE ALL ON FUNCTION public.financeiro_assert_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_auditar(uuid, text, text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_pagar_conta(uuid, uuid, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.financeiro_receber_conta(uuid, uuid, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.financeiro_transferir(uuid, uuid, numeric, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.financeiro_credito_movimentar(uuid, text, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financeiro_pagar_conta(uuid, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_receber_conta(uuid, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_transferir(uuid, uuid, numeric, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_credito_movimentar(uuid, text, numeric, text, text, text) TO authenticated;
