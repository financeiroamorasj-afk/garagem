import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type Plan = { id: string; codigo: string; nome: string; status: string; preco_mensal: number | null; preco_anual: number | null; dias_trial: number; limite_usuarios: number | null };
export type Barbershop = { id: string; nome: string; slug: string; criado_em: string };
export type Subscription = { id: string; barbearia_id: string; plano_id: string; status: string; ciclo: string; preco_final: number; membro_fundador: boolean; created_at: string };

export async function dashboardData() {
  const supabase = createAdminSupabase();
  const [plans, shops, subscriptions, checkouts, latest] = await Promise.all([
    supabase.from("saas_planos").select("*", { count: "exact", head: true }),
    supabase.from("barbearias").select("*", { count: "exact", head: true }),
    supabase.from("saas_assinaturas").select("*", { count: "exact", head: true }),
    supabase.from("saas_checkouts").select("*", { count: "exact", head: true }).in("status", ["iniciado", "aguardando_pagamento", "pago", "provisionando"]),
    supabase.from("saas_assinaturas").select("id,barbearia_id,plano_id,status,ciclo,preco_final,membro_fundador,created_at").order("created_at", { ascending: false }).limit(6),
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
  const { data, error } = await supabase.from("saas_assinaturas").select("id,barbearia_id,plano_id,status,ciclo,preco_final,membro_fundador,created_at").order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível listar as assinaturas.");
  const rows = (data ?? []) as Subscription[];
  const [shops, plans] = await Promise.all([
    supabase.from("barbearias").select("id,nome,slug"),
    supabase.from("saas_planos").select("id,nome,codigo"),
  ]);
  if (shops.error || plans.error) throw new Error("Não foi possível completar as assinaturas.");
  return {
    rows,
    shops: new Map((shops.data ?? []).map((item) => [item.id, item])),
    plans: new Map((plans.data ?? []).map((item) => [item.id, item])),
  };
}
