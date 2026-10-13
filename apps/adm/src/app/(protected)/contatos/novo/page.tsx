import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { NewContactForm } from "../contact-form";

export default async function NewContactPage() {
  await requirePlatformAdmin(["super_admin"]);
  return <>
    <header className="page-header"><div><div className="eyebrow">Prospecção direta</div><h1 className="page-title">Novo contato</h1><p className="page-description">Cadastre a barbearia enquanto pesquisa e deixe a primeira ação programada.</p></div><Link className="secondary-button" href="/contatos">Voltar ao funil</Link></header>
    <NewContactForm />
  </>;
}
