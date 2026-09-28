import { listSubscriptions } from "@/lib/data";
import { badgeTone, money, shortDate } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function SubscriptionsPage() {
  await requirePlatformAdmin(["super_admin", "financeiro"]);
  const data = await listSubscriptions();
  return <>
    <header className="page-header"><div><div className="eyebrow">Contratos SaaS</div><h1 className="page-title">Assinaturas</h1><p className="page-description">Histórico contratual separado da cobrança e do provisionamento.</p></div></header>
    <section className="panel"><div className="panel-heading"><h2>Assinaturas cadastradas</h2><span className="panel-link">{data.rows.length} registro(s)</span></div>
      {data.rows.length ? <div className="table-wrap"><table><thead><tr><th>Barbearia</th><th>Plano</th><th>Status</th><th>Ciclo</th><th>Valor</th><th>Início</th></tr></thead><tbody>
        {data.rows.map((item) => <tr key={item.id}><td className="primary-cell">{data.shops.get(item.barbearia_id)?.nome ?? "Unidade não encontrada"}{item.membro_fundador ? <span className="secondary-cell">Membro fundador</span> : null}</td><td>{data.plans.get(item.plano_id)?.nome ?? "Plano não encontrado"}</td><td><span className={`badge ${badgeTone(item.status)}`}>{item.status.replaceAll("_", " ")}</span></td><td>{item.ciclo}</td><td>{money(item.preco_final)}</td><td>{shortDate(item.created_at)}</td></tr>)}
      </tbody></table></div> : <div className="empty">Nenhuma assinatura criada. A primeira poderá ser ativada manualmente, sem depender do Asaas.</div>}
    </section>
  </>;
}
