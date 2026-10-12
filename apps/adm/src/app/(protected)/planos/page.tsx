import { commercialCatalog } from "@/lib/data";
import { requirePlatformAdmin } from "@/lib/auth";
import { CatalogEditor } from "./catalog-editor";

export default async function PlansPage() {
  const { operator } = await requirePlatformAdmin(["super_admin", "financeiro"]);
  const { plans, modules } = await commercialCatalog();
  const canEdit = operator.role === "super_admin";

  return <>
    <header className="page-header">
      <div><div className="eyebrow">Catálogo comercial</div><h1 className="page-title">Planos e módulos</h1><p className="page-description">Controle preços, disponibilidade e capacidade usados pelo checkout e pelas novas implantações.</p></div>
    </header>
    <div className="notice">{canEdit ? "Alterações salvas aqui passam a valer para novas contratações. Assinaturas já criadas preservam o preço registrado no momento da compra." : "Seu perfil pode consultar o catálogo. Somente um super administrador pode alterar preços e disponibilidade."}</div>
    <CatalogEditor plans={plans} modules={modules} canEdit={canEdit} />
  </>;
}
