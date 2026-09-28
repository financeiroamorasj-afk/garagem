import { listPlans } from "@/lib/data";
import { badgeTone, money } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function PlansPage() {
  await requirePlatformAdmin(["super_admin", "financeiro"]);
  const plans = await listPlans();
  return <>
    <header className="page-header"><div><div className="eyebrow">Catálogo comercial</div><h1 className="page-title">Planos</h1><p className="page-description">Fonte única de preços, limites e períodos de teste.</p></div></header>
    <div className="notice">Os valores permanecem vazios enquanto discutimos as faixas de preço e o benefício dos membros fundadores.</div>
    <section className="panel"><div className="panel-heading"><h2>Planos cadastrados</h2><span className="panel-link">{plans.length} registro(s)</span></div>
      {plans.length ? <div className="table-wrap"><table><thead><tr><th>Plano</th><th>Status</th><th>Mensal</th><th>Anual</th><th>Trial</th><th>Usuários</th></tr></thead><tbody>
        {plans.map((plan) => <tr key={plan.id}><td className="primary-cell">{plan.nome}<span className="secondary-cell">{plan.codigo}</span></td><td><span className={`badge ${badgeTone(plan.status)}`}>{plan.status}</span></td><td>{money(plan.preco_mensal)}</td><td>{money(plan.preco_anual)}</td><td>{plan.dias_trial} dias</td><td>{plan.limite_usuarios ?? "Sem limite"}</td></tr>)}
      </tbody></table></div> : <div className="empty">Nenhum plano criado. O catálogo será definido após a discussão comercial.</div>}
    </section>
  </>;
}
