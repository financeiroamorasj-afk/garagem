import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Configuração pública do Supabase ausente no ADM.");
  return { url, key };
}

export async function createServerSupabase() {
  const cookieStore = await cookies();
  const { url, key } = publicConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components não podem escrever cookies; o proxy renova a sessão.
        }
      },
    },
  });
}
