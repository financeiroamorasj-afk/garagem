import { logout } from "@/app/actions/auth";

export default function UnauthorizedPage() {
  return (
    <main className="login-page">
      <section className="login-card unauthorized">
        <div className="eyebrow">Acesso restrito</div>
        <h1>Conta sem permissão</h1>
        <p>Seu login existe, mas ainda não foi habilitado como operador do ADM Garagem.</p>
        <form action={logout} style={{ marginTop: "2rem" }}><button className="button" type="submit">Sair e usar outra conta</button></form>
      </section>
    </main>
  );
}
