import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { AsaasApiError, createAsaasCheckout, getAsaasEnvironment } from "@/lib/asaas";
import {
  checkoutCallbackUrls,
  checkoutCorsOrigin,
  createCheckoutTokenHash,
  makeDesiredSlug,
  normalizeEmail,
  normalizeModules,
  normalizeName,
  normalizePhone,
} from "@/lib/checkout";
import { createAdminSupabase } from "@/lib/supabase/admin";

type PricedModule = {
  id: string;
  codigo: string;
  nome: string;
  preco_mensal: number | null;
  preco_anual: number | null;
};

function withCors(response: NextResponse, origin: string | null) {
  if (origin) response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Vary", "Origin");
  return response;
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return withCors(NextResponse.json(body, { status }), checkoutCorsOrigin(request));
}

function numberPrice(value: unknown, code: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

export async function OPTIONS(request: Request) {
  const origin = checkoutCorsOrigin(request);
  if (!origin) return new NextResponse(null, { status: 403 });
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
  response.headers.set("Access-Control-Max-Age", "86400");
  return withCors(response, origin);
}

export async function POST(request: Request) {
  const origin = checkoutCorsOrigin(request);
  if (!origin) return json(request, { code: "CHECKOUT_ORIGEM_NAO_AUTORIZADA" }, 403);

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return json(request, { code: "CHECKOUT_IDEMPOTENCIA_INVALIDA" }, 400);
  }

  let checkoutId: string | null = null;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (String(body.website ?? "").trim()) return json(request, { code: "CHECKOUT_DADOS_INVALIDOS" }, 400);

    const nomeBarbearia = normalizeName(body.nome_barbearia, "CHECKOUT_BARBEARIA");
    const nomeAdmin = normalizeName(body.nome_admin, "CHECKOUT_ADMIN");
    const emailAdmin = normalizeEmail(body.email_admin);
    const telefoneAdmin = normalizePhone(body.telefone_admin);
    const planoCodigo = String(body.plano_codigo ?? "").trim().toLowerCase();
    const ciclo = String(body.ciclo ?? "").trim().toLowerCase();
    const requestedModules = normalizeModules(body.modulos);
    if (!['base', 'gestao'].includes(planoCodigo)) throw new Error("CHECKOUT_PLANO_INVALIDO");
    if (!['mensal', 'anual'].includes(ciclo)) throw new Error("CHECKOUT_CICLO_INVALIDO");

    const supabase = createAdminSupabase();
    const { data: existing } = await supabase.from("saas_checkouts")
      .select("id,status,link_pagamento,gateway_external_reference")
      .eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) {
      if (existing.link_pagamento) {
        return json(request, {
          success: true,
          checkoutUrl: existing.link_pagamento,
          externalReference: existing.gateway_external_reference,
          reused: true,
        });
      }
      return json(request, { code: "CHECKOUT_EM_PROCESSAMENTO" }, 409);
    }

    const { data: product, error: productError } = await supabase.from("plataforma_produtos")
      .select("id").eq("codigo", "garagem").eq("ativo", true).single();
    if (productError || !product) throw new Error("CHECKOUT_PRODUTO_INDISPONIVEL");

    const { data: plan, error: planError } = await supabase.from("saas_planos")
      .select("id,codigo,nome,preco_mensal,preco_anual")
      .eq("produto_id", product.id).eq("codigo", planoCodigo).eq("status", "ativo").single();
    if (planError || !plan) throw new Error("CHECKOUT_PLANO_INVALIDO");

    const moduleCodes = requestedModules.map((item) => item.codigo);
    let modules: PricedModule[] = [];
    if (moduleCodes.length) {
      const { data, error } = await supabase.from("saas_modulos")
        .select("id,codigo,nome,preco_mensal,preco_anual")
        .eq("produto_id", product.id).eq("status", "ativo").in("codigo", moduleCodes);
      if (error) throw new Error("CHECKOUT_MODULOS_INDISPONIVEIS");
      modules = (data ?? []) as PricedModule[];
      if (modules.length !== moduleCodes.length) throw new Error("CHECKOUT_MODULOS_INDISPONIVEIS");
    }

    const nowIso = new Date().toISOString();
    const { data: offer } = await supabase.from("saas_ofertas")
      .select("id,desconto_percentual,membro_fundador")
      .eq("produto_id", product.id).eq("codigo", "LANCAMENTO20").eq("ativo", true)
      .or(`inicia_em.is.null,inicia_em.lte.${nowIso}`)
      .or(`termina_em.is.null,termina_em.gte.${nowIso}`).maybeSingle();

    const planMonthly = numberPrice(plan.preco_mensal, "CHECKOUT_PRECO_INDISPONIVEL");
    const planAnnual = numberPrice(plan.preco_anual, "CHECKOUT_PRECO_INDISPONIVEL");
    const annualList = planMonthly * 12;
    let listPrice = ciclo === "anual" ? annualList : planMonthly;
    let finalPrice = ciclo === "anual" ? planAnnual : planMonthly;
    const asaasItems = [{
      externalReference: `plano_${plan.codigo}`,
      name: `Garagem System — Plano ${plan.nome}`,
      description: ciclo === "anual" ? "Assinatura anual" : "Assinatura mensal",
      quantity: 1,
      value: finalPrice,
    }];

    const moduleSnapshots = requestedModules.map((requested) => {
      const pricedModule = modules.find((item) => item.codigo === requested.codigo)!;
      const monthly = numberPrice(pricedModule.preco_mensal, "CHECKOUT_PRECO_MODULO_INDISPONIVEL");
      const annual = numberPrice(pricedModule.preco_anual, "CHECKOUT_PRECO_MODULO_INDISPONIVEL");
      const unitList = ciclo === "anual" ? monthly * 12 : monthly;
      const unitFinal = ciclo === "anual" ? annual : monthly;
      listPrice += unitList * requested.quantidade;
      finalPrice += unitFinal * requested.quantidade;
      asaasItems.push({
        externalReference: `modulo_${pricedModule.codigo}`,
        name: pricedModule.nome,
        description: "Módulo adicional do Garagem System",
        quantity: requested.quantidade,
        value: unitFinal,
      });
      return { pricedModule, requested, unitList, unitFinal };
    });

    let discountPercent = ciclo === "anual" && listPrice > 0
      ? Number((((listPrice - finalPrice) / listPrice) * 100).toFixed(2))
      : 0;
    if (ciclo === "mensal" && offer) {
      discountPercent = Number(offer.desconto_percentual);
      const multiplier = 1 - discountPercent / 100;
      finalPrice = Number((listPrice * multiplier).toFixed(2));
      for (const item of asaasItems) item.value = Number((item.value * multiplier).toFixed(2));
    }

    listPrice = Number(listPrice.toFixed(2));
    finalPrice = Number(finalPrice.toFixed(2));
    const externalReference = `garagem_${randomUUID()}`;
    const slug = makeDesiredSlug(nomeBarbearia);
    const environment = getAsaasEnvironment();

    const { data: created, error: createError } = await supabase.from("saas_checkouts").insert({
      produto_id: product.id,
      plano_id: plan.id,
      oferta_id: offer?.id ?? null,
      status: "iniciado",
      nome_barbearia: nomeBarbearia,
      slug_desejado: slug,
      nome_admin: nomeAdmin,
      email_admin: emailAdmin,
      telefone_admin: telefoneAdmin,
      forma_pagamento: "pix_ou_cartao",
      ciclo,
      preco_lista: listPrice,
      desconto_percentual: discountPercent,
      preco_final: finalPrice,
      membro_fundador: Boolean(offer?.membro_fundador),
      idempotency_key: idempotencyKey,
      checkout_token_hash: createCheckoutTokenHash(),
      gateway_provider: "asaas",
      gateway_ambiente: environment,
      gateway_external_reference: externalReference,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).select("id").single();
    if (createError || !created) throw new Error("CHECKOUT_REGISTRO_FALHOU");
    checkoutId = created.id;

    if (moduleSnapshots.length) {
      const { error } = await supabase.from("saas_checkout_modulos").insert(moduleSnapshots.map(({ pricedModule, requested, unitList, unitFinal }) => ({
        checkout_id: created.id,
        produto_id: product.id,
        modulo_id: pricedModule.id,
        quantidade: requested.quantidade,
        preco_unitario_lista: Number(unitList.toFixed(2)),
        preco_unitario_final: Number((ciclo === "mensal" && offer ? unitFinal * (1 - discountPercent / 100) : unitFinal).toFixed(2)),
      })));
      if (error) throw new Error("CHECKOUT_MODULOS_REGISTRO_FALHOU");
    }

    const asaasCheckout = await createAsaasCheckout({
      externalReference,
      cycle: ciclo === "anual" ? "YEARLY" : "MONTHLY",
      items: asaasItems,
      callback: checkoutCallbackUrls(),
    });
    if (!asaasCheckout.id || !asaasCheckout.link) throw new Error("CHECKOUT_ASAAS_RESPOSTA_INVALIDA");

    const { error: updateError } = await supabase.from("saas_checkouts").update({
      status: "aguardando_pagamento",
      gateway_checkout_id: asaasCheckout.id,
      link_pagamento: asaasCheckout.link,
    }).eq("id", created.id);
    if (updateError) throw new Error("CHECKOUT_ATUALIZACAO_FALHOU");

    return json(request, {
      success: true,
      checkoutUrl: asaasCheckout.link,
      externalReference,
    }, 201);
  } catch (error) {
    const supabase = createAdminSupabase();
    const code = error instanceof AsaasApiError ? error.code : error instanceof Error ? error.message : "CHECKOUT_FALHOU";
    if (checkoutId) {
      await supabase.from("saas_checkouts").update({
        status: "falhou",
        falha_codigo: code.slice(0, 120),
        falha_detalhe: error instanceof Error ? error.message.slice(0, 500) : null,
      }).eq("id", checkoutId);
    }
    const publicErrors = new Set([
      "CHECKOUT_EMAIL_INVALIDO", "CHECKOUT_TELEFONE_INVALIDO", "CHECKOUT_BARBEARIA_INVALIDO",
      "CHECKOUT_ADMIN_INVALIDO", "CHECKOUT_PLANO_INVALIDO", "CHECKOUT_CICLO_INVALIDO",
      "CHECKOUT_MODULOS_INVALIDOS", "CHECKOUT_QUANTIDADE_INVALIDA", "CHECKOUT_MODULOS_INDISPONIVEIS",
    ]);
    const status = publicErrors.has(code) ? 400 : error instanceof AsaasApiError && error.status < 500 ? 422 : 500;
    return json(request, {
      code: publicErrors.has(code) ? code : "CHECKOUT_NAO_CONCLUIDO",
      message: status < 500 && error instanceof Error ? error.message : "Não foi possível iniciar a assinatura agora.",
    }, status);
  }
}
