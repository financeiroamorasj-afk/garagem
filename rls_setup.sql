-- ========================================================
-- MISSÃO: AUTENTICAÇÃO E ROW LEVEL SECURITY (RLS)
-- ARQUITETURA: MULTITENANT (WHITE LABEL)
-- AUTOR: ENGENHEIRO DE BANCO DE DADOS SÊNIOR
-- ========================================================

-- 1. FUNÇÕES AUXILIARES (SECURITY DEFINER)
-- Estas funções evitam recursão infinita e otimizam a performance das políticas.
-- Elas rodam com privilégios de 'security definer' para ler metadados de autenticação e perfis.

CREATE OR REPLACE FUNCTION get_my_barbearia_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT barbearia_id FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT role FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_my_profissional_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM profissionais WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. HABILITAR RLS EM TODAS AS TABELAS
ALTER TABLE barbearias ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas_produtos ENABLE ROW LEVEL SECURITY;

-- ========================================================
-- 3. POLÍTICAS PARA 'BARBEARIAS'
-- ========================================================
-- Admin e Barbeiro podem ver a própria barbearia.
CREATE POLICY "Users can view their own barbearia" 
ON barbearias FOR SELECT 
USING (id = get_my_barbearia_id());

-- Apenas Admin pode atualizar a barbearia.
CREATE POLICY "Admins can update their own barbearia" 
ON barbearias FOR UPDATE 
USING (id = get_my_barbearia_id() AND get_my_role() = 'admin');

-- ========================================================
-- 4. POLÍTICAS PARA 'PROFILES'
-- ========================================================
-- Isolamento de tenant: ver apenas perfis da mesma barbearia.
CREATE POLICY "Users can select profiles from same barbearia" 
ON profiles FOR SELECT 
USING (barbearia_id = get_my_barbearia_id());

-- Admin pode gerenciar perfis na mesma barbearia.
CREATE POLICY "Admins can manage profiles in their barbearia" 
ON profiles FOR ALL 
USING (barbearia_id = get_my_barbearia_id() AND get_my_role() = 'admin');

-- ========================================================
-- 5. POLÍTICAS PARA 'PROFISSIONAIS', 'CLIENTES', 'SERVICOS'
-- ========================================================
-- SELECT: Admin e Barbeiro (mesma barbearia).
CREATE POLICY "Users can select from same barbearia" 
ON profissionais FOR SELECT USING (barbearia_id = get_my_barbearia_id());

CREATE POLICY "Users can select from same barbearia" 
ON clientes FOR SELECT USING (barbearia_id = get_my_barbearia_id());

CREATE POLICY "Users can select from same barbearia" 
ON servicos FOR SELECT USING (barbearia_id = get_my_barbearia_id());

-- ADMIN: INSERT, UPDATE, DELETE total (mesma barbearia).
CREATE POLICY "Admins have full access to profissionais" 
ON profissionais FOR ALL 
USING (barbearia_id = get_my_barbearia_id() AND get_my_role() = 'admin');

CREATE POLICY "Admins have full access to clientes" 
ON clientes FOR ALL 
USING (barbearia_id = get_my_barbearia_id() AND get_my_role() = 'admin');

CREATE POLICY "Admins have full access to servicos" 
ON servicos FOR ALL 
USING (barbearia_id = get_my_barbearia_id() AND get_my_role() = 'admin');

-- ========================================================
-- 6. POLÍTICAS PARA 'AGENDAMENTOS'
-- ========================================================
-- ADMIN: Total.
CREATE POLICY "Admins have full access to agendamentos" 
ON agendamentos FOR ALL 
USING (barbearia_id = get_my_barbearia_id() AND get_my_role() = 'admin');

-- BARBEIRO: Select e Update apenas dos PRÓPRIOS agendamentos.
CREATE POLICY "Barbeiros can manage their own agendamentos" 
ON agendamentos FOR SELECT 
USING (barbearia_id = get_my_barbearia_id() AND profissional_id = get_my_profissional_id());

CREATE POLICY "Barbeiros can update their own agendamentos" 
ON agendamentos FOR UPDATE 
USING (barbearia_id = get_my_barbearia_id() AND profissional_id = get_my_profissional_id())
WITH CHECK (barbearia_id = get_my_barbearia_id() AND profissional_id = get_my_profissional_id());

-- BARBEIRO: Insert (deve ser para ele mesmo).
CREATE POLICY "Barbeiros can insert agendamentos for themselves" 
ON agendamentos FOR INSERT 
WITH CHECK (
    barbearia_id = get_my_barbearia_id() 
    AND get_my_role() = 'barbeiro' 
    AND profissional_id = get_my_profissional_id()
);

-- Note: DELETE não foi concedido para barbeiro.

-- ========================================================
-- 7. POLÍTICAS PARA 'VENDAS_PRODUTOS'
-- ========================================================
-- ADMIN: Total.
CREATE POLICY "Admins have full access to vendas_produtos" 
ON vendas_produtos FOR ALL 
USING (barbearia_id = get_my_barbearia_id() AND get_my_role() = 'admin');

-- BARBEIRO: Select (próprias vendas) e Insert.
CREATE POLICY "Barbeiros can view their own sales" 
ON vendas_produtos FOR SELECT 
USING (barbearia_id = get_my_barbearia_id() AND profissional_id = get_my_profissional_id());

CREATE POLICY "Barbeiros can insert their sales" 
ON vendas_produtos FOR INSERT 
WITH CHECK (
    barbearia_id = get_my_barbearia_id() 
    AND get_my_role() = 'barbeiro' 
    AND profissional_id = get_my_profissional_id()
);

-- Bloqueio Preventivo: Garante que nada passe por barbearia_id nulo ou cruzado
-- (As políticas acima já cobrem isso, mas isto é uma camada de reforço).
CREATE POLICY "Prevent cross-tenant access" 
ON agendamentos AS RESTRICTIVE 
USING (barbearia_id = get_my_barbearia_id());
