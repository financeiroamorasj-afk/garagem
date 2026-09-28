import "server-only";
import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export type PlatformRole = "super_admin" | "financeiro" | "suporte";

export async function requirePlatformAdmin(allowedRoles?: PlatformRole[]) {
  const authClient = await createServerSupabase();
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: operator, error } = await createAdminSupabase()
    .from("plataforma_admins")
    .select("user_id,role,ativo")
    .eq("user_id", user.id)
    .eq("ativo", true)
    .maybeSingle();
  if (error || !operator) redirect("/nao-autorizado");

  const typedOperator = operator as { user_id: string; role: PlatformRole; ativo: boolean };
  if (allowedRoles && !allowedRoles.includes(typedOperator.role)) redirect("/nao-autorizado");

  return {
    user,
    operator: typedOperator,
  };
}
