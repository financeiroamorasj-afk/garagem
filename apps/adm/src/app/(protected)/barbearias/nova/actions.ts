"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  createCheckoutTokenHash,
  makeDesiredSlug,
  normalizeEmail,
  normalizeModules,
  normalizeName,
  normalizePhone,
} from "@/lib/checkout";
import { provisionPaidCheckout } from "@/lib/provisioning";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type ManualTenantState = {
  ok: boolean;
  message: string;
  barbershopId?: string;
};

export const initialManualTenantState: ManualTenantState = { ok: false, message: "" };

function price(value: unknown, code: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

export async function createManualTenant(
  _previousState: ManualTenantState,
  formData: FormData,
): Promise<ManualTenantState> {
  await requirePlatformAdmin(["super_admin"]);

  let checkoutId: string | null = null;
  try {
    const nomeBarbearia = normalizeName(formData.get("nome_barbearia"), "IMPLANTACAO_BARBEARIA");
    const nomeAdmin = normalizeName(formData.get("nome_admin"), "IMPLANTACAO_ADMIN");
    const emailAdmin = normalizeEmail(formData.get("email_admin"));
    const telefoneAdmin = normalizePhone(formData.get("telefone_admin"));
    const planId = String(formData.get("plano_id") ?? "");
    const cycle = String(formData.get("ciclo") ?? "") as "mensal" | "anual";
    if (!/^[0-9a-f-]{36}$/i.test(planId)) throw new Error("IMPLANTACAO_PLANO_INVALIDO");
    if (!(["mensal", "anual"] as const).includes(cycle)) throw new Error("IMPLANTACAO_CICLO_INVALIDO");

    const selectedModules = formData.getAll("modulos").map((item) => ({
      codigo: String(item),
      quantidade: String(item) === "profissional_adicional"
        ? Number(formData.get("profissionais_adicionais") ?? 1)
        : 1,
    }));
    const requestedModules = normalizeModules(selectedModules);
    const supabase = createAdminSupabase();

    const { data: existingProfile } = await supabase.from("profiles")
      .select("id").eq("email", emailAdmin).maybeSingle();
    if (existingProfile) throw new Error("IMPLANTACAO_EMAIL_EM_USO");

    const { data: product, error: productError } = await supabase.from("plataforma_produtos")
      .select("id").eq("codigo", "garagem").eq("ativo", true).single();
    if (productError || !product) throw new Error("IMPLANTACAO_PRODUTO_INDISPONIVEL");

    const { data: plan, error: planError } = await supabase.from("saas_planos")
      .select("id,codigo,nome,preco_mensal,preco_anual")
      .eq("id", planId).eq("produto_id", product.id).eq("status", "ativo").single();
    if (planError || !plan) throw new Error("IMPLANTACAO_PLANO_INVALIDO");

    const moduleCodes = requestedModules.map((item) => item.codigo);
    const { data: moduleRows, error: modulesError } = moduleCodes.length
      ? await supabase.from("saas_modulos")
        .select("id,codigo,nome,preco_mensal,preco_anual")
        .eq("produto_id", product.id).eq("status", "ativo").in("codigo", moduleCodes)
      : { data: [], error: null };
    if (modulesError || (moduleRows ?? []).length !== moduleCodes.length) {
      throw new Error("IMPLANTACAO_MODULOS_INVALIDOS");
    }

    const nowIso = new Date().toISOString();
    const { data: offer } = await supabase.from("saas_ofertas")
      .select("id,desconto_percentual,membro_fundador")
      .eq("produto_id", product.id).eq("codigo", "LANCAMENTO20").eq("ativo", true)
      .or(`inicia_em.is.null,inicia_em.lte.${nowIso}`)
      .or(`termina_em.is.null,termina_em.gte.${nowIso}`).maybeSingle();

    const planMonthly = price(plan.preco_mensal, "IMPLANTACAO_PRECO_INDISPONIVEL");
    const planAnnual = price(plan.preco_anual, "IMPLANTACAO_PRECO_INDISPONIVEL");
    let listPrice = cycle === "anual" ? planMonthly * 12 : planMonthly;
    let finalPrice = cycle === "anual" ? planAnnual : planMonthly;
    const snapshots = requestedModules.map((requested) => {
      const catalogModule = (moduleRows ?? []).find((item) => item.codigo === requested.codigo)!;
      const monthly = price(catalogModule.preco_mensal, "IMPLANTACAO_PRECO_INDISPONIVEL");
      const annual = price(catalogModule.preco_anual, "IMPLANTACAO_PRECO_INDISPONIVEL");
      const unitList = cycle === "anual" ? monthly * 12 : monthly;
      const unitFinal = cycle === "anual" ? annual : monthly;
      listPrice += unitList * requested.quantidade;
      finalPrice += unitFinal * requested.quantidade;
      return { catalogModule, requested, unitList, unitFinal };
    });

    let discountPercent = cycle === "anual" && listPrice > 0
      ? Number((((listPrice - finalPrice) / listPrice) * 100).toFixed(2))
      : 0;
    if (cycle === "mensal" && offer) {
      discountPercent = Number(offer.desconto_percentual);
      finalPrice = listPrice * (1 - discountPercent / 100);
    }
    listPrice = Number(listPrice.toFixed(2));
    finalPrice = Number(finalPrice.toFixed(2));

    const externalReference = `garagem_manual_${randomUUID()}`;
    const { data: checkout, error: checkoutError } = await supabase.from("saas_checkouts").insert({
      produto_id: product.id,
      plano_id: plan.id,
      oferta_id: offer?.id ?? null,
      status: "pago",
      nome_barbearia: nomeBarbearia,
      slug_desejado: makeDesiredSlug(nomeBarbearia),
      nome_admin: nomeAdmin,
      email_admin: emailAdmin,
      telefone_admin: telefoneAdmin,
      forma_pagamento: "manual",
      ciclo: cycle,
      preco_lista: listPrice,
      desconto_percentual: discountPercent,
      preco_final: finalPrice,
      membro_fundador: Boolean(offer?.membro_fundador),
      idempotency_key: randomUUID(),
      checkout_token_hash: createCheckoutTokenHash(),
      gateway_provider: "manual",
      gateway_ambiente: null,
      gateway_external_reference: externalReference,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).select("id").single();
    if (checkoutError || !checkout) throw new Error(`IMPLANTACAO_REGISTRO_FALHOU:${checkoutError?.message ?? "sem retorno"}`);
    checkoutId = checkout.id;

    if (snapshots.length) {
      const multiplier = cycle === "mensal" && offer ? 1 - discountPercent / 100 : 1;
      const { error } = await supabase.from("saas_checkout_modulos").insert(snapshots.map(({ catalogModule, requested, unitList, unitFinal }) => ({
        checkout_id: checkout.id,
        produto_id: product.id,
        modulo_id: catalogModule.id,
        quantidade: requested.quantidade,
        preco_unitario_lista: Number(unitList.toFixed(2)),
        preco_unitario_final: Number((unitFinal * multiplier).toFixed(2)),
      })));
      if (error) throw new Error(`IMPLANTACAO_MODULOS_FALHOU:${error.message}`);
    }

    const provisioned = await provisionPaidCheckout(supabase, checkout.id, {
      provider: "manual",
      environment: null,
      billingType: "MANUAL",
    });
    revalidatePath("/barbearias");
    revalidatePath("/assinaturas");
    revalidatePath("/");
    return {
      ok: true,
      message: `Barbearia criada e convite enviado para ${emailAdmin}. A cobrança permanece sob controle manual.`,
      barbershopId: String(provisioned.barbearia_id),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "IMPLANTACAO_FALHOU";
    if (checkoutId) {
      await createAdminSupabase().from("saas_checkouts").update({
        status: "falhou",
        falha_codigo: detail.split(":")[0].slice(0, 120),
        falha_detalhe: detail.slice(0, 500),
      }).eq("id", checkoutId);
    }
    const messages: Record<string, string> = {
      CHECKOUT_EMAIL_INVALIDO: "Informe um e-mail válido.",
      CHECKOUT_TELEFONE_INVALIDO: "Informe um telefone com DDD.",
      IMPLANTACAO_BARBEARIA_INVALIDO: "Informe o nome da barbearia.",
      IMPLANTACAO_ADMIN_INVALIDO: "Informe o nome do responsável.",
      IMPLANTACAO_EMAIL_EM_USO: "Este e-mail já está vinculado a um usuário do Garagem.",
      IMPLANTACAO_PLANO_INVALIDO: "Selecione um plano ativo.",
      IMPLANTACAO_CICLO_INVALIDO: "Selecione o ciclo mensal ou anual.",
      CHECKOUT_MODULOS_INVALIDOS: "Revise os módulos selecionados.",
      CHECKOUT_QUANTIDADE_INVALIDA: "A quantidade de profissionais adicionais é inválida.",
    };
    const code = detail.split(":")[0];
    return { ok: false, message: messages[code] ?? "Não foi possível concluir a implantação. Consulte o checkout com falha no ADM." };
  }
}
