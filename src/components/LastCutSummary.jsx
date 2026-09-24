import { useEffect, useState } from 'react'
import { Camera, Scissors } from 'lucide-react'
import { obterUrlFotoCorte } from '../lib/clientes/cortes-api'

export default function LastCutSummary({ cut }) {
  const [photo, setPhoto] = useState({ path: '', url: '' })
  useEffect(() => {
    let active = true
    if (!cut?.foto_path) return undefined
    obterUrlFotoCorte(cut.foto_path).then((url) => { if (active) setPhoto({ path: cut.foto_path, url: url ?? '' }) }).catch(() => {})
    return () => { active = false }
  }, [cut?.foto_path])

  if (!cut) return null
  const photoUrl = photo.path === cut.foto_path ? photo.url : ''
  return (
    <div className="mt-3 flex gap-3 rounded-sm border border-info/30 bg-info/5 p-3">
      {photoUrl ? <img src={photoUrl} alt="Último corte do cliente" className="h-16 w-16 shrink-0 rounded-sm object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-info"><Scissors size={18} /></div>}
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-label text-info">ÚLTIMO CORTE {cut.foto_path && <Camera size={13} />}</p>
        <p className="mt-1 truncate text-body-sm font-semibold text-warm-white">{cut.estilo}</p>
        <p className="mt-1 line-clamp-2 text-body-sm text-steel">{[cut.pentes, cut.acabamento, cut.barba].filter(Boolean).join(' · ') || cut.observacoes || 'Sem detalhes adicionais'}</p>
      </div>
    </div>
  )
}
