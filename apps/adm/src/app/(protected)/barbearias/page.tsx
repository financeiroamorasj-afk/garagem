import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { listBarbershops, type BarbershopAdminAccess } from "@/lib/data";
import { shortDate, shortDateTime } from "@/lib/format";
import { resendBarbershopAdminInvite } from "./actions";
import { ResendInviteButton } from "./resend-invite-button";

const inviteMessages: Record<string, { tone: "notice" | "alert"; text: string }> = {
  reenviado: { tone: "notice", text: "Convite reenviado. O novo link foi enviado para o administrador da barbearia." },
  reenviado_sem_auditoria: { tone: "alert", text: "O convite foi reenviado, mas o registro de auditoria falhou. Verifique antes de fazer outro reenvio." },
  acesso_confirmado: { tone: "notice", text: "Este administrador já aceitou o convite ou realizou o primeiro acesso. Use a recuperação de senha se ele não consegue entrar." },
  acesso_inativo: { tone: "alert", text: "O acesso deste administrador está inativo. Reative-o antes de enviar um novo convite." },
  nao_encontrado: { tone: "alert", text: "O administrador não foi encontrado no vínculo desta barbearia." },
  dados_invalidos: { tone: "alert", text: "Não foi possível identificar o convite solicitado." },
  falhou: { tone: "alert", text: "Não foi possível reenviar o convite. Tente novamente e confira o serviço de e-mail." },
};

function AccessStatus({ admin }: { admin: BarbershopAdminAccess }) {
  if (!admin.authAvailable) return <span className="badge red">Indisponível</span>;
  if (admin.acceptedAt) return <><span className="badge green">Aceito</span><span className="secondary-cell">{shortDateTime(admin.acceptedAt)}</span></>;
  if (admin.invitedAt) return <><span className="badge gold">Pendente</span><span className="secondary-cell">Enviado em {shortDateTime(admin.invitedAt)}</span></>;
  return <span className="badge muted">Não enviado</span>;
}

function FirstLoginStatus({ admin }: { admin: BarbershopAdminAccess }) {
  if (admin.firstLoginAt) return <><span className="badge green">Realizado</span><span className="secondary-cell">{shortDateTime(admin.firstLoginAt)}</span></>;
  return <span className="badge muted">Não realizado</span>;
}

export default async function BarbershopsPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string | string[] }>;
}) {
  const [{ operator }, shops, query] = await Promise.all([
    requirePlatformAdmin(["super_admin", "financeiro", "suporte"]),
    listBarbershops(),
    searchParams,
  ]);
  const inviteResult = typeof query.convite === "string" ? inviteMessages[query.convite] : null;

  return <>
    <header className="page-header"><div><div className="eyebrow">Clientes da plataforma</div><h1 className="page-title">Barbearias</h1><p className="page-description">Acompanhe o convite e o primeiro login dos administradores de cada cliente.</p></div>{operator.role === "super_admin" ? <Link className="button-link" href="/barbearias/nova">Nova barbearia</Link> : null}</header>
    {inviteResult ? <div className={inviteResult.tone} role={inviteResult.tone === "alert" ? "alert" : "status"}>{inviteResult.text}</div> : null}
    <section className="panel"><div className="panel-heading"><h2>Unidades cadastradas</h2><span className="panel-link">{shops.length} registro(s)</span></div>
      {shops.length ? <div className="table-wrap"><table><thead><tr><th>Barbearia</th><th>Administrador</th><th>Convite</th><th>Primeiro login</th><th>Cadastro</th>{operator.role === "super_admin" ? <th>Ação</th> : null}</tr></thead><tbody>
        {shops.flatMap((shop) => shop.admins.length ? shop.admins.map((admin, index) => {
          const canResend = admin.ativo && admin.authAvailable && !admin.acceptedAt && !admin.firstLoginAt;
          return <tr key={`${shop.id}:${admin.userId}`}>
            <td className="primary-cell">{index === 0 ? <>{shop.nome}<span className="secondary-cell">/portal/{shop.slug}</span></> : null}</td>
            <td>{admin.nome}<span className="secondary-cell">{admin.email}{admin.ativo ? "" : " · acesso inativo"}</span></td>
            <td><AccessStatus admin={admin} /></td>
            <td><FirstLoginStatus admin={admin} /></td>
            <td>{index === 0 ? shortDate(shop.criado_em) : null}</td>
            {operator.role === "super_admin" ? <td>{canResend ? <form action={resendBarbershopAdminInvite}>
              <input type="hidden" name="barbearia_id" value={shop.id} />
              <input type="hidden" name="user_id" value={admin.userId} />
              <ResendInviteButton firstSend={!admin.invitedAt} />
            </form> : <span className="secondary-cell table-action-unavailable">{admin.acceptedAt || admin.firstLoginAt ? "Acesso concluído" : "Indisponível"}</span>}</td> : null}
          </tr>;
        }) : [<tr key={shop.id}>
          <td className="primary-cell">{shop.nome}<span className="secondary-cell">/portal/{shop.slug}</span></td>
          <td><span className="badge muted">Sem administrador</span></td>
          <td>—</td><td>—</td><td>{shortDate(shop.criado_em)}</td>
          {operator.role === "super_admin" ? <td><span className="secondary-cell table-action-unavailable">Indisponível</span></td> : null}
        </tr>])}
      </tbody></table></div> : <div className="empty">Nenhuma barbearia cadastrada.</div>}
    </section>
  </>;
}
