import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getAsaasEnvironment, listAsaasPaymentsByCheckout, listAsaasPaymentsBySubscription, updateAsaasSubscriptionValue } from "@/lib/asaas";
import { sha256 } from "@/lib/checkout";
import { provisionPaidCheckout } from "@/lib/provisioning";
import { createAdminSupabase } from "@/lib/supabase/admin";

type AsaasPayload = {
  id?: string;
  event?: string;
  dateCreated?: string;
  account?: { id?: string; ownerId?: string | null };
  checkout?: {
    id?: string;
    link?: string | null;
    status?: string;
    externalReference?: string;
    customer?: string;
    subscription?: { id?: string } | string | null;
  };
  payment?: {
    id?: string;
    status?: string;
    customer?: string;
    subscription?: string;
    checkoutSession?: string;
    billingType?: string;
    externalReference?: string;
    value?: number;
    dueDate?: string;
    paymentDate?: string;
  };
  subscription?: {
    id?: string;
    status?: string;
    customer?: string;
    externalReference?: string;
    value?: number;
    cycle?: string;
    nextDueDate?: string;
  };
};

function secureTokenMatch(received: string | null, expected: string) {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sanitize(payload: AsaasPayload) {
  return {
    id: payload.id ?? null,
    event: payload.event ?? null,
    dateCreated: payload.dateCreated ?? null,
    account: payload.account ? { id: payload.account.id ?? null, ownerId: payload.account.ownerId ?? null } : null,
    checkout: payload.checkout ? {
      id: payload.checkout.id ?? null,
      status: payload.checkout.status ?? null,
      externalReference: payload.checkout.externalReference ?? null,
      customer: payload.checkout.customer ?? null,
    } : null,
    payment: payload.payment ? {
      id: payload.payment.id ?? null,
      status: payload.payment.status ?? null,
      customer: payload.payment.customer ?? null,
      subscription: payload.payment.subscription ?? null,
      checkoutSession: payload.payment.checkoutSession ?? null,
      billingType: payload.payment.billingType ?? null,
      externalReference: payload.payment.externalReference ?? null,
      value: payload.payment.value ?? null,
      dueDate: payload.payment.dueDate ?? null,
      paymentDate: payload.payment.paymentDate ?? null,
    } : null,
    subscription: payload.subscription ? {
      id: payload.subscription.id ?? null,
      status: payload.subscription.status ?? null,
      customer: payload.subscription.customer ?? null,
      externalReference: payload.subscription.externalReference ?? null,
      value: payload.subscription.value ?? null,
      cycle: payload.subscription.cycle ?? null,
      nextDueDate: payload.subscription.nextDueDate ?? null,
    } : null,
  };
}

function gatewayResourceId(payload: AsaasPayload) {
  return payload.checkout?.id ?? payload.payment?.id ?? payload.subscription?.id ?? null;
}

async function findCheckout(supabase: ReturnType<typeof createAdminSupabase>, payload: AsaasPayload) {
  const checkoutSession = payload.checkout?.id ?? payload.payment?.checkoutSession;
  if (checkoutSession) {
    const { data } = await supabase.from("saas_checkouts").select("*")
      .eq("gateway_checkout_id", checkoutSession).maybeSingle();
    if (data) return data;
  }

  const externalReference = payload.checkout?.externalReference
    ?? payload.payment?.externalReference
    ?? payload.subscription?.externalReference;
  if (externalReference?.startsWith("garagem_")) {
    const { data } = await supabase.from("saas_checkouts").select("*")
      .eq("gateway_external_reference", externalReference).maybeSingle();
    if (data) return data;
  }

  const subscriptionId = payload.payment?.subscription ?? payload.subscription?.id;
  if (subscriptionId) {
    const { data: subscription } = await supabase.from("saas_assinaturas")
      .select("checkout_id").eq("gateway_subscription_id", subscriptionId).maybeSingle();
    if (subscription?.checkout_id) {
      const { data } = await supabase.from("saas_checkouts").select("*")
        .eq("id", subscription.checkout_id).maybeSingle();
      if (data) return data;
    }
  }
  return null;
}

async function updateSubscriptionState(
  supabase: ReturnType<typeof createAdminSupabase>,
  payload: AsaasPayload,
) {
  const gatewaySubscriptionId = payload.payment?.subscription ?? payload.subscription?.id;
  if (!gatewaySubscriptionId) return;
  const { data: subscription } = await supabase.from("saas_assinaturas")
    .select("id,status,version,preco_lista,preco_final,desconto_percentual,desconto_expira_em")
    .eq("gateway_subscription_id", gatewaySubscriptionId).maybeSingle();
  if (!subscription) return;

  const activeEvents = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
  const overdueEvents = new Set(["PAYMENT_OVERDUE", "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED"]);
  const suspendEvents = new Set(["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"]);
  let nextStatus: string | null = null;
  if (activeEvents.has(payload.event ?? "") && ["inadimplente", "suspenso"].includes(subscription.status)) nextStatus = "ativo";
  if (overdueEvents.has(payload.event ?? "") && subscription.status === "ativo") nextStatus = "inadimplente";
  if (suspendEvents.has(payload.event ?? "") && ["ativo", "inadimplente"].includes(subscription.status)) nextStatus = "suspenso";
  if (nextStatus) {
    await supabase.rpc("saas_assinatura_mudar_status", {
      p_assinatura_id: subscription.id,
      p_novo_status: nextStatus,
      p_motivo: `Evento Asaas ${payload.event}`,
      p_origem: "webhook_asaas",
      p_correlation_id: payload.id ?? null,
      p_expected_version: subscription.version,
    });
  }

  if (activeEvents.has(payload.event ?? "") && subscription.desconto_percentual > 0) {
    const payments = await listAsaasPaymentsBySubscription(gatewaySubscriptionId);
    const paidCount = payments.data.filter((payment) => ["CONFIRMED", "RECEIVED"].includes(payment.status ?? "")).length;
    if (paidCount >= 6) {
      await updateAsaasSubscriptionValue(gatewaySubscriptionId, Number(subscription.preco_lista));
      await supabase.from("saas_assinaturas").update({
        desconto_percentual: 0,
        preco_final: subscription.preco_lista,
        desconto_expira_em: new Date().toISOString().slice(0, 10),
      }).eq("id", subscription.id);
    }
  }
}

async function processEvent(
  supabase: ReturnType<typeof createAdminSupabase>,
  eventRowId: string,
  checkout: Record<string, unknown> | null,
  payload: AsaasPayload,
) {
  try {
    if (!checkout) {
      await supabase.from("saas_gateway_eventos").update({
        status: "ignorado", processado_em: new Date().toISOString(),
      }).eq("id", eventRowId);
      return;
    }

    await supabase.from("saas_gateway_eventos").update({
      status: "processando", checkout_id: checkout.id,
    }).eq("id", eventRowId);

    const checkoutStatuses: Record<string, string> = {
      CHECKOUT_CANCELED: "cancelado",
      CHECKOUT_EXPIRED: "expirado",
      CHECKOUT_PAID: "pago",
    };
    const status = checkoutStatuses[payload.event ?? ""];
    if (status) await supabase.from("saas_checkouts").update({ status }).eq("id", checkout.id);

    let payment = payload.payment;
    const gatewayCheckoutId = payload.checkout?.id ?? payload.payment?.checkoutSession ?? checkout.gateway_checkout_id;
    if ((payload.event === "CHECKOUT_PAID" || !payment?.subscription) && gatewayCheckoutId) {
      const payments = await listAsaasPaymentsByCheckout(String(gatewayCheckoutId));
      payment = payments.data.find((item) => ["CONFIRMED", "RECEIVED"].includes(item.status ?? "")) ?? payments.data[0] ?? payment;
    }

    const shouldProvision = payload.event === "CHECKOUT_PAID"
      || payload.event === "PAYMENT_CONFIRMED"
      || payload.event === "PAYMENT_RECEIVED";
    if (shouldProvision) {
      await supabase.from("saas_checkouts").update({
        status: "pago",
        gateway_customer_id: payment?.customer ?? payload.checkout?.customer ?? checkout.gateway_customer_id,
        gateway_subscription_id: payment?.subscription ?? checkout.gateway_subscription_id,
        gateway_payment_id: payment?.id ?? checkout.gateway_payment_id,
      }).eq("id", checkout.id);
      await provisionPaidCheckout(supabase, String(checkout.id), {
        customerId: payment?.customer ?? payload.checkout?.customer,
        subscriptionId: payment?.subscription,
        paymentId: payment?.id,
        billingType: payment?.billingType,
      });
    }

    await updateSubscriptionState(supabase, { ...payload, payment });
    const { data: localSubscription } = await supabase.from("saas_assinaturas")
      .select("id").eq("checkout_id", checkout.id).maybeSingle();
    await supabase.from("saas_gateway_eventos").update({
      status: "processado",
      checkout_id: checkout.id,
      assinatura_id: localSubscription?.id ?? null,
      processado_em: new Date().toISOString(),
      erro_codigo: null,
      erro_detalhe: null,
    }).eq("id", eventRowId);
  } catch (error) {
    await supabase.from("saas_gateway_eventos").update({
      status: "falhou",
      erro_codigo: "PROCESSAMENTO_FALHOU",
      erro_detalhe: error instanceof Error ? error.message.slice(0, 500) : "Erro desconhecido",
      processado_em: new Date().toISOString(),
    }).eq("id", eventRowId);
  }
}

export async function POST(request: Request) {
  const secret = process.env.ASAAS_WEBHOOK_SECRET;
  if (!secret || !secureTokenMatch(request.headers.get("asaas-access-token"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  let payload: AsaasPayload;
  try {
    payload = JSON.parse(rawBody) as AsaasPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (payload.event === "WEBHOOK_VALIDATION") return NextResponse.json({ received: true });
  if (!payload.id || !payload.event) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  const supabase = createAdminSupabase();
  const { data: product } = await supabase.from("plataforma_produtos")
    .select("id").eq("codigo", "garagem").single();
  if (!product) return NextResponse.json({ error: "Product unavailable" }, { status: 503 });

  const checkout = await findCheckout(supabase, payload);
  const sanitized = sanitize(payload);
  const { data: eventRow, error } = await supabase.from("saas_gateway_eventos").insert({
    produto_id: product.id,
    provider: "asaas",
    ambiente: getAsaasEnvironment(),
    event_id: payload.id,
    event_type: payload.event,
    resource_id: gatewayResourceId(payload),
    checkout_id: checkout?.id ?? null,
    status: checkout ? "recebido" : "ignorado",
    payload_sanitizado: sanitized,
    payload_sha256: sha256(rawBody),
  }).select("id").single();

  if (error?.code === "23505") {
    const { data: previous } = await supabase.from("saas_gateway_eventos")
      .select("id,status,checkout_id")
      .eq("provider", "asaas")
      .eq("ambiente", getAsaasEnvironment())
      .eq("event_id", payload.id)
      .maybeSingle();
    if (previous?.status === "falhou") {
      after(() => processEvent(supabase, previous.id, checkout, payload));
    }
    return NextResponse.json({ received: true, duplicate: true, retryScheduled: previous?.status === "falhou" });
  }
  if (error || !eventRow) return NextResponse.json({ error: "Event persistence failed" }, { status: 503 });

  after(() => processEvent(supabase, eventRow.id, checkout, payload));
  return NextResponse.json({ received: true });
}
