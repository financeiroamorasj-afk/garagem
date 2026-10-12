"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";
import type { Plan, PlatformModule } from "@/lib/data";
import { updateModule, updatePlan, type CatalogActionState } from "./actions";

const initialState: CatalogActionState = { status: "idle", message: "" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="button catalog-save" type="submit" disabled={pending}><Save size={16} />{pending ? "Salvando…" : label}</button>;
}

function Feedback({ state }: { state: CatalogActionState }) {
  if (!state.message) return null;
  const tone = state.status === "success" ? "success" : state.status === "warning" ? "warning" : "error";
  return <div className={`form-feedback ${tone}`} role="status">{state.message}</div>;
}

function PriceField({ name, label, value }: { name: string; label: string; value: number | null }) {
  return <label className="field"><span className="label">{label}</span><div className="catalog-price"><span>R$</span><input name={name} type="number" min="0" max="9999999999.99" step="0.01" defaultValue={value ?? ""} placeholder="A definir" inputMode="decimal" /></div></label>;
}

function StatusField({ value }: { value: string }) {
  return <label className="field"><span className="label">Status</span><select name="status" defaultValue={value}><option value="rascunho">Rascunho</option><option value="ativo">Ativo</option><option value="arquivado">Arquivado</option></select></label>;
}

function PlanForm({ plan, canEdit }: { plan: Plan; canEdit: boolean }) {
  const [state, action] = useActionState(updatePlan, initialState);
  return <form action={action} className="catalog-form">
    <input type="hidden" name="id" value={plan.id} />
    <div className="catalog-form__heading"><div><span className="catalog-code">{plan.codigo}</span><h3>{plan.nome}</h3></div><span className={`badge ${plan.status === "ativo" ? "green" : plan.status === "arquivado" ? "muted" : "gold"}`}>{plan.status}</span></div>
    <fieldset disabled={!canEdit}>
      <div className="catalog-fields">
        <label className="field"><span className="label">Nome comercial</span><input name="nome" minLength={2} maxLength={80} defaultValue={plan.nome} required /></label>
        <StatusField value={plan.status} />
        <label className="field catalog-wide"><span className="label">Descrição</span><textarea name="descricao" maxLength={500} rows={3} defaultValue={plan.descricao ?? ""} /></label>
        <PriceField name="preco_mensal" label="Mensal" value={plan.preco_mensal} />
        <PriceField name="preco_anual" label="Anual total" value={plan.preco_anual} />
        <label className="field"><span className="label">Limite de profissionais</span><input name="limite_usuarios" type="number" min="1" max="1000" step="1" defaultValue={plan.limite_usuarios ?? ""} placeholder="Sem limite" inputMode="numeric" /></label>
        <div className="catalog-readonly"><span className="label">Teste automático</span><strong>{plan.dias_trial} dias</strong><small>Ainda sem provisionamento de trial.</small></div>
      </div>
      {canEdit ? <div className="catalog-form__actions"><p>Planos ativos aparecem no checkout público.</p><SubmitButton label="Salvar plano" /></div> : null}
    </fieldset>
    <Feedback state={state} />
  </form>;
}

function ModuleForm({ module, canEdit }: { module: PlatformModule; canEdit: boolean }) {
  const [state, action] = useActionState(updateModule, initialState);
  return <form action={action} className="catalog-form">
    <input type="hidden" name="id" value={module.id} />
    <div className="catalog-form__heading"><div><span className="catalog-code">{module.codigo}</span><h3>{module.nome}</h3></div><span className={`badge ${module.status === "ativo" ? "green" : module.status === "arquivado" ? "muted" : "gold"}`}>{module.status}</span></div>
    <fieldset disabled={!canEdit}>
      <div className="catalog-fields">
        <label className="field"><span className="label">Nome comercial</span><input name="nome" minLength={2} maxLength={80} defaultValue={module.nome} required /></label>
        <StatusField value={module.status} />
        <label className="field catalog-wide"><span className="label">Descrição</span><textarea name="descricao" maxLength={500} rows={3} defaultValue={module.descricao ?? ""} /></label>
        <PriceField name="preco_mensal" label="Mensal" value={module.preco_mensal} />
        <PriceField name="preco_anual" label="Anual total" value={module.preco_anual} />
        <div className="catalog-readonly"><span className="label">Permissão liberada</span><strong>{module.entitlement_codigo ?? "Não definida"}</strong><small>Identificador interno do módulo.</small></div>
      </div>
      {canEdit ? <div className="catalog-form__actions"><p>Módulos ativos podem ser adicionados ao checkout.</p><SubmitButton label="Salvar módulo" /></div> : null}
    </fieldset>
    <Feedback state={state} />
  </form>;
}

export function CatalogEditor({ plans, modules, canEdit }: { plans: Plan[]; modules: PlatformModule[]; canEdit: boolean }) {
  return <>
    <section className="catalog-section">
      <div className="panel-heading"><div><span className="eyebrow">Assinaturas</span><h2>Planos publicados</h2></div><span className="panel-link">{plans.length} registro(s)</span></div>
      <p className="section-description">O checkout consulta estes valores em tempo real. Arquivar um plano impede novas contratações sem alterar assinaturas existentes.</p>
      <div className="catalog-grid catalog-grid--plans">{plans.map((plan) => <PlanForm key={plan.id} plan={plan} canEdit={canEdit} />)}</div>
    </section>

    <section className="catalog-section">
      <div className="panel-heading"><div><span className="eyebrow">Complementos</span><h2>Módulos contratáveis</h2></div><span className="panel-link">{modules.length} registro(s)</span></div>
      <p className="section-description">Preços e disponibilidade dos adicionais vendidos junto com os planos Base e Gestão.</p>
      <div className="catalog-grid">{modules.map((module) => <ModuleForm key={module.id} module={module} canEdit={canEdit} />)}</div>
    </section>
  </>;
}
