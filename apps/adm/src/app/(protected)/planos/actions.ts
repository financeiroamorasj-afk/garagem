"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type CatalogActionState = {
  status: "idle" | "success" | "warning" | "error";
  message: string;
};

const statuses = new Set(["rascunho", "ativo", "arquivado"]);

function uuid(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) {
    throw new Error("CATALOGO_ID_INVALIDO");
  }
  return parsed;
}

function text(value: FormDataEntryValue | null, field: string, min: number, max: number) {
  const parsed = String(value ?? "").trim();
  if (parsed.length < min || parsed.length > max) throw new Error(field);
  return parsed;
}

function optionalText(value: FormDataEntryValue | null, field: string, max: number) {
  const parsed = String(value ?? "").trim();
  if (parsed.length > max) throw new Error(field);
  return parsed || null;
}

function optionalCurrency(value: FormDataEntryValue | null, field: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replaceAll(".", "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999999999.99) throw new Error(field);
  return Number(parsed.toFixed(2));
}

function optionalPositiveInteger(value: FormDataEntryValue | null, field: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) throw new Error(field);
  return parsed;
}

function status(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "");
  if (!statuses.has(parsed)) throw new Error("CATALOGO_STATUS_INVALIDO");
  return parsed;
}

function errorState(error: unknown): CatalogActionState {
  const code = error instanceof Error ? error.message : "CATALOGO_FALHOU";
  const messages: Record<string, string> = {
    CATALOGO_ID_INVALIDO: "O registro selecionado é inválido.",
    CATALOGO_NOME_INVALIDO: "Informe um nome entre 2 e 80 caracteres.",
    CATALOGO_DESCRICAO_INVALIDA: "A descrição pode ter no máximo 500 caracteres.",
    CATALOGO_STATUS_INVALIDO: "Selecione um status válido.",
    CATALOGO_PRECO_MENSAL_INVALIDO: "Informe um preço mensal válido.",
    CATALOGO_PRECO_ANUAL_INVALIDO: "Informe um preço anual válido.",
    CATALOGO_LIMITE_INVALIDO: "Informe um limite entre 1 e 1.000 ou deixe o campo vazio.",
    CATALOGO_ATIVO_SEM_PRECO: "Para ativar, informe preços mensal e anual maiores que zero.",
    CATALOGO_NAO_ENCONTRADO: "O item não foi encontrado no catálogo do Garagem.",
  };
  return { status: "error", message: messages[code] ?? "Não foi possível salvar a alteração." };
}

async function auditCatalogChange(input: {
  productId: string;
  actorId: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const { error } = await createAdminSupabase().from("saas_auditoria").insert({
    produto_id: input.productId,
    ator_user_id: input.actorId,
    ator_role: input.actorRole,
    acao: input.action,
    entidade: input.entity,
    entidade_id: input.entityId,
    estado_anterior: input.before,
    estado_novo: input.after,
  });
  return error;
}

export async function updatePlan(
  _previousState: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const { user, operator } = await requirePlatformAdmin(["super_admin"]);
  try {
    const id = uuid(formData.get("id"));
    const nome = text(formData.get("nome"), "CATALOGO_NOME_INVALIDO", 2, 80);
    const descricao = optionalText(formData.get("descricao"), "CATALOGO_DESCRICAO_INVALIDA", 500);
    const nextStatus = status(formData.get("status"));
    const precoMensal = optionalCurrency(formData.get("preco_mensal"), "CATALOGO_PRECO_MENSAL_INVALIDO");
    const precoAnual = optionalCurrency(formData.get("preco_anual"), "CATALOGO_PRECO_ANUAL_INVALIDO");
    const limiteUsuarios = optionalPositiveInteger(formData.get("limite_usuarios"), "CATALOGO_LIMITE_INVALIDO");
    if (nextStatus === "ativo" && ((precoMensal ?? 0) <= 0 || (precoAnual ?? 0) <= 0)) throw new Error("CATALOGO_ATIVO_SEM_PRECO");

    const supabase = createAdminSupabase();
    const { data: before, error: findError } = await supabase.from("saas_planos")
      .select("id,produto_id,codigo,nome,descricao,status,preco_mensal,preco_anual,dias_trial,limite_usuarios")
      .eq("id", id).single();
    if (findError || !before) throw new Error("CATALOGO_NAO_ENCONTRADO");

    const next = {
      nome,
      descricao,
      status: nextStatus,
      preco_mensal: precoMensal,
      preco_anual: precoAnual,
      limite_usuarios: limiteUsuarios,
    };
    const { data: after, error: updateError } = await supabase.from("saas_planos")
      .update(next).eq("id", id).eq("produto_id", before.produto_id)
      .select("id,produto_id,codigo,nome,descricao,status,preco_mensal,preco_anual,dias_trial,limite_usuarios").single();
    if (updateError || !after) throw new Error("CATALOGO_FALHOU");

    const auditError = await auditCatalogChange({
      productId: before.produto_id,
      actorId: user.id,
      actorRole: operator.role,
      action: "plano.atualizado",
      entity: "saas_planos",
      entityId: id,
      before,
      after,
    });
    revalidatePath("/planos");
    revalidatePath("/");
    return auditError
      ? { status: "warning", message: "Plano salvo, mas a auditoria não foi registrada. Verifique antes de fazer outra alteração." }
      : { status: "success", message: `Plano ${after.nome} salvo e publicado no catálogo.` };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateModule(
  _previousState: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const { user, operator } = await requirePlatformAdmin(["super_admin"]);
  try {
    const id = uuid(formData.get("id"));
    const nome = text(formData.get("nome"), "CATALOGO_NOME_INVALIDO", 2, 80);
    const descricao = optionalText(formData.get("descricao"), "CATALOGO_DESCRICAO_INVALIDA", 500);
    const nextStatus = status(formData.get("status"));
    const precoMensal = optionalCurrency(formData.get("preco_mensal"), "CATALOGO_PRECO_MENSAL_INVALIDO");
    const precoAnual = optionalCurrency(formData.get("preco_anual"), "CATALOGO_PRECO_ANUAL_INVALIDO");
    if (nextStatus === "ativo" && ((precoMensal ?? 0) <= 0 || (precoAnual ?? 0) <= 0)) throw new Error("CATALOGO_ATIVO_SEM_PRECO");

    const supabase = createAdminSupabase();
    const { data: before, error: findError } = await supabase.from("saas_modulos")
      .select("id,produto_id,codigo,nome,descricao,entitlement_codigo,status,preco_mensal,preco_anual,configuracao")
      .eq("id", id).single();
    if (findError || !before) throw new Error("CATALOGO_NAO_ENCONTRADO");

    const next = {
      nome,
      descricao,
      status: nextStatus,
      preco_mensal: precoMensal,
      preco_anual: precoAnual,
    };
    const { data: after, error: updateError } = await supabase.from("saas_modulos")
      .update(next).eq("id", id).eq("produto_id", before.produto_id)
      .select("id,produto_id,codigo,nome,descricao,entitlement_codigo,status,preco_mensal,preco_anual,configuracao").single();
    if (updateError || !after) throw new Error("CATALOGO_FALHOU");

    const auditError = await auditCatalogChange({
      productId: before.produto_id,
      actorId: user.id,
      actorRole: operator.role,
      action: "modulo.atualizado",
      entity: "saas_modulos",
      entityId: id,
      before,
      after,
    });
    revalidatePath("/planos");
    revalidatePath("/configuracoes");
    return auditError
      ? { status: "warning", message: "Módulo salvo, mas a auditoria não foi registrada. Verifique antes de fazer outra alteração." }
      : { status: "success", message: `Módulo ${after.nome} salvo e publicado no catálogo.` };
  } catch (error) {
    return errorState(error);
  }
}
