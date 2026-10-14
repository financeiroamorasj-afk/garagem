"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";

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
