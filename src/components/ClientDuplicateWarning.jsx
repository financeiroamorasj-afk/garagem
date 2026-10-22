import { AlertTriangle, UserRound } from 'lucide-react'
import Button from './ui/Button'

function digits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizedName(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function possibleClientDuplicates(clients, { nome, telefone }) {
  const phone = digits(telefone)
  const name = normalizedName(nome)
  return (clients ?? [])
    .map((client) => {
      const samePhone = phone.length >= 8 && digits(client.telefone) === phone
      const sameName = name.length >= 2 && normalizedName(client.nome) === name
      return { client, samePhone, sameName, score: samePhone ? 2 : sameName ? 1 : 0 }
    })
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, 3)
}

export default function ClientDuplicateWarning({ clients, nome, telefone, onSelect }) {
  const matches = possibleClientDuplicates(clients, { nome, telefone })
  if (matches.length === 0) return null

  return (
    <aside className="rounded-sm border border-warning/35 bg-warning/10 p-3" aria-label="Possíveis cadastros existentes">
      <div className="flex gap-2 text-body-sm text-warning"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><div><strong>Este cliente pode já estar cadastrado.</strong><p className="mt-1 text-steel">Confira antes de criar outra ficha. Nomes iguais continuam permitidos.</p></div></div>
      <div className="mt-3 space-y-2">{matches.map(({ client, samePhone }) => <div key={client.id} className="flex items-center gap-3 rounded-sm border border-line bg-surface-1 p-2"><UserRound size={17} className="shrink-0 text-copper" /><div className="min-w-0 flex-1"><p className="truncate text-body-sm font-semibold text-warm-white">{client.nome}</p><p className="truncate text-xs text-steel">{client.telefone || 'Sem telefone'}{samePhone ? ' · mesmo telefone' : ''}</p></div><Button type="button" size="sm" variant="secondary" onClick={() => onSelect(client)}>Usar este</Button></div>)}</div>
    </aside>
  )
}
