import { Clock3, Package, ReceiptText, RotateCcw, UserRound } from 'lucide-react'
import { formatarBRL } from '../lib/financeiro/moeda'
import Badge from './ui/Badge'
import Button from './ui/Button'
import Card from './ui/Card'

const PAYMENT_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  outro: 'Outro',
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

export default function ReceptionSalesHistory({ sales, onRefund }) {
  return (
    <section className="space-y-3" aria-labelledby="counter-sales-title">
      <div>
        <span className="text-label text-copper">MOVIMENTO DO BALCÃO</span>
        <h2 id="counter-sales-title" className="mt-1 text-h2 text-warm-white">Vendas avulsas recentes</h2>
        <p className="mt-1 text-body-sm text-steel">Produtos vendidos diretamente pela recepção neste período.</p>
      </div>

      {sales.length === 0 ? (
        <Card className="p-4 text-body-sm text-steel">Nenhuma venda avulsa registrada neste período.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sales.map((sale) => (
            <Card key={sale.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-label text-steel"><ReceiptText size={14} /> VENDA NO BALCÃO</p>
                  <strong className="mt-2 block text-data-lg text-gold-aged">{formatarBRL(sale.valor_final)}</strong>
                  <p className="mt-1 flex items-center gap-2 text-body-sm text-steel"><Clock3 size={14} /> {formatDateTime(sale.criado_em)}</p>
                </div>
                <Badge variant={sale.status === 'concluida' ? 'success' : 'danger'}>{sale.status === 'concluida' ? 'Concluída' : 'Estornada'}</Badge>
              </div>

              <div className="mt-4 space-y-2 border-t border-line pt-3">
                {sale.produtos.map((product) => (
                  <div key={product.id} className="flex items-start justify-between gap-3 text-body-sm">
                    <span className="flex min-w-0 items-center gap-2 text-steel"><Package size={14} className="shrink-0" /> <span className="truncate">{product.quantidade}× {product.nome}</span></span>
                    <span className="shrink-0 text-warm-white">{formatarBRL(product.valor_liquido)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-3 text-body-sm sm:grid-cols-2">
                <div><span className="block text-label text-steel">PAGAMENTO</span><span className="text-warm-white">{PAYMENT_LABELS[sale.forma_pagamento] || sale.forma_pagamento}</span></div>
                <div><span className="block text-label text-steel">RESPONSÁVEL</span><span className="flex items-center gap-2 text-warm-white"><UserRound size={14} /> {sale.profissional_nome || 'Venda direta da recepção'}</span></div>
              </div>

              {sale.status === 'estornada' ? (
                <div className="mt-4 rounded-sm border border-danger/35 bg-danger/10 p-3 text-body-sm text-danger">
                  <strong className="block">Estornada em {formatDateTime(sale.estornado_em)}</strong>
                  <span>{sale.motivo_estorno}</span>
                </div>
              ) : (
                <div className="mt-4 flex justify-end"><Button size="sm" variant="secondary" onClick={() => onRefund(sale)}><RotateCcw size={15} /> Estornar venda</Button></div>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
