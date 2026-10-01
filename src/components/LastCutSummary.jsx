import { useEffect, useState } from 'react'
import { Camera, ImagePlus, Scissors, Trash2 } from 'lucide-react'
import Button from './ui/Button'
import CutPhotoViewer from './CutPhotoViewer'
import {
  atualizarFotoMemoriaCorte, excluirFotoMemoriaCorte, mensagemErroCorte, obterUrlFotoCorte,
} from '../lib/clientes/cortes-api'
import { compactarFotoCorte } from '../lib/clientes/imagem'

export default function LastCutSummary({ cut, canManage = false, onPhotoChanged }) {
  const [photo, setPhoto] = useState({ path: '', url: '' })
  const [busy, setBusy] = useState(false)
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setPhoto({ path: '', url: '' })
    if (!cut?.foto_path) return undefined
    obterUrlFotoCorte(cut.foto_path)
      .then((url) => { if (active) setPhoto({ path: cut.foto_path, url: url ?? '' }) })
      .catch(() => {})
    return () => { active = false }
  }, [cut?.foto_path])

  if (!cut) return null
  const photoUrl = photo.path === cut.foto_path ? photo.url : ''

  async function selectPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setConfirmingRemoval(false)
    try {
      const imagem = await compactarFotoCorte(file)
      const nextCut = await atualizarFotoMemoriaCorte({ corteId: cut.id, clienteId: cut.cliente_id, imagem })
      await onPhotoChanged?.(nextCut)
    } catch (photoError) {
      setError(mensagemErroCorte(photoError))
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto() {
    setBusy(true)
    setError('')
    try {
      const nextCut = await excluirFotoMemoriaCorte(cut.id)
      setPhoto({ path: '', url: '' })
      setConfirmingRemoval(false)
      await onPhotoChanged?.(nextCut)
    } catch (photoError) {
      setError(mensagemErroCorte(photoError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-sm border border-info/30 bg-info/5 p-3">
      <div className="flex gap-3">
        {photoUrl ? <CutPhotoViewer src={photoUrl} alt="Último corte do cliente" thumbnailClassName="h-16 w-16" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-info"><Scissors size={18} /></div>}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-label text-info">ÚLTIMO CORTE {cut.foto_path && <Camera size={13} />}</p>
          <p className="mt-1 truncate text-body-sm font-semibold text-warm-white">{cut.estilo}</p>
          <p className="mt-1 line-clamp-2 text-body-sm text-steel">{[cut.pentes, cut.acabamento, cut.barba].filter(Boolean).join(' · ') || cut.observacoes || 'Sem detalhes adicionais'}</p>
        </div>
      </div>

      {canManage && <div className="mt-3 flex flex-wrap gap-2 border-t border-info/20 pt-3">
        <label className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-sm border border-line px-3 text-body-sm font-semibold text-steel hover:text-warm-white focus-within:ring-2 focus-within:ring-copper ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          <ImagePlus size={16} /> {cut.foto_path ? 'Trocar foto' : 'Adicionar foto'}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={selectPhoto} className="sr-only" disabled={busy} />
        </label>
        {cut.foto_path && !confirmingRemoval && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingRemoval(true)}><Trash2 size={15} /> Apagar foto</Button>}
        {confirmingRemoval && <div className="flex w-full flex-wrap items-center gap-2 rounded-sm border border-danger/30 bg-danger/5 p-2"><span className="mr-auto text-body-sm text-danger">Apagar esta foto definitivamente?</span><Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingRemoval(false)}>Voltar</Button><Button size="sm" variant="danger" loading={busy} onClick={removePhoto}>Apagar</Button></div>}
      </div>}
      {error && <p role="alert" className="mt-2 text-body-sm text-danger">{error}</p>}
    </div>
  )
}
