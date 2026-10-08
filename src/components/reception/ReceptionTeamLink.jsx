import { useState } from 'react'
import { Copy, Link2 } from 'lucide-react'
import Button from '../ui/Button'
import Card from '../ui/Card'

export default function ReceptionTeamLink() {
  const [copyState, setCopyState] = useState('')
  const url = 'https://app.garagemsystem.com.br/reception/board'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopyState('Link copiado. Envie-o à equipe autorizada.')
    } catch {
      setCopyState('Não foi possível copiar automaticamente. Selecione o endereço acima para compartilhá-lo.')
    }
  }

  return <Card className="space-y-4 border-copper/30 bg-copper/5 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-copper/40 bg-copper/10 text-copper"><Link2 size={19} /></span>
      <div>
        <h2 className="text-h3 text-warm-white">Link da equipe para o balcão</h2>
        <p className="mt-1 text-body-sm text-steel">Endereço de produção para compartilhar com quem tem acesso à recepção. Cada pessoa entra com o próprio login; o link não libera acesso por si só.</p>
      </div>
    </div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 select-all break-all rounded-sm border border-line bg-surface-0 px-3 py-3 text-body-sm text-copper">{url}</code>
      <Button type="button" size="sm" variant="secondary" onClick={copyLink}><Copy size={16} /> Copiar link</Button>
    </div>
    {copyState && <p role="status" className="text-body-sm text-steel">{copyState}</p>}
  </Card>
}
