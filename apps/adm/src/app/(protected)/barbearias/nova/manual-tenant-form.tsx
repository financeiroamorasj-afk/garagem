"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createManualTenant, type ManualTenantState } from "./actions";

const initialManualTenantState: ManualTenantState = { ok: false, message: "" };

type PlanOption = {
  id: string;
  codigo: string;
  nome: string;
  preco_mensal: number | null;
  preco_anual: number | null;
  limite_usuarios: number | null;
};

type ModuleOption = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number | null;
  preco_anual: number | null;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending}>{pending ? "Criando acesso…" : "Criar barbearia e enviar convite"}</button>;
}

export function ManualTenantForm({ plans, modules }: { plans: PlanOption[]; modules: ModuleOption[] }) {
  const [state, action] = useActionState(createManualTenant, initialManualTenantState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok, state.barbershopId]);

  return <form ref={formRef} action={action} className="tenant-form">
    {state.message ? <div className={`form-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</div> : null}

    <section className="form-section">
      <div className="form-section-heading"><span>1</span><div><h2>Barbearia</h2><p>A unidade e o endereço do portal serão criados automaticamente.</p></div></div>
      <div className="form-grid">
        <label className="field form-wide"><span className="label">Nome da barbearia</span><input name="nome_barbearia" required minLength={2} maxLength={120} placeholder="Ex.: Barbearia Central" autoComplete="organization" /></label>
      </div>
    </section>

    <section className="form-section">
      <div className="form-section-heading"><span>2</span><div><h2>Administrador da unidade</h2><p>O responsável receberá por e-mail o convite para definir a senha.</p></div></div>
      <div className="form-grid">
        <label className="field"><span className="label">Nome completo</span><input name="nome_admin" required minLength={2} maxLength={120} autoComplete="name" /></label>
        <label className="field"><span className="label">E-mail de acesso</span><input type="email" name="email_admin" required maxLength={254} autoComplete="email" /></label>
        <label className="field"><span className="label">Telefone com DDD</span><input type="tel" name="telefone_admin" required inputMode="tel" placeholder="(51) 99999-9999" autoComplete="tel" /></label>
      </div>
    </section>

    <section className="form-section">
      <div className="form-section-heading"><span>3</span><div><h2>Assinatura manual</h2><p>O acesso será ativado imediatamente. A cobrança será controlada fora do Garagem até a integração com o gateway.</p></div></div>
      <div className="form-grid">
        <label className="field"><span className="label">Plano</span><select name="plano_id" required defaultValue=""><option value="" disabled>Selecione</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.nome} · {currency.format(Number(plan.preco_mensal ?? 0))}/mês · até {plan.limite_usuarios ?? "∞"} acesso(s)</option>)}</select></label>
        <label className="field"><span className="label">Ciclo comercial</span><select name="ciclo" defaultValue="mensal"><option value="mensal">Mensal</option><option value="anual">Anual</option></select></label>
      </div>
      <div className="manual-note">A oferta de lançamento vigente e os preços oficiais do catálogo serão aplicados automaticamente. Nenhuma cobrança será criada no Asaas por este formulário.</div>
    </section>

    <section className="form-section">
      <div className="form-section-heading"><span>4</span><div><h2>Módulos opcionais</h2><p>Selecione somente o que foi contratado pelo cliente.</p></div></div>
      <div className="module-picker">
        {modules.map((module) => <div key={module.id} className="module-option">
          <input id={`module-${module.codigo}`} type="checkbox" name="modulos" value={module.codigo} />
          <label htmlFor={`module-${module.codigo}`}><strong>{module.nome}</strong><small>{module.descricao}</small><em>{currency.format(Number(module.preco_mensal ?? 0))}/mês · {currency.format(Number(module.preco_anual ?? 0))}/ano</em></label>
          {module.codigo === "profissional_adicional" ? <input className="quantity-input" type="number" name="profissionais_adicionais" min={1} max={50} defaultValue={1} aria-label="Quantidade de profissionais adicionais" /> : null}
        </div>)}
      </div>
    </section>

    <div className="form-actions"><p>Ao confirmar, o sistema criará o tenant, ativará a assinatura e enviará o convite de acesso.</p><SubmitButton /></div>
  </form>;
}
