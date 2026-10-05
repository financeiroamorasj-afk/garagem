import { listSubscriptions } from "@/lib/data";
import { badgeTone, money, shortDate } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/auth";

function Badge({ status }: { status: string }) {
  return <span className={`badge ${badgeTone(status)}`}>{status.replaceAll("_", " ")}</span>;
}

export default async function SubscriptionsPage() {
  await requirePlatformAdmin(["super_admin", "financeiro"]);
  const data = await listSubscriptions();
  return <>
    <header className="page-header"><div><div className="eyebrow">Contratos SaaS</div><h1 className="page-title">Assinaturas</h1><p className="page-description">Acompanhe a contratação, a confirmação do gateway e o provisionamento do acesso.</p></div></header>

    <section className="panel"><div className="panel-heading"><h2>Assinaturas ativas e históricas</h2><span className="panel-link">{data.rows.length} registro(s)</span></div>
      {data.rows.length ? <div className="table-wrap"><table><thead><tr><th>Barbearia</th><th>Plano</th><th>Status</th><th>Ciclo</th><th>Valor</th><th>Início</th></tr></thead><tbody>
        {data.rows.map((item) => <tr key={item.id}><td className="primary-cell">{data.shops.get(item.barbearia_id)?.nome ?? "Unidade não encontrada"}{item.membro_fundador ? <span className="secondary-cell">Membro fundador</span> : null}</td><td>{data.plans.get(item.plano_id)?.nome ?? "Plano não encontrado"}</td><td><Badge status={item.status} /></td><td>{item.ciclo}</td><td>{money(item.preco_final)}</td><td>{shortDate(item.created_at)}</td></tr>)}
      </tbody></table></div> : <div className="empty">Nenhuma assinatura provisionada até o momento.</div>}
    </section>

    <section className="panel"><div className="panel-heading"><h2>Checkouts recentes</h2><span className="panel-link">últimos {data.checkouts.length}</span></div>
      {data.checkouts.length ? <div className="table-wrap"><table><thead><tr><th>Barbearia</th><th>Responsável</th><th>Plano</th><th>Status</th><th>Ciclo</th><th>Valor</th><th>Ambiente</th><th>Criado</th></tr></thead><tbody>
        {data.checkouts.map((item) => <tr key={item.id}><td className="primary-cell">{item.nome_barbearia}</td><td>{item.nome_admin}<span className="secondary-cell">{item.email_admin}</span></td><td>{data.plans.get(item.plano_id)?.nome ?? "Plano não encontrado"}</td><td><Badge status={item.status} /></td><td>{item.ciclo}</td><td>{money(item.preco_final)}</td><td>{item.gateway_ambiente ?? "—"}</td><td>{shortDate(item.created_at)}</td></tr>)}
      </tbody></table></div> : <div className="empty">Nenhum checkout iniciado. Eles aparecerão aqui antes mesmo da confirmação do pagamento.</div>}
    </section>

    <section className="panel"><div className="panel-heading"><h2>Eventos do Asaas</h2><span className="panel-link">últimos {data.events.length}</span></div>
      {data.events.length ? <div className="table-wrap"><table><thead><tr><th>Evento</th><th>Status interno</th><th>Recurso</th><th>Falha</th><th>Recebido</th></tr></thead><tbody>
        {data.events.map((item) => <tr key={item.id}><td className="primary-cell">{item.event_type}</td><td><Badge status={item.status} /></td><td><code>{item.resource_id ?? "—"}</code></td><td>{item.erro_codigo ?? "—"}</td><td>{shortDate(item.recebido_em)}</td></tr>)}
      </tbody></table></div> : <div className="empty">Nenhum evento recebido do Asaas.</div>}
    </section>
  </>;
}
