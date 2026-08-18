/**
 * DesignSystem — vitrine viva dos tokens e primitivos, sobre o fundo real do app.
 * Página de revisão visual antes de qualquer /ds-migrar. Rota: /design-system.
 */
import { useState } from 'react'
import { Search, Inbox } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Label from '../components/ui/Label'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'

const COLOR_GROUPS = [
  {
    title: 'Superfície',
    swatches: [
      { name: 'surface-0', hex: '#050505' },
      { name: 'surface-1', hex: '#0e0d0c' },
      { name: 'surface-2', hex: '#17150f' },
      { name: 'surface-3', hex: '#221e17' },
    ],
  },
  {
    title: 'Marca',
    swatches: [
      { name: 'copper', hex: '#c1793f' },
      { name: 'copper-light', hex: '#d08f56' },
      { name: 'gold-aged', hex: '#a68a52' },
    ],
  },
  {
    title: 'Texto',
    swatches: [
      { name: 'warm-white', hex: '#f2ece0' },
      { name: 'steel', hex: '#8b877d' },
    ],
  },
  {
    title: 'Semântica',
    swatches: [
      { name: 'success', hex: '#7ba05b' },
      { name: 'warning', hex: '#d9a03f' },
      { name: 'danger', hex: '#d4614a' },
      { name: 'info', hex: '#7e9aaf' },
    ],
  },
]

const TYPE_SCALE = [
  { className: 'text-display', label: 'display · 32px · Fraunces 600' },
  { className: 'text-h1', label: 'h1 · 24px · Fraunces 600' },
  { className: 'text-h2', label: 'h2 · 20px · Fraunces 600' },
  { className: 'text-h3', label: 'h3 · 16px · Space Grotesk 600' },
  { className: 'text-body', label: 'body · 14px · Space Grotesk 400' },
  { className: 'text-body-sm', label: 'body-sm · 13px · Space Grotesk 400' },
]

function Section({ title, children }) {
  return (
    <section className="mb-16">
      <h2 className="text-h2 text-warm-white mb-6 border-b border-line pb-3">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Swatch({ name, hex }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-16 w-full rounded-md border border-line"
        style={{ backgroundColor: hex }}
      />
      <p className="text-data text-warm-white">{name}</p>
      <p className="text-data text-steel">{hex}</p>
    </div>
  )
}

export default function DesignSystem() {
  const [modalOpen, setModalOpen] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-16">
        <p className="text-label text-copper mb-3">GARAGEM SYSTEM</p>
        <h1 className="text-display text-warm-white">Design System</h1>
        <p className="text-body text-steel mt-3 max-w-2xl">
          Tokens e primitivos da fundação — ver{' '}
          <code className="text-data text-copper">docs/design-system/DESIGN-SYSTEM.md</code>{' '}
          para a especificação completa.
        </p>
      </header>

      <Section title="Paleta">
        <div className="flex flex-col gap-10">
          {COLOR_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-label text-steel mb-4">{group.title}</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {group.swatches.map((swatch) => (
                  <Swatch key={swatch.name} {...swatch} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Escala tipográfica">
        <div className="flex flex-col gap-6">
          {TYPE_SCALE.map((item) => (
            <div key={item.className} className="flex flex-col gap-1">
              <p className={`${item.className} text-warm-white`}>
                O caderno anota. O sistema administra.
              </p>
              <p className="text-data text-steel">{item.label}</p>
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <p className="text-data-lg text-warm-white">R$ 12.480,00</p>
            <p className="text-data text-steel">data-lg · 24px · JetBrains Mono 500 · tabular-nums</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-data text-warm-white">14:30 · 3 cortes</p>
            <p className="text-data text-steel">data · 13px · JetBrains Mono 400 · tabular-nums</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-label text-warm-white">Label de destaque</p>
            <p className="text-data text-steel">label · 11px · JetBrains Mono 500 · uppercase</p>
          </div>
        </div>
      </Section>

      <Section title="Button">
        <div className="flex flex-col gap-6">
          {['primary', 'secondary', 'ghost', 'danger'].map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-4">
              <span className="text-data text-steel w-24 shrink-0 capitalize">{variant}</span>
              <Button variant={variant} size="sm">Pequeno</Button>
              <Button variant={variant} size="md">Médio</Button>
              <Button variant={variant} size="lg">Grande</Button>
              <Button variant={variant} disabled>Desabilitado</Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-data text-steel w-24 shrink-0">Loading</span>
            <Button loading={loadingDemo} onClick={() => setLoadingDemo((v) => !v)}>
              {loadingDemo ? 'Carregando' : 'Alternar loading'}
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Input">
        <div className="grid max-w-md gap-6">
          <Input label="Nome do cliente" placeholder="Ex: João Silva" />
          <Input label="Buscar" icon={Search} placeholder="Nome ou telefone" />
          <Input
            label="E-mail"
            defaultValue="contato@"
            error="E-mail inválido"
          />
          <Input
            label="Observações"
            helpText="Visível só para a equipe"
            placeholder="Prefere máquina 1, sem navalha"
          />
          <Input label="Desabilitado" disabled placeholder="Não editável" />
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <Card.Header title="Card padrão" />
            <Card.Body>
              <p className="text-body text-steel">
                Conteúdo livre dentro do Card.Body, com padding e borda do token.
              </p>
            </Card.Body>
          </Card>

          <Card clickable>
            <Card.Header
              title="Card clicável"
              action={<Button variant="ghost" size="sm">Ação</Button>}
            />
            <Card.Body>
              <p className="text-body text-steel">
                Hover na borda — passa de `line` para `line-strong`.
              </p>
            </Card.Body>
          </Card>

          <Card.Metric
            label="Faturamento do mês"
            value="R$ 18.240"
            badge={<Badge variant="success">+12%</Badge>}
          />
          <Card.Metric
            label="Comissões pendentes"
            value="R$ 2.180"
            badge={<Badge variant="warning">Pendente</Badge>}
          />
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap gap-3">
          <Badge>Neutro</Badge>
          <Badge variant="success">Pago</Badge>
          <Badge variant="warning">Pendente</Badge>
          <Badge variant="danger">Atrasado</Badge>
          <Badge variant="info">Informativo</Badge>
        </div>
      </Section>

      <Section title="Modal">
        <Button onClick={() => setModalOpen(true)}>Abrir modal</Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Excluir cliente"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                Excluir
              </Button>
            </>
          }
        >
          <p className="text-body text-steel">
            Tem certeza que deseja excluir este cliente? Essa ação não pode ser desfeita.
          </p>
        </Modal>
      </Section>

      <Section title="Label & Spinner">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 max-w-xs">
            <Label htmlFor="ds-standalone-label">Label autônomo</Label>
            <input
              id="ds-standalone-label"
              className="h-10 rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white"
            />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Spinner size={16} />
              <span className="text-data text-steel">16px</span>
            </div>
            <div className="flex items-center gap-2">
              <Spinner size={24} />
              <span className="text-data text-steel">24px</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="EmptyState">
        <div className="rounded-md border border-line">
          <EmptyState
            icon={Inbox}
            title="Nenhum agendamento hoje"
            description="A agenda está livre. Quando um cliente marcar, ele aparece aqui."
            action={<Button>Novo agendamento</Button>}
          />
        </div>
      </Section>

      <Section title="Atmosfera">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="relative h-40 overflow-hidden rounded-md border border-line">
            <div className="atmosphere-vignette absolute inset-0" />
            <p className="text-data text-steel absolute bottom-3 left-3">
              atmosphere-vignette
            </p>
          </div>
          <div className="relative h-40 overflow-hidden rounded-md border border-line bg-surface-1">
            <div className="surface-header-blur absolute inset-x-0 top-0 h-16" />
            <p className="text-data text-steel absolute bottom-3 left-3">
              surface-header-blur
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}
