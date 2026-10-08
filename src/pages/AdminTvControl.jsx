import TvControlPanel from '../components/tv/TvControlPanel'

export default function AdminTvControl() {
  return <div className="mx-auto max-w-5xl space-y-6"><div><span className="text-label text-copper">OPERAÇÃO DA EQUIPE</span><h1 className="mt-2 text-h1 text-warm-white">Modo TV</h1><p className="mt-2 text-body-sm text-steel">Conecte aparelhos, escolha o vídeo e defina quem da equipe pode controlar a programação.</p></div><TvControlPanel manager /></div>
}
