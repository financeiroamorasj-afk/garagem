import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { manualProvisioningOptions } from "@/lib/data";
import { ManualTenantForm } from "./manual-tenant-form";

export default async function NewBarbershopPage() {
  await requirePlatformAdmin(["super_admin"]);
  const options = await manualProvisioningOptions();

  return <>
    <header className="page-header">
      <div><div className="eyebrow">Implantação assistida</div><h1 className="page-title">Nova barbearia</h1><p className="page-description">Crie o cliente, registre a assinatura e entregue o acesso sem depender do Asaas.</p></div>
      <Link className="secondary-button" href="/barbearias">Voltar para barbearias</Link>
    </header>
    <ManualTenantForm plans={options.plans} modules={options.modules} />
  </>;
}
