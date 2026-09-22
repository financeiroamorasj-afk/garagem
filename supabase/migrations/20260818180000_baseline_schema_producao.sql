


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_my_barbearia_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
            BEGIN
              -- This runs as the owner of the function, bypassing RLS
              RETURN (SELECT barbearia_id FROM public.profiles WHERE id = auth.uid() LIMIT 1);
            END;
            $$;


ALTER FUNCTION "public"."get_my_barbearia_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_profissional_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN (SELECT id FROM profissionais WHERE user_id = auth.uid());
END;
$$;


ALTER FUNCTION "public"."get_my_profissional_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
            BEGIN
              RETURN (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1);
            END;
            $$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agendamentos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "barbearia_id" "uuid",
    "profissional_id" "uuid",
    "cliente_id" "uuid",
    "cliente_nome_manual" "text",
    "servico_id" "uuid",
    "data_hora" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text",
    "valor_final" numeric(10,2),
    "criado_em" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "agendamentos_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'confirmado'::"text", 'concluido'::"text", 'cancelado'::"text", 'encaixe'::"text"])))
);


ALTER TABLE "public"."agendamentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barbearias" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "config_cores" "jsonb" DEFAULT '{"primary": "#B87333", "background": "#121212"}'::"jsonb",
    "criado_em" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."barbearias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "barbearia_id" "uuid",
    "nome" "text" NOT NULL,
    "telefone" "text",
    "barbeiro_favorito_id" "uuid",
    "notas_preferencias" "text",
    "criado_em" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contas_receber" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid",
    "descricao" "text",
    "valor_bruto" numeric(10,2),
    "taxa_operadora" numeric(10,2),
    "valor_liquido" numeric(10,2),
    "data_venda" "date",
    "data_prevista_recebimento" "date",
    "data_liquidacao_real" "date",
    "metodo_pagamento" "text",
    "status" "text",
    "conta_destino_id" "uuid",
    "cliente_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "conciliado" boolean DEFAULT false,
    "data_conciliacao" timestamp with time zone,
    "id_transacao_banco" "text",
    "venda_id" "uuid",
    "categoria_id" "uuid"
);


ALTER TABLE "public"."contas_receber" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movimentacoes_financeiras" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid",
    "conta_id" "uuid",
    "venda_id" "uuid",
    "tipo" "text",
    "valor" numeric(10,2),
    "categoria" character varying,
    "descricao" "text",
    "data_competencia" "date",
    "data_liquidacao" "date",
    "status" character varying,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "criado_por" character varying,
    "categoria_id" "uuid",
    "conciliado" boolean DEFAULT false,
    "id_transacao_banco" character varying,
    "data_conciliacao" timestamp with time zone
);


ALTER TABLE "public"."movimentacoes_financeiras" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."produtos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "barbearia_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "preco_venda" numeric(10,2) NOT NULL,
    "preco_custo" numeric(10,2) NOT NULL,
    "estoque_quantidade" integer DEFAULT 0 NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "produtos_preco_custo_check" CHECK (("preco_custo" >= (0)::numeric)),
    CONSTRAINT "produtos_preco_venda_check" CHECK (("preco_venda" >= (0)::numeric))
);


ALTER TABLE "public"."produtos" OWNER TO "postgres";


COMMENT ON TABLE "public"."produtos" IS 'Catálogo de produtos vendáveis. Fonte de preco_custo para CMV — vendas_produtos grava um snapshot deste valor no momento da venda (ver comentário em vendas_produtos.preco_custo_snapshot).';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "barbearia_id" "uuid",
    "role" "text" DEFAULT 'barbeiro'::"text",
    "nome" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profissionais" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "barbearia_id" "uuid",
    "nome" "text" NOT NULL,
    "especialidade" "text",
    "foto_url" "text",
    "ativo" boolean DEFAULT true,
    "criado_em" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "user_id" "uuid",
    "comissao_percentual" numeric(5,2),
    CONSTRAINT "profissionais_comissao_percentual_check" CHECK ((("comissao_percentual" IS NULL) OR (("comissao_percentual" >= (0)::numeric) AND ("comissao_percentual" <= (100)::numeric))))
);


ALTER TABLE "public"."profissionais" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profissionais"."comissao_percentual" IS 'Percentual padrão de comissão do profissional (0-100). NULL = comissão não configurada ainda / a definir.';



CREATE TABLE IF NOT EXISTS "public"."servicos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "barbearia_id" "uuid",
    "nome" "text" NOT NULL,
    "preco" numeric(10,2) NOT NULL,
    "duracao_minutos" integer DEFAULT 30,
    "criado_em" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "descricao" "text",
    "comissao_percentual" numeric(5,2),
    "ativo" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "servicos_comissao_percentual_check" CHECK ((("comissao_percentual" IS NULL) OR (("comissao_percentual" >= (0)::numeric) AND ("comissao_percentual" <= (100)::numeric))))
);


ALTER TABLE "public"."servicos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."servicos"."comissao_percentual" IS 'Override de comissão específico deste serviço (0-100). NULL = herda profissionais.comissao_percentual.';



CREATE TABLE IF NOT EXISTS "public"."vendas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid",
    "cliente_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "itens" "jsonb",
    "subtotal" numeric(10,2),
    "desconto_cupom" numeric(10,2),
    "credito_utilizado" numeric(10,2),
    "total_pago" numeric(10,2),
    "forma_pagamento" "text",
    "margem_estimada" numeric(10,2),
    "sacolinha_id" "uuid",
    "canal_venda" "text",
    "operador" "text",
    "nome_cliente" "text",
    "status" "text",
    "desconto" numeric(10,2),
    "historico_estornos" "jsonb",
    "parcelas" integer,
    "auditoria" "jsonb",
    "filial_id" "uuid",
    "operador_id" "uuid",
    "venda_bruta" numeric(10,2),
    "venda_liquida_operacional" numeric(10,2),
    "venda_liquida_financeira" numeric(10,2),
    "taxas_financeiras" numeric(10,2),
    "cpv_total" numeric(10,2),
    "data_recebimento_projetada" "date",
    "is_legado" boolean,
    "canal_origem" "text",
    "condicional_id" "uuid",
    "vendedor_id" "uuid",
    "frete" numeric(10,2),
    "funcionario_comprador_id" "uuid"
);


ALTER TABLE "public"."vendas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendas_produtos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "barbearia_id" "uuid",
    "agendamento_id" "uuid",
    "profissional_id" "uuid",
    "nome_produto" "text" NOT NULL,
    "valor_venda" numeric(10,2) NOT NULL,
    "comissao_paga" boolean DEFAULT false,
    "criado_em" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "produto_id" "uuid",
    "cliente_id" "uuid",
    "quantidade" integer DEFAULT 1 NOT NULL,
    "preco_unitario_snapshot" numeric(10,2),
    "preco_custo_snapshot" numeric(10,2),
    "status" "text" DEFAULT 'concluida'::"text" NOT NULL,
    CONSTRAINT "vendas_produtos_quantidade_check" CHECK (("quantidade" > 0)),
    CONSTRAINT "vendas_produtos_status_check" CHECK (("status" = ANY (ARRAY['concluida'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."vendas_produtos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vendas_produtos"."preco_unitario_snapshot" IS 'Preço do produto no momento da venda. Não referenciar produtos.preco_venda diretamente em relatórios — o preço muda com o tempo (mesmo problema identificado no CMV do Rebip durante /financeiro-fundacao, evitado aqui por design.';



COMMENT ON COLUMN "public"."vendas_produtos"."preco_custo_snapshot" IS 'Custo do produto no momento da venda — base do CMV. Snapshot pelo mesmo motivo do preco_unitario_snapshot: editar produtos.preco_custo depois não pode alterar a DRE de meses já fechados.';



ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barbearias"
    ADD CONSTRAINT "barbearias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barbearias"
    ADD CONSTRAINT "barbearias_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contas_receber"
    ADD CONSTRAINT "contas_receber_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movimentacoes_financeiras"
    ADD CONSTRAINT "movimentacoes_financeiras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profissionais"
    ADD CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."servicos"
    ADD CONSTRAINT "servicos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendas"
    ADD CONSTRAINT "vendas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendas_produtos"
    ADD CONSTRAINT "vendas_produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "agendamentos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "public"."barbearias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "agendamentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "agendamentos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissionais"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agendamentos"
    ADD CONSTRAINT "agendamentos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "public"."servicos"("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "public"."barbearias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_barbeiro_favorito_id_fkey" FOREIGN KEY ("barbeiro_favorito_id") REFERENCES "public"."profissionais"("id");



ALTER TABLE ONLY "public"."contas_receber"
    ADD CONSTRAINT "contas_receber_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."movimentacoes_financeiras"
    ADD CONSTRAINT "mov_fin_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "public"."barbearias"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "public"."barbearias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profissionais"
    ADD CONSTRAINT "profissionais_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "public"."barbearias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profissionais"
    ADD CONSTRAINT "profissionais_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."servicos"
    ADD CONSTRAINT "servicos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "public"."barbearias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_produtos"
    ADD CONSTRAINT "vendas_produtos_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "public"."agendamentos"("id");



ALTER TABLE ONLY "public"."vendas_produtos"
    ADD CONSTRAINT "vendas_produtos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "public"."barbearias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_produtos"
    ADD CONSTRAINT "vendas_produtos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."vendas_produtos"
    ADD CONSTRAINT "vendas_produtos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id");



ALTER TABLE ONLY "public"."vendas_produtos"
    ADD CONSTRAINT "vendas_produtos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissionais"("id");



CREATE POLICY "Admins can manage profiles in their barbearia" ON "public"."profiles" USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins can update their own barbearia" ON "public"."barbearias" FOR UPDATE USING ((("id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins have full access to agendamentos" ON "public"."agendamentos" USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins have full access to clientes" ON "public"."clientes" USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins have full access to produtos" ON "public"."produtos" USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins have full access to profissionais" ON "public"."profissionais" USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins have full access to servicos" ON "public"."servicos" USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins have full access to vendas_produtos" ON "public"."vendas_produtos" USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Barbeiros can insert agendamentos for themselves" ON "public"."agendamentos" FOR INSERT WITH CHECK ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'barbeiro'::"text") AND ("profissional_id" = "public"."get_my_profissional_id"())));



CREATE POLICY "Barbeiros can insert their sales" ON "public"."vendas_produtos" FOR INSERT WITH CHECK ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("public"."get_my_role"() = 'barbeiro'::"text") AND ("profissional_id" = "public"."get_my_profissional_id"())));



CREATE POLICY "Barbeiros can manage their own agendamentos" ON "public"."agendamentos" FOR SELECT USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("profissional_id" = "public"."get_my_profissional_id"())));



CREATE POLICY "Barbeiros can update their own agendamentos" ON "public"."agendamentos" FOR UPDATE USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("profissional_id" = "public"."get_my_profissional_id"()))) WITH CHECK ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("profissional_id" = "public"."get_my_profissional_id"())));



CREATE POLICY "Barbeiros can view their own sales" ON "public"."vendas_produtos" FOR SELECT USING ((("barbearia_id" = "public"."get_my_barbearia_id"()) AND ("profissional_id" = "public"."get_my_profissional_id"())));



CREATE POLICY "Prevent cross-tenant access" ON "public"."agendamentos" AS RESTRICTIVE USING (("barbearia_id" = "public"."get_my_barbearia_id"()));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can select from same barbearia" ON "public"."clientes" FOR SELECT USING (("barbearia_id" = "public"."get_my_barbearia_id"()));



CREATE POLICY "Users can select from same barbearia" ON "public"."profissionais" FOR SELECT USING (("barbearia_id" = "public"."get_my_barbearia_id"()));



CREATE POLICY "Users can select from same barbearia" ON "public"."servicos" FOR SELECT USING (("barbearia_id" = "public"."get_my_barbearia_id"()));



CREATE POLICY "Users can select produtos from same barbearia" ON "public"."produtos" FOR SELECT USING (("barbearia_id" = "public"."get_my_barbearia_id"()));



CREATE POLICY "Users can select profiles from same barbearia" ON "public"."profiles" FOR SELECT USING ((("id" <> "auth"."uid"()) AND ("barbearia_id" = "public"."get_my_barbearia_id"())));



CREATE POLICY "Users can view their own barbearia" ON "public"."barbearias" FOR SELECT USING (("id" = "public"."get_my_barbearia_id"()));



ALTER TABLE "public"."agendamentos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."barbearias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contas_receber" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movimentacoes_financeiras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."produtos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profissionais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."servicos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendas_produtos" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."get_my_barbearia_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_barbearia_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_barbearia_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_profissional_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_profissional_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_profissional_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."agendamentos" TO "anon";
GRANT ALL ON TABLE "public"."agendamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."agendamentos" TO "service_role";



GRANT ALL ON TABLE "public"."barbearias" TO "anon";
GRANT ALL ON TABLE "public"."barbearias" TO "authenticated";
GRANT ALL ON TABLE "public"."barbearias" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON TABLE "public"."contas_receber" TO "anon";
GRANT ALL ON TABLE "public"."contas_receber" TO "authenticated";
GRANT ALL ON TABLE "public"."contas_receber" TO "service_role";



GRANT ALL ON TABLE "public"."movimentacoes_financeiras" TO "anon";
GRANT ALL ON TABLE "public"."movimentacoes_financeiras" TO "authenticated";
GRANT ALL ON TABLE "public"."movimentacoes_financeiras" TO "service_role";



GRANT ALL ON TABLE "public"."produtos" TO "anon";
GRANT ALL ON TABLE "public"."produtos" TO "authenticated";
GRANT ALL ON TABLE "public"."produtos" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profissionais" TO "anon";
GRANT ALL ON TABLE "public"."profissionais" TO "authenticated";
GRANT ALL ON TABLE "public"."profissionais" TO "service_role";



GRANT ALL ON TABLE "public"."servicos" TO "anon";
GRANT ALL ON TABLE "public"."servicos" TO "authenticated";
GRANT ALL ON TABLE "public"."servicos" TO "service_role";



GRANT ALL ON TABLE "public"."vendas" TO "anon";
GRANT ALL ON TABLE "public"."vendas" TO "authenticated";
GRANT ALL ON TABLE "public"."vendas" TO "service_role";



GRANT ALL ON TABLE "public"."vendas_produtos" TO "anon";
GRANT ALL ON TABLE "public"."vendas_produtos" TO "authenticated";
GRANT ALL ON TABLE "public"."vendas_produtos" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
