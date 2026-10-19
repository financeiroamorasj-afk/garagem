import { AlertTriangle, Banknote, CreditCard } from 'lucide-react'
import { formatarBRL } from '../lib/financeiro/moeda'

function exigeConfirmacaoManual(formaPagamento) {
  return ['dinheiro', 'debito', 'credito'].includes(formaPagamento)
}

export default function PaymentConfirmationPanel({
  paymentMethod,
  amount,
  destination,
  loading,
  confirmed,
  onConfirmedChange,
  disabled = false,
}) {
  if (!exigeConfirmacaoManual(paymentMethod)) return null

  const card = paymentMethod === 'debito' || paymentMethod === 'credito'
  const Icon = card ? CreditCard : Banknote
  const configured = Boolean(destination?.configurado)
  const accountLabel = card ? 'conta de recebimentos de cartão' : 'conta caixa'

  return (
    <div className={`rounded-md border p-4 ${configured ? 'border-copper/50 bg-copper/5' : 'border-warning/50 bg-warning/10'}`}>
      <div className="flex items-start gap-3">
        {configured ? <Icon size={22} className="mt-0.5 shrink-0 text-copper" /> : <AlertTriangle size={22} className="mt-0.5 shrink-0 text-warning" />}
        <div className="min-w-0 flex-1">
          <p className={`text-label ${configured ? 'text-copper' : 'text-warning'}`}>
            {card ? 'CONFIRMAÇÃO DA MAQUININHA' : 'CONFIRMAÇÃO DO DINHEIRO'}
          </p>
          {loading ? (
            <p className="mt-2 text-body-sm text-steel">Verificando a conta que receberá este pagamento...</p>
          ) : configured ? (
            <>
              <p className="mt-2 text-body text-warm-white">
                {card
                  ? <>Passe <strong>{formatarBRL(amount)}</strong> na maquininha e aguarde a mensagem <strong>APROVADO</strong>.</>
                  : <>Receba e confira <strong>{formatarBRL(amount)}</strong> em dinheiro antes de guardar no caixa.</>}
              </p>
              <p className="mt-2 text-body-sm text-steel">Destino financeiro: <strong className="text-warm-white">{destination.conta_nome}</strong>.</p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-sm border border-line bg-surface-1 p-3 text-body-sm text-warm-white">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => onConfirmedChange(event.target.checked)}
                  disabled={disabled}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded-sm border border-line-strong accent-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"
                />
                <span>{card ? 'Confirmo que a maquininha exibiu pagamento aprovado.' : 'Confirmo que recebi e conferi o dinheiro.'}</span>
              </label>
            </>
          ) : (
            <p className="mt-2 text-body-sm text-warning">
              O ADM precisa cadastrar uma {accountLabel} ativa em Financeiro → Cadastros antes de usar esta forma de pagamento.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
