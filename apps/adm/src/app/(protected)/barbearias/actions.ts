"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type GenerateInviteLinkState = {
  status: "idle" | "success" | "warning" | "error";
  message: string;
  actionLink?: string;
  expiresAt?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function returnToBarbershops(result: string): never {
  redirect(`/barbearias?convite=${encodeURIComponent(result)}`);
}

export async function resendBarbershopAdminInvite(formData: FormData) {
  const { user: operatorUser, operator } = await requirePlatformAdmin(["super_admin"]);
  const barbershopId = String(formData.get("barbearia_id") ?? "");
  const adminUserId = String(formData.get("user_id") ?? "");
  if (!isUuid(barbershopId) || !isUuid(adminUserId)) returnToBarbershops("dados_invalidos");

  const supabase = createAdminSupabase();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,barbearia_id,nome,email,ativo")
    .eq("id", adminUserId)
    .eq("barbearia_id", barbershopId)
    .eq("role", "admin")
    .maybeSingle();
  if (profileError || !profile?.email) returnToBarbershops("nao_encontrado");
  if (profile.ativo === false) returnToBarbershops("acesso_inativo");

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(adminUserId);
  if (authError || !authData.user) returnToBarbershops("nao_encontrado");
  const acceptedAt = authData.user.email_confirmed_at ?? authData.user.confirmed_at ?? null;
  if (acceptedAt || authData.user.last_sign_in_at) returnToBarbershops("acesso_confirmado");

  const appUrl = (process.env.GARAGEM_APP_URL ?? "https://app.garagemsystem.com.br").replace(/\/$/, "");
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(profile.email, {
    redirectTo: `${appUrl}/definir-senha`,
    data: { nome: profile.nome, role: "admin", barbearia_id: barbershopId },
  });
  if (inviteError || !invited.user || invited.user.id !== adminUserId) returnToBarbershops("falhou");

  const { data: product } = await supabase
    .from("plataforma_produtos")
    .select("id")
    .eq("codigo", "garagem")
    .maybeSingle();
  const { error: auditError } = await supabase.from("saas_auditoria").insert({
    produto_id: product?.id ?? null,
    ator_user_id: operatorUser.id,
    ator_role: operator.role,
    acao: "convite_admin_reenviado",
    entidade: "profiles",
    entidade_id: adminUserId,
    estado_anterior: {
      barbearia_id: barbershopId,
      invited_at: authData.user.invited_at ?? null,
      confirmed_at: acceptedAt,
      last_sign_in_at: authData.user.last_sign_in_at ?? null,
    },
    estado_novo: {
      barbearia_id: barbershopId,
      invite_sent_at: new Date().toISOString(),
    },
  });

  revalidatePath("/barbearias");
  returnToBarbershops(auditError ? "reenviado_sem_auditoria" : "reenviado");
}

export async function generateBarbershopAdminInviteLink(
  _previousState: GenerateInviteLinkState,
  formData: FormData,
): Promise<GenerateInviteLinkState> {
  const { user: operatorUser, operator } = await requirePlatformAdmin(["super_admin"]);
  const barbershopId = String(formData.get("barbearia_id") ?? "");
  const adminUserId = String(formData.get("user_id") ?? "");
  if (!isUuid(barbershopId) || !isUuid(adminUserId)) {
    return { status: "error", message: "Não foi possível identificar o acesso solicitado." };
  }

  const supabase = createAdminSupabase();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,barbearia_id,nome,email,ativo")
    .eq("id", adminUserId)
    .eq("barbearia_id", barbershopId)
    .eq("role", "admin")
    .maybeSingle();
  if (profileError || !profile?.email) {
    return { status: "error", message: "O administrador não foi encontrado nesta barbearia." };
  }
  if (profile.ativo === false) {
    return { status: "error", message: "Reative o acesso antes de gerar um link." };
  }

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(adminUserId);
  if (authError || !authData.user) {
    return { status: "error", message: "O usuário de autenticação não foi encontrado." };
  }
  const acceptedAt = authData.user.email_confirmed_at ?? authData.user.confirmed_at ?? null;
  if (acceptedAt || authData.user.last_sign_in_at) {
    return { status: "error", message: "Este administrador já concluiu o acesso. Use a recuperação de senha se necessário." };
  }

  const appUrl = (process.env.GARAGEM_APP_URL ?? "https://app.garagemsystem.com.br").replace(/\/$/, "");
  const { data: generated, error: generateError } = await supabase.auth.admin.generateLink({
    type: "invite",
    email: profile.email,
    options: {
      redirectTo: `${appUrl}/definir-senha`,
      data: { nome: profile.nome, role: "admin", barbearia_id: barbershopId },
    },
  });
  const actionLink = generated?.properties?.action_link;
  if (generateError || !actionLink || generated.user.id !== adminUserId) {
    return { status: "error", message: "Não foi possível gerar o link. Tente novamente." };
  }

  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + 60 * 60 * 1000).toISOString();
  const { data: product } = await supabase
    .from("plataforma_produtos")
    .select("id")
    .eq("codigo", "garagem")
    .maybeSingle();
  const { error: auditError } = await supabase.from("saas_auditoria").insert({
    produto_id: product?.id ?? null,
    ator_user_id: operatorUser.id,
    ator_role: operator.role,
    acao: "convite_admin_link_gerado",
    entidade: "profiles",
    entidade_id: adminUserId,
    estado_anterior: {
      barbearia_id: barbershopId,
      invited_at: authData.user.invited_at ?? null,
      confirmed_at: acceptedAt,
      last_sign_in_at: authData.user.last_sign_in_at ?? null,
    },
    estado_novo: {
      barbearia_id: barbershopId,
      link_generated_at: generatedAt.toISOString(),
      expires_at: expiresAt,
      entrega: "manual",
    },
  });

  revalidatePath("/barbearias");
  return {
    status: auditError ? "warning" : "success",
    message: auditError
      ? "Link gerado, mas a auditoria falhou. Copie o link agora e verifique o registro antes de gerar outro."
      : "Link gerado. Copie e envie em uma conversa privada; ele substitui todos os convites anteriores.",
    actionLink,
    expiresAt,
  };
}
