import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type GatewayData = {
  provider?: string | null;
  environment?: "sandbox" | "producao" | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  billingType?: string | null;
};

async function markStep(
  supabase: SupabaseClient,
  checkoutId: string,
  step: string,
  status: "executando" | "concluida" | "falhou",
  error?: unknown,
) {
  await supabase.from("saas_provisionamento_etapas").upsert({
    checkout_id: checkoutId,
    etapa: step,
    status,
    tentativas: status === "executando" ? 1 : undefined,
    erro_codigo: status === "falhou" ? "PROVISIONAMENTO_FALHOU" : null,
    erro_detalhe: status === "falhou" && error instanceof Error ? error.message.slice(0, 500) : null,
    started_at: status === "executando" ? new Date().toISOString() : undefined,
    completed_at: status === "concluida" ? new Date().toISOString() : null,
  }, { onConflict: "checkout_id,etapa" });
}

function periodEnd(cycle: "mensal" | "anual") {
  const date = new Date();
  if (cycle === "anual") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

function discountEnd(cycle: "mensal" | "anual", discount: number) {
  if (!discount || cycle !== "mensal") return null;
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 6);
  return date.toISOString().slice(0, 10);
}

export async function provisionPaidCheckout(
  supabase: SupabaseClient,
  checkoutId: string,
  gateway: GatewayData,
) {
  const { data: checkout, error: checkoutError } = await supabase.from("saas_checkouts")
    .select("*").eq("id", checkoutId).single();
  if (checkoutError || !checkout) throw new Error("PROVISIONAMENTO_CHECKOUT_NAO_ENCONTRADO");
  if (checkout.status === "concluido") {
    await supabase.from("saas_assinaturas").update({
      gateway_customer_id: gateway.customerId ?? checkout.gateway_customer_id,
      gateway_subscription_id: gateway.subscriptionId ?? checkout.gateway_subscription_id,
    }).eq("checkout_id", checkout.id);
    return checkout;
  }

  await supabase.from("saas_checkouts").update({
    status: "provisionando",
    gateway_customer_id: gateway.customerId ?? checkout.gateway_customer_id,
    gateway_subscription_id: gateway.subscriptionId ?? checkout.gateway_subscription_id,
    gateway_payment_id: gateway.paymentId ?? checkout.gateway_payment_id,
    forma_pagamento: gateway.billingType === "PIX" ? "pix" : gateway.billingType === "CREDIT_CARD" ? "cartao" : checkout.forma_pagamento,
  }).eq("id", checkout.id);

  let barbershopId = checkout.barbearia_id as string | null;
  if (!barbershopId) {
    await markStep(supabase, checkout.id, "barbearia_criada", "executando");
    const { data, error } = await supabase.from("barbearias").insert({
      nome: checkout.nome_barbearia,
      slug: checkout.slug_desejado,
    }).select("id").single();
    if (error || !data) {
      await markStep(supabase, checkout.id, "barbearia_criada", "falhou", error);
      throw new Error(`PROVISIONAMENTO_BARBEARIA_FALHOU:${error?.message ?? "sem retorno"}`);
    }
    barbershopId = data.id;
    await supabase.from("saas_checkouts").update({ barbearia_id: barbershopId }).eq("id", checkout.id);
    await markStep(supabase, checkout.id, "barbearia_criada", "concluida");
  }

  let adminUserId = checkout.admin_user_id as string | null;
  let invitedNow = false;
  if (!adminUserId) {
    const { data: existingProfile } = await supabase.from("profiles")
      .select("id,barbearia_id").eq("email", checkout.email_admin).maybeSingle();
    if (existingProfile) throw new Error("PROVISIONAMENTO_EMAIL_JA_VINCULADO");

    await markStep(supabase, checkout.id, "admin_auth_criado", "executando");
    const appUrl = (process.env.GARAGEM_APP_URL ?? "https://app.garagemsystem.com.br").replace(/\/$/, "");
    const { data: invited, error } = await supabase.auth.admin.inviteUserByEmail(checkout.email_admin, {
      redirectTo: `${appUrl}/definir-senha`,
      data: { nome: checkout.nome_admin, role: "admin", barbearia_id: barbershopId },
    });
    if (error || !invited.user) {
      await markStep(supabase, checkout.id, "admin_auth_criado", "falhou", error);
      throw new Error(`PROVISIONAMENTO_CONVITE_FALHOU:${error?.message ?? "sem retorno"}`);
    }
    adminUserId = invited.user.id;
    invitedNow = true;
    await supabase.from("saas_checkouts").update({ admin_user_id: adminUserId }).eq("id", checkout.id);
    await markStep(supabase, checkout.id, "admin_auth_criado", "concluida");
  }

  await markStep(supabase, checkout.id, "profile_vinculado", "executando");
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: adminUserId,
    barbearia_id: barbershopId,
    role: "admin",
    nome: checkout.nome_admin,
    email: checkout.email_admin,
    telefone: checkout.telefone_admin,
    ativo: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (profileError) {
    if (invitedNow && adminUserId) await supabase.auth.admin.deleteUser(adminUserId);
    await markStep(supabase, checkout.id, "profile_vinculado", "falhou", profileError);
    throw new Error(`PROVISIONAMENTO_PROFILE_FALHOU:${profileError.message}`);
  }
  await markStep(supabase, checkout.id, "profile_vinculado", "concluida");

  await markStep(supabase, checkout.id, "assinatura_criada", "executando");
  const { data: existingSubscription } = await supabase.from("saas_assinaturas")
    .select("id").eq("checkout_id", checkout.id).maybeSingle();
  let subscriptionId = existingSubscription?.id as string | undefined;
  if (!subscriptionId) {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("saas_assinaturas").insert({
      produto_id: checkout.produto_id,
      barbearia_id: barbershopId,
      plano_id: checkout.plano_id,
      checkout_id: checkout.id,
      status: "ativo",
      ciclo: checkout.ciclo,
      preco_lista: checkout.preco_lista,
      desconto_percentual: checkout.desconto_percentual,
      preco_final: checkout.preco_final,
      membro_fundador: checkout.membro_fundador,
      desconto_expira_em: discountEnd(checkout.ciclo, Number(checkout.desconto_percentual)),
      periodo_inicio: now,
      periodo_fim: periodEnd(checkout.ciclo),
      gateway_provider: gateway.provider ?? checkout.gateway_provider ?? "asaas",
      gateway_ambiente: gateway.environment ?? checkout.gateway_ambiente,
      gateway_customer_id: gateway.customerId ?? checkout.gateway_customer_id,
      gateway_subscription_id: gateway.subscriptionId ?? checkout.gateway_subscription_id,
      gateway_external_reference: checkout.gateway_external_reference,
    }).select("id").single();
    if (error || !data) {
      await markStep(supabase, checkout.id, "assinatura_criada", "falhou", error);
      throw new Error(`PROVISIONAMENTO_ASSINATURA_FALHOU:${error?.message ?? "sem retorno"}`);
    }
    subscriptionId = data.id;
  }

  const { data: checkoutModules, error: modulesError } = await supabase.from("saas_checkout_modulos")
    .select("modulo_id,quantidade,preco_unitario_lista,preco_unitario_final")
    .eq("checkout_id", checkout.id);
  if (modulesError) throw new Error(`PROVISIONAMENTO_MODULOS_FALHOU:${modulesError.message}`);
  if (checkoutModules?.length) {
    const { error } = await supabase.from("saas_assinatura_modulos").upsert(checkoutModules.map((item) => ({
      produto_id: checkout.produto_id,
      assinatura_id: subscriptionId,
      modulo_id: item.modulo_id,
      status: "ativo",
      quantidade: item.quantidade,
      preco_lista: Number(item.preco_unitario_lista) * Number(item.quantidade),
      preco_final: Number(item.preco_unitario_final) * Number(item.quantidade),
      desconto_percentual: Number(item.preco_unitario_lista) > 0
        ? Number(((1 - Number(item.preco_unitario_final) / Number(item.preco_unitario_lista)) * 100).toFixed(2))
        : 0,
    })), { onConflict: "assinatura_id,modulo_id" });
    if (error) throw new Error(`PROVISIONAMENTO_MODULOS_FALHOU:${error.message}`);
  }

  const { error: entitlementError } = await supabase.rpc("saas_entitlements_sincronizar", { p_assinatura_id: subscriptionId });
  if (entitlementError) throw new Error(`PROVISIONAMENTO_ENTITLEMENTS_FALHOU:${entitlementError.message}`);
  await markStep(supabase, checkout.id, "assinatura_criada", "concluida");
  await markStep(supabase, checkout.id, "convite_enviado", "concluida");

  const { error: completedError } = await supabase.from("saas_checkouts").update({
    status: "concluido",
    completed_at: new Date().toISOString(),
    falha_codigo: null,
    falha_detalhe: null,
  }).eq("id", checkout.id);
  if (completedError) throw new Error(`PROVISIONAMENTO_FINALIZACAO_FALHOU:${completedError.message}`);
  return { ...checkout, status: "concluido", barbearia_id: barbershopId, admin_user_id: adminUserId };
}
