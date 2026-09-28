"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, LayoutDashboard, PackageOpen } from "lucide-react";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import type { PlatformRole } from "@/lib/auth";

const links = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard, roles: ["super_admin", "financeiro", "suporte"] },
  { href: "/planos", label: "Planos", icon: PackageOpen, roles: ["super_admin", "financeiro"] },
  { href: "/barbearias", label: "Barbearias", icon: Building2, roles: ["super_admin", "financeiro", "suporte"] },
  { href: "/assinaturas", label: "Assinaturas", icon: CreditCard, roles: ["super_admin", "financeiro"] },
];

export function AdminShell({ children, email, role }: { children: ReactNode; email: string; role: PlatformRole }) {
  const pathname = usePathname();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <Image src="/garagem-symbol.png" alt="Garagem" width={52} height={52} />
          <div><div className="brand-name">GARAGEM</div><div className="brand-subtitle">ADM da plataforma</div></div>
        </div>
        <nav className="nav" aria-label="Navegação do ADM">
          <div className="nav-label">Operação</div>
          {links.filter((item) => item.roles.includes(role)).map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href} className={`nav-link${active ? " active" : ""}`}><Icon size={18} aria-hidden="true" /><span>{label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="operator-name">{email}</div>
          <div className="operator-role">{role.replace("_", " ")}</div>
          <form action={logout}><button className="logout" type="submit">Encerrar sessão</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
