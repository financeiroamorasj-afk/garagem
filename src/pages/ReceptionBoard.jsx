import { Link } from 'react-router-dom'
import { Headset } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'

export default function ReceptionBoard() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-0 p-6 text-warm-white">
      <EmptyState
        icon={Headset}
        title="Recepção ativada"
        description="O módulo está liberado para esta unidade. O caixa de balcão, a fila de atendimentos e os usuários da recepção serão conectados a dados reais na próxima etapa. Nenhum dado demonstrativo é exibido aqui."
        action={<Link to="/admin/configuracoes" className="inline-flex min-h-11 items-center rounded-sm border border-copper px-5 text-sm font-semibold uppercase tracking-button text-copper">Voltar às configurações</Link>}
      />
    </main>
  )
}
