import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { user, operator } = await requirePlatformAdmin();
  return <AdminShell email={user.email ?? "Operador"} role={operator.role}>{children}</AdminShell>;
}
