import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MonitorPlay, RefreshCw, ShieldCheck, Trash2, Youtube } from 'lucide-react'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Spinner from '../ui/Spinner'
import {
  confirmarPareamentoTv, definirPermissaoTv, definirVideoTv, identificarYoutube,
  listarAparelhosTv, listarPermissoesTv, mensagemErroTv, revogarAparelhoTv, youtubeUrl,
} from '../../lib/tv/api'

export default function TvControlPanel({ manager = false }) {
  const [devices, setDevices] = useState([])
  const [operators, setOperators] = useState([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('TV da recepção')
  const [selectedId, setSelectedId] = useState('')
  const [videoInput, setVideoInput] = useState('')
  const [mode, setMode] = useState('split')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [nextDevices, nextOperators] = await Promise.all([
        listarAparelhosTv(),
        manager ? listarPermissoesTv() : Promise.resolve([]),
      ])
      setDevices(nextDevices || [])
      setOperators(nextOperators || [])
      setSelectedId((current) => nextDevices?.some((item) => item.id === current) ? current : nextDevices?.[0]?.id || '')
      setError('')
    } catch (loadError) {
      setError(mensagemErroTv(loadError))
    } finally { setLoading(false) }
  }, [manager])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const selected = devices.find((device) => device.id === selectedId)
    setVideoInput(selected ? youtubeUrl(selected.video_id, selected.playlist_id) : '')
    setMode(selected?.modo_video || 'split')
  }, [devices, selectedId])

  async function run(action, success) {
    setBusy(true); setError(''); setNotice('')
    try {
      await action()
      await load()
      setNotice(success)
      return true
    } catch (actionError) { setError(actionError instanceof TypeError ? actionError.message : mensagemErroTv(actionError)) }
    finally { setBusy(false) }
    return false
  }

  async function pair(event) {
    event.preventDefault()
    if (await run(() => confirmarPareamentoTv(code.trim().toUpperCase(), name.trim()), 'TV conectada. Ela deve abrir a agenda em instantes.')) setCode('')
  }

  async function saveVideo(event) {
    event.preventDefault()
    await run(async () => {
      const { videoId, playlistId } = identificarYoutube(videoInput)
      await definirVideoTv(selectedId, videoId, playlistId, mode)
    }, videoInput.trim() ? 'Vídeo enviado para a TV.' : 'TV configurada para mostrar somente a agenda.')
  }

  return <section aria-labelledby="tv-control-title" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="tv-control-title" className="flex items-center gap-2 text-h2 text-warm-white"><MonitorPlay size={21} className="text-copper" /> Modo TV</h2><p className="mt-1 text-body-sm text-steel">Conecte a tela e controle o YouTube pelo celular.</p></div>
      <Button size="sm" variant="secondary" onClick={load} disabled={loading || busy}><RefreshCw size={16} /> Atualizar</Button>
    </div>
    {error && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-sm border border-success/40 bg-success/10 p-3 text-body-sm text-success">{notice}</p>}
    {loading ? <Card className="flex min-h-28 items-center justify-center gap-2 text-steel"><Spinner size={20} /> Carregando TVs</Card> : <>
      {manager && <Card className="space-y-4 p-5">
        <div><h3 className="text-h3 text-warm-white">Conectar uma TV</h3><p className="mt-1 text-body-sm text-steel">Abra <strong>app.garagemsystem.com.br/tv</strong> na televisão e digite aqui o código exibido.</p></div>
        <form onSubmit={pair} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-label text-steel">CÓDIGO DA TV<input required value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,8))} maxLength={8} placeholder="A1B2C3D4" className="mt-2 h-11 w-full rounded-sm border border-line-strong bg-surface-0 px-3 font-mono text-body text-warm-white" /></label>
          <label className="text-label text-steel">NOME DO APARELHO<input required value={name} onChange={(event) => setName(event.target.value)} maxLength={60} className="mt-2 h-11 w-full rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white" /></label>
          <Button type="submit" loading={busy} disabled={code.length !== 8}>Conectar</Button>
        </form>
      </Card>}

      <Card className="space-y-4 p-5">
        <div><h3 className="text-h3 text-warm-white">Vídeo nas TVs</h3><p className="mt-1 text-body-sm text-steel">O link enviado por aqui aparece na TV conectada. Cole um vídeo ou playlist.</p></div>
        {devices.length === 0 ? <p className="text-body-sm text-steel">Nenhuma TV conectada{manager ? '. Abra o endereço acima na TV para começar.' : ' ou sua conta ainda não foi habilitada pelo dono.'}</p> : <>
          <label className="block text-label text-steel">ESCOLHA A TV<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 h-11 w-full rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white">{devices.map((device) => <option key={device.id} value={device.id}>{device.nome}</option>)}</select></label>
          <form onSubmit={saveVideo} className="space-y-3">
            <label className="block text-label text-steel">LINK DO YOUTUBE<input type="url" value={videoInput} onChange={(event) => setVideoInput(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="mt-2 h-11 w-full rounded-sm border border-line-strong bg-surface-0 px-3 text-body text-warm-white" /></label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-sm border border-line p-3 text-body-sm text-warm-white"><input type="radio" checked={mode === 'split'} onChange={() => setMode('split')} /> Tela dividida</label>
              <label className="flex items-center gap-2 rounded-sm border border-line p-3 text-body-sm text-warm-white"><input type="radio" checked={mode === 'smart'} onChange={() => setMode('smart')} /> Alternância inteligente</label>
            </div>
            <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy}><Youtube size={17} /> Enviar para TV</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => run(() => definirVideoTv(selectedId, null, null, mode), 'TV configurada para mostrar somente a agenda.')}>Somente agenda</Button></div>
          </form>
          {manager && <div className="border-t border-line pt-4"><Button variant="danger" size="sm" disabled={busy} onClick={() => { if (window.confirm('Desconectar esta TV? Ela perderá o acesso à agenda.')) run(() => revogarAparelhoTv(selectedId), 'TV desconectada.') }}><Trash2 size={16} /> Desconectar TV</Button></div>}
        </>}
      </Card>

      {manager && <Card className="space-y-4 p-5">
        <div><h3 className="flex items-center gap-2 text-h3 text-warm-white"><ShieldCheck size={19} className="text-copper" /> Permissão da equipe</h3><p className="mt-1 text-body-sm text-steel">Barbeiros habilitados podem trocar o YouTube, mas não conectar nem desconectar TVs.</p></div>
        {operators.length === 0 ? <p className="text-body-sm text-steel">Nenhum barbeiro ativo cadastrado.</p> : <div className="divide-y divide-line">{operators.map((operator) => <label key={operator.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-body-sm text-warm-white"><span>{operator.nome}</span><input type="checkbox" checked={operator.permitido} disabled={busy} onChange={(event) => run(() => definirPermissaoTv(operator.id, event.target.checked), 'Permissão atualizada.')} className="h-5 w-5 accent-copper" aria-label={`Permitir ${operator.nome} controlar vídeos`} /></label>)}</div>}
      </Card>}
    </>}
    {manager && <Link to="/admin/agenda/tv" className="text-body-sm text-copper underline">Abrir prévia da agenda neste aparelho</Link>}
  </section>
}
