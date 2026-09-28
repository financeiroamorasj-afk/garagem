import { listBarbershops } from "@/lib/data";
import { shortDate } from "@/lib/format";

export default async function BarbershopsPage() {
  const shops = await listBarbershops();
  return <>
    <header className="page-header"><div><div className="eyebrow">Clientes da plataforma</div><h1 className="page-title">Barbearias</h1><p className="page-description">Unidades operacionais existentes, inclusive as que ainda não possuem assinatura.</p></div></header>
    <section className="panel"><div className="panel-heading"><h2>Unidades cadastradas</h2><span className="panel-link">{shops.length} registro(s)</span></div>
      {shops.length ? <div className="table-wrap"><table><thead><tr><th>Barbearia</th><th>Portal</th><th>Cadastro</th><th>Identificador</th></tr></thead><tbody>
        {shops.map((shop) => <tr key={shop.id}><td className="primary-cell">{shop.nome}</td><td>/portal/{shop.slug}</td><td>{shortDate(shop.criado_em)}</td><td><span className="secondary-cell">{shop.id}</span></td></tr>)}
      </tbody></table></div> : <div className="empty">Nenhuma barbearia cadastrada.</div>}
    </section>
  </>;
}
