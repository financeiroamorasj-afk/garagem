import Image from "next/image";
import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import { createServerSupabase } from "@/lib/supabase/server";

const messages: Record<string, string> = {
  campos: "Informe o e-mail e a senha.",
  credenciais: "E-mail ou senha inválidos.",
  acesso: "Esta conta não possui acesso ao ADM da plataforma.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-lockup">
          <Image src="/garagem-symbol.png" alt="Garagem System" width={64} height={64} priority />
          <div><div className="brand-name">GARAGEM</div><div className="brand-subtitle">Administração da plataforma</div></div>
        </div>
        <h1>Central de comando</h1>
        <p>Acesse planos, unidades e assinaturas com uma conta autorizada da plataforma.</p>
        {error ? <div className="alert" style={{ marginTop: "1.5rem" }}>{messages[error] ?? "Não foi possível entrar agora."}</div> : null}
        <form action={login} className="form">
          <label className="field"><span className="label">E-mail</span><input name="email" type="email" autoComplete="email" required /></label>
          <label className="field"><span className="label">Senha</span><input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button" type="submit">Entrar no ADM</button>
        </form>
      </section>
    </main>
  );
}
