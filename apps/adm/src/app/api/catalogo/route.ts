import { NextResponse } from "next/server";
import { checkoutCorsOrigin } from "@/lib/checkout";
import { createAdminSupabase } from "@/lib/supabase/admin";

function response(request: Request, body: Record<string, unknown>, status = 200) {
  const origin = checkoutCorsOrigin(request);
  const result = NextResponse.json(body, { status });
  if (origin) result.headers.set("Access-Control-Allow-Origin", origin);
  result.headers.set("Vary", "Origin");
  result.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return result;
}

export async function GET(request: Request) {
  const origin = checkoutCorsOrigin(request);
  if (!origin) return response(request, { code: "CATALOGO_ORIGEM_NAO_AUTORIZADA" }, 403);

  const supabase = createAdminSupabase();
  const { data: product, error: productError } = await supabase.from("plataforma_produtos")
    .select("id").eq("codigo", "garagem").eq("ativo", true).single();
  if (productError || !product) return response(request, { code: "CATALOGO_INDISPONIVEL" }, 503);

  const [plansResult, modulesResult] = await Promise.all([
    supabase.from("saas_planos")
      .select("codigo,nome,descricao,preco_mensal,preco_anual,limite_usuarios")
      .eq("produto_id", product.id).eq("status", "ativo").order("ordem"),
    supabase.from("saas_modulos")
      .select("codigo,nome,descricao,preco_mensal,preco_anual")
      .eq("produto_id", product.id).eq("status", "ativo").order("ordem"),
  ]);
  if (plansResult.error || modulesResult.error) return response(request, { code: "CATALOGO_INDISPONIVEL" }, 503);

  return response(request, {
    plans: plansResult.data ?? [],
    modules: modulesResult.data ?? [],
  });
}
