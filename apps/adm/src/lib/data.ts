import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type Plan = { id: string; codigo: string; nome: string; status: string; preco_mensal: number | null; preco_anual: number | null; dias_trial: number; limite_usuarios: number | null };
export type Barbershop = { id: string; nome: string; slug: string; criado_em: string };
export type Subscription = { id: string; barbearia_id: string; plano_id: string; status: string; ciclo: string; preco_final: number; membro_fundador: boolean; gateway_provider: string | null; created_at: string };
export type Checkout = { id: string; plano_id: string; nome_barbearia: string; nome_admin: string; email_admin: string; status: string; ciclo: string; preco_final: number; gateway_ambiente: string | null; created_at: string };
export type GatewayEvent = { id: string; event_type: string; status: string; resource_id: string | null; erro_codigo: string | null; recebido_em: string };
export type PlatformModule = { id: string; codigo: string; nome: string; descricao: string | null; entitlement_codigo: string | null; status: string; preco_mensal: number | null; configuracao: Record<string, unknown> };
export type ProvisioningModule = { id: string; codigo: string; nome: string; descricao: string | null; preco_mensal: number | null; preco_anual: number | null };
export type PlatformIntegration = {
  id: string;
  categoria: string;
  codigo: string;
  nome: string;
  provider: string;
  ambiente: string;
  status: string;
  principal: boolean;
  base_url: string | null;
  credencial_ref: string | null;
  webhook_secret_ref: string | null;
  configuracao_publica: Record<string, unknown>;
  ultimo_teste_em: string | null;
  ultima_falha_codigo: string | null;
};

export async function dashboardData() {
  const supabase = createAdminSupabase();
  const [plans, shops, subscriptions, checkouts, latest] = await Promise.all([
    supabase.from("saas_planos").select("*", { count: "exact", head: true }),
    supabase.from("barbearias").select("*", { count: "exact", head: true }),
    supabase.from("saas_assinaturas").select("*", { count: "exact", head: true }),
    supabase.from("saas_checkouts").select("*", { count: "exact", head: true }).in("status", ["iniciado", "aguardando_pagamento", "pago", "provisionando"]),
    supabase.from("saas_assinaturas").select("id,barbearia_id,plano_id,status,ciclo,preco_final,membro_fundador,gateway_provider,created_at").order("created_at", { ascending: false }).limit(6),
  ]);
  if ([plans.error, shops.error, subscriptions.error, checkouts.error, latest.error].some(Boolean)) throw new Error("Não foi possível carregar o resumo do ADM.");

  const rows = (latest.data ?? []) as Subscription[];
  const shopIds = [...new Set(rows.map((item) => item.barbearia_id))];
  const planIds = [...new Set(rows.map((item) => item.plano_id))];
  const [shopRows, planRows] = await Promise.all([
    shopIds.length ? supabase.from("barbearias").select("id,nome,slug").in("id", shopIds) : Promise.resolve({ data: [], error: null }),
    planIds.length ? supabase.from("saas_planos").select("id,nome,codigo").in("id", planIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (shopRows.error || planRows.error) throw new Error("Não foi possível completar o resumo do ADM.");

  return {
    counts: { plans: plans.count ?? 0, shops: shops.count ?? 0, subscriptions: subscriptions.count ?? 0, checkouts: checkouts.count ?? 0 },
    latest: rows,
    shops: new Map((shopRows.data ?? []).map((item) => [item.id, item])),
    plans: new Map((planRows.data ?? []).map((item) => [item.id, item])),
  };
}

export async function listPlans() {
  const { data, error } = await createAdminSupabase().from("saas_planos").select("id,codigo,nome,status,preco_mensal,preco_anual,dias_trial,limite_usuarios").order("ordem").order("nome");
  if (error) throw new Error("Não foi possível listar os planos.");
  return (data ?? []) as Plan[];
}

export async function listBarbershops() {
  const { data, error } = await createAdminSupabase().from("barbearias").select("id,nome,slug,criado_em").order("criado_em", { ascending: false });
  if (error) throw new Error("Não foi possível listar as barbearias.");
  return (data ?? []) as Barbershop[];
}

export async function listSubscriptions() {
  const supabase = createAdminSupabase();
  const [subscriptionsResult, checkoutsResult, eventsResult] = await Promise.all([
    supabase.from("saas_assinaturas").select("id,barbearia_id,plano_id,status,ciclo,preco_final,membro_fundador,gateway_provider,created_at").order("created_at", { ascending: false }),
    supabase.from("saas_checkouts").select("id,plano_id,nome_barbearia,nome_admin,email_admin,status,ciclo,preco_final,gateway_ambiente,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("saas_gateway_eventos").select("id,event_type,status,resource_id,erro_codigo,recebido_em").order("recebido_em", { ascending: false }).limit(30),
  ]);
  if (subscriptionsResult.error || checkoutsResult.error || eventsResult.error) throw new Error("Não foi possível listar as assinaturas.");
  const data = subscriptionsResult.data;
  const rows = (data ?? []) as Subscription[];
  const [shops, plans] = await Promise.all([
    supabase.from("barbearias").select("id,nome,slug"),
    supabase.from("saas_planos").select("id,nome,codigo"),
  ]);
  if (shops.error || plans.error) throw new Error("Não foi possível completar as assinaturas.");
  return {
    rows,
    checkouts: (checkoutsResult.data ?? []) as Checkout[],
    events: (eventsResult.data ?? []) as GatewayEvent[],
    shops: new Map((shops.data ?? []).map((item) => [item.id, item])),
    plans: new Map((plans.data ?? []).map((item) => [item.id, item])),
  };
}

export async function manualProvisioningOptions() {
  const supabase = createAdminSupabase();
  const { data: product, error: productError } = await supabase.from("plataforma_produtos")
    .select("id").eq("codigo", "garagem").eq("ativo", true).single();
  if (productError || !product) throw new Error("Não foi possível localizar o produto Garagem.");

  const [plansResult, modulesResult] = await Promise.all([
    supabase.from("saas_planos")
      .select("id,codigo,nome,status,preco_mensal,preco_anual,dias_trial,limite_usuarios")
      .eq("produto_id", product.id).eq("status", "ativo").order("ordem").order("nome"),
    supabase.from("saas_modulos")
      .select("id,codigo,nome,descricao,preco_mensal,preco_anual")
      .eq("produto_id", product.id).eq("status", "ativo").order("ordem").order("nome"),
  ]);
  if (plansResult.error || modulesResult.error) throw new Error("Não foi possível carregar as opções de implantação.");
  return {
    plans: (plansResult.data ?? []) as Plan[],
    modules: (modulesResult.data ?? []) as ProvisioningModule[],
  };
}

export async function platformSettings() {
  const supabase = createAdminSupabase();
  const { data: product, error: productError } = await supabase
    .from("plataforma_produtos")
    .select("id,codigo,nome")
    .eq("codigo", "garagem")
    .single();
  if (productError || !product) throw new Error("Não foi possível localizar o produto Garagem.");

  const [modulesResult, integrationsResult] = await Promise.all([
    supabase
      .from("saas_modulos")
      .select("id,codigo,nome,descricao,entitlement_codigo,status,preco_mensal,configuracao")
      .eq("produto_id", product.id)
      .order("ordem")
      .order("nome"),
    supabase
      .from("plataforma_integracoes")
      .select("id,categoria,codigo,nome,provider,ambiente,status,principal,base_url,credencial_ref,webhook_secret_ref,configuracao_publica,ultimo_teste_em,ultima_falha_codigo")
      .eq("produto_id", product.id)
      .order("categoria")
      .order("nome"),
  ]);
  if (modulesResult.error || integrationsResult.error) throw new Error("Não foi possível carregar as configurações da plataforma.");

  const integrations = (integrationsResult.data ?? []) as PlatformIntegration[];
  return {
    product,
    modules: (modulesResult.data ?? []) as PlatformModule[],
    integrations: integrations.map((integration) => ({
      ...integration,
      credentialConfigured: integration.credencial_ref ? Boolean(process.env[integration.credencial_ref]) : true,
      webhookSecretConfigured: integration.webhook_secret_ref ? Boolean(process.env[integration.webhook_secret_ref]) : true,
    })),
  };
}
