import Link from "next/link";
import { dashboardData } from "@/lib/data";
import { badgeTone, money, shortDate } from "@/lib/format";

export default async function DashboardPage() {
  const data = await dashboardData();
  return <>
    <header className="page-header"><div><div className="eyebrow">Operação da plataforma</div><h1 className="page-title">Visão geral</h1><p className="page-description">Dados reais de contratação e unidades do Garagem System.</p></div></header>
    <div className="notice">Os preços e benefícios de membros fundadores continuam em definição. Nenhum plano pode ser ativado sem preço mensal aprovado.</div>
    <section className="metrics" aria-label="Indicadores da plataforma">
      <article className="metric"><span className="metric-label">Planos</span><strong className="metric-value">{data.counts.plans}</strong><span className="metric-detail">rascunhos e ativos</span></article>
      <article className="metric"><span className="metric-label">Barbearias</span><strong className="metric-value">{data.counts.shops}</strong><span className="metric-detail">unidades cadastradas</span></article>
      <article className="metric"><span className="metric-label">Assinaturas</span><strong className="metric-value">{data.counts.subscriptions}</strong><span className="metric-detail">histórico completo</span></article>
      <article className="metric"><span className="metric-label">Em contratação</span><strong className="metric-value">{data.counts.checkouts}</strong><span className="metric-detail">checkouts abertos</span></article>
    </section>
    <section className="panel">
      <div className="panel-heading"><h2>Assinaturas recentes</h2><Link className="panel-link" href="/assinaturas">Ver todas →</Link></div>
      {data.latest.length ? <div className="table-wrap"><table><thead><tr><th>Barbearia</th><th>Plano</th><th>Status</th><th>Valor</th><th>Entrada</th></tr></thead><tbody>
        {data.latest.map((item) => <tr key={item.id}><td className="primary-cell">{data.shops.get(item.barbearia_id)?.nome ?? "Unidade não encontrada"}{item.membro_fundador ? <span className="secondary-cell">Membro fundador</span> : null}</td><td>{data.plans.get(item.plano_id)?.nome ?? "Plano não encontrado"}</td><td><span className={`badge ${badgeTone(item.status)}`}>{item.status.replaceAll("_", " ")}</span></td><td>{money(item.preco_final)}</td><td>{shortDate(item.created_at)}</td></tr>)}
      </tbody></table></div> : <div className="empty">Ainda não há assinaturas. A ativação manual do primeiro membro fundador será a próxima operação disponível.</div>}
    </section>
  </>;
}
