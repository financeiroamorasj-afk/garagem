import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const token = req.headers.get('asaas-access-token');

    // 1. Validar o Token de segurança do Asaas
    const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;
    if (!webhookSecret || token !== webhookSecret) {
      console.warn('[ASAAS WEBHOOK] Token inválido ou ausente. Recebido:', token);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    
    // O Asaas costuma mandar ping de validação ao salvar
    if (payload.event === 'WEBHOOK_VALIDATION') {
      return NextResponse.json({ received: true });
    }

    const supabase = createAdminSupabase();

    // 2. Buscar o ID do produto Garagem para atrelar o evento
    const { data: produto } = await supabase
      .from('plataforma_produtos')
      .select('id')
      .eq('codigo', 'garagem')
      .single();

    if (!produto) {
      console.error('[ASAAS WEBHOOK] Erro: Produto garagem não encontrado no DB.');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Extrair um ID de referência para rastreio
    const eventId = payload.payment?.id || payload.subscription?.id || payload.customer?.id || 'unknown';

    // 3. Nossa lógica de roteamento e blindagem do Rebip:
    // Nós procuraremos pela tag 'garagem_' na cobrança ou cliente
    const isGaragem = payload.payment?.externalReference?.startsWith('garagem_') 
                   || payload.customer?.externalReference?.startsWith('garagem_')
                   || payload.subscription?.externalReference?.startsWith('garagem_');

    let status_banco = 'recebido';

    if (!isGaragem) {
      // Como não tem a tag do Garagem, significa que é um aviso do Rebip!
      // Nós apenas marcamos como ignorado e avisamos o Asaas que recebemos.
      // O webhook real do Rebip continuará recebendo o mesmo aviso normalmente em paralelo.
      console.log(`[ASAAS WEBHOOK] 🛡️ Evento ${payload.event} ignorado silenciosamente (Pertence ao Rebip)`);
      status_banco = 'ignorado';
    } else {
      console.log(`[ASAAS WEBHOOK] 🎯 Evento ${payload.event} recebido para o GARAGEM!`);
    }

    // 4. Salvar o evento na nossa tabela de Inbox para processamento seguro (Idempotência)
    const { error: insertError } = await supabase
      .from('saas_gateway_eventos')
      .insert({
        produto_id: produto.id,
        provider: 'asaas',
        ambiente: process.env.NODE_ENV === 'production' ? 'producao' : 'sandbox',
        event_id: eventId,
        event_type: payload.event,
        payload_sanitizado: payload,
        status: status_banco
      });

    if (insertError) {
      console.error('[ASAAS WEBHOOK] Erro ao salvar evento no DB:', insertError);
      return NextResponse.json({ error: 'Database Error' }, { status: 500 });
    }

    // Retorna Sucesso (200 OK) para o Asaas parar de tentar enviar
    return NextResponse.json({ received: true });

  } catch (err: any) {
    console.error('[ASAAS WEBHOOK] Erro fatal no processamento:', err);
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }
}
