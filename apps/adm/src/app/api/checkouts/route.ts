import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createCustomer, createSubscription } from '@/lib/asaas';
import { randomUUID } from 'crypto';

// Habilita CORS para a Landing Page poder fazer a requisição
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      nome_admin, 
      email_admin, 
      telefone_admin,
      responsavel_cpf,
      plano_codigo, // 'base' ou 'gestao'
      ciclo, // 'mensal' ou 'anual'
      modulos // array of strings, ex: ['recepcao', 'profissional_adicional']
    } = body;

    // Validação básica do que vem da Landing Page
    if (!nome_admin || !email_admin || !plano_codigo || !ciclo || !responsavel_cpf) {
      return NextResponse.json({ error: 'Dados incompletos. Requer nome_admin, email_admin, responsavel_cpf, plano_codigo e ciclo.' }, { status: 400 });
    }

    const supabase = createAdminSupabase();

    // 1. Validar e Buscar Preços Oficiais no Banco de Dados do Garagem
    // Isso evita que um hacker mude o preço pela Landing Page!
    const { data: planoData, error: planoError } = await supabase
      .from('saas_planos')
      .select('*')
      .eq('codigo', plano_codigo)
      .eq('status', 'ativo')
      .single();

    if (planoError || !planoData) {
      return NextResponse.json({ error: 'Plano inválido ou inativo.' }, { status: 400 });
    }

    let precoBase = ciclo === 'anual' ? planoData.preco_anual : planoData.preco_mensal;
    let descricoes = [`Plano ${planoData.nome} (${ciclo})`];

    // Buscar os módulos se a pessoa escolheu algum adicional
    if (modulos && modulos.length > 0) {
      const { data: modulosData } = await supabase
        .from('saas_modulos')
        .select('*')
        .in('codigo', modulos)
        .eq('status', 'ativo');
        
      if (modulosData) {
        modulosData.forEach(mod => {
          precoBase += ciclo === 'anual' ? mod.preco_anual : mod.preco_mensal;
          descricoes.push(`Módulo ${mod.nome}`);
        });
      }
    }

    // 2. Aplicar Regra de Negócio: Desconto de Lançamento (20%)
    const precoComDesconto = Number((precoBase * 0.8).toFixed(2)); 
    descricoes.push(`(Desconto Oficial de Lançamento - 20% OFF)`);

    // 3. Gerar ID Único da Compra
    // O Asaas vai nos devolver esse ID via Webhook quando a pessoa pagar
    const externalRef = `garagem_${randomUUID()}`;

    // 4. Criar Cliente no Asaas
    const asaasCustomer = await createCustomer(
      nome_admin, 
      responsavel_cpf, 
      email_admin, 
      telefone_admin || '',
      externalRef
    );

    // 5. Criar a Assinatura Recorrente no Asaas
    const asaasSubscription = await createSubscription(
      asaasCustomer.id,
      precoComDesconto,
      `Garagem System: ${descricoes.join(' + ')}`,
      ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
      externalRef
    );

    // O link da primeira fatura que leva o cliente para a tela de pagamento do Asaas
    const paymentLink = asaasSubscription.invoiceUrl || `https://www.asaas.com/c/${asaasSubscription.id}`;
    
    // Configura Headers de CORS no retorno
    const response = NextResponse.json({ 
      success: true, 
      checkoutUrl: paymentLink,
      externalReference: externalRef
    });
    
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;

  } catch (err: any) {
    console.error('[CHECKOUT API ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
