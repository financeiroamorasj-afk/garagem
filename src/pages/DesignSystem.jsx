/**
 * DesignSystem — vitrine viva dos tokens e primitivos, sobre o fundo real do app.
 * Página de revisão visual antes de qualquer /ds-migrar. Rota: /design-system.
 */
import { useState } from 'react'
import { AlertTriangle, History, Inbox, ReceiptText, Search, WalletCards } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Label from '../components/ui/Label'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import DataTable from '../components/ui/DataTable'
import Tabs from '../components/ui/Tabs'
import PeriodSelector from '../components/ui/PeriodSelector'
import CurrencyInput from '../components/ui/CurrencyInput'
import FinancialChart from '../components/ui/FinancialChart'

const DEMO_LANCAMENTOS = [
  { id: 1, data: '12/08/2026', descricao: 'Demonstração — Serviço', tipo: 'Entrada', valor: 'R$ 180,00', status: 'Pago' },
  { id: 2, data: '13/08/2026', descricao: 'Demonstração — Insumos', tipo: 'Saída', valor: 'R$ 64,90', status: 'Pendente' },
  { id: 3, data: '14/08/2026', descricao: 'Demonstração — Produto', tipo: 'Entrada', valor: 'R$ 92,00', status: 'Pago' },
]

const DEMO_COLUMNS = [
  { key: 'data', header: 'Data', dataType: true },
  { key: 'descricao', header: 'Descrição' },
  { key: 'tipo', header: 'Tipo' },
  { key: 'valor', header: 'Valor', dataType: true, align: 'right' },
  { key: 'status', header: 'Status', render: (value) => <Badge variant={value === 'Pago' ? 'success' : 'warning'}>{value}</Badge> },
]

const DEMO_CHART = [
  { label: 'Mai', value: 8200, status: 'positive' },
  { label: 'Jun', value: 6100, status: 'warning' },
  { label: 'Jul', value: 3400, status: 'negative' },
  { label: 'Ago', value: 9200, status: 'positive' },
]

const formatDemoCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)

const formatEnvelopeCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value)

const DEMO_ENVELOPES = [
  { id: 'impostos', nome: 'Impostos', finalidade: 'Impostos', conta: 'Conta principal', percentual: '18%', saldo: 4320, saldoBancario: 24000, status: 'Disponível', variant: 'success' },
  { id: 'reinvestimento', nome: 'Reinvestimento', finalidade: 'Reinvestimento', conta: 'Conta principal', percentual: '12%', saldo: 8800, saldoBancario: 10000, status: 'Atenção', variant: 'warning' },
  { id: 'equipamentos', nome: 'Equipamentos', finalidade: 'Reserva', conta: 'Conta principal', percentual: '0%', saldo: 0, saldoBancario: 0, status: 'Sem saldo', variant: 'neutral' },
  { id: 'socios', nome: 'Distribuição de sócios', finalidade: 'Sócios', conta: 'Conta de liquidez', percentual: '20%', saldo: 1600, saldoBancario: 8000, status: 'Inativo', variant: 'info' },
]

const DEMO_ENVELOPE_COLUMNS = [
  { key: 'nome', header: 'Envelope' },
  { key: 'finalidade', header: 'Finalidade' },
  { key: 'conta', header: 'Conta vinculada' },
  { key: 'percentual', header: 'Distribuição', dataType: true, align: 'right' },
  { key: 'saldo', header: 'Reservado', dataType: true, align: 'right', render: (value) => formatEnvelopeCurrency(value) },
  { key: 'status', header: 'Status', render: (value, row) => <Badge variant={row.variant}>{value}</Badge> },
]

const DEMO_EXTRATO_COLUMNS = [
  { key: 'data', header: 'Data BRT', dataType: true },
  { key: 'evento', header: 'Evento' },
  { key: 'direcao', header: 'Direção', render: (value) => <Badge variant={value === 'Crédito' ? 'success' : 'warning'}>{value}</Badge> },
  { key: 'valor', header: 'Valor', dataType: true, align: 'right', render: (value) => formatEnvelopeCurrency(value) },
  { key: 'saldoApos', header: 'Saldo após', dataType: true, align: 'right', render: (value) => formatEnvelopeCurrency(value) },
]

function buildDemoStatement(envelope) {
  const amount = Math.max(Math.min(envelope.saldo || 200, 600), 200)
  return [
    { id: `${envelope.id}-1`, data: '22/08/2026', evento: 'Distribuição diária', direcao: 'Crédito', valor: amount, saldoApos: envelope.saldo + amount },
    { id: `${envelope.id}-2`, data: '23/08/2026', evento: 'Resgate / uso', direcao: 'Débito', valor: amount, saldoApos: envelope.saldo },
    { id: `${envelope.id}-3`, data: '24/08/2026', evento: 'Estorno do resgate', direcao: 'Crédito', valor: amount, saldoApos: envelope.saldo + amount },
    { id: `${envelope.id}-4`, data: '25/08/2026', evento: 'Resgate / uso', direcao: 'Débito', valor: amount, saldoApos: envelope.saldo },
  ]
}

function ReserveMeter({ bankBalance, reserved, label }) {
  const available = bankBalance - reserved
  const percentage = bankBalance > 0 ? (reserved / bankBalance) * 100 : reserved > 0 ? 100 : 0
  const visualPercentage = Math.min(Math.max(percentage, 0), 100)
  const isExceeded = reserved > bankBalance
  const isAttention = !isExceeded && percentage >= 75
  const tone = isExceeded ? 'bg-danger' : isAttention ? 'bg-warning' : 'bg-success'
  const state = isExceeded ? 'Reserva acima do saldo bancário' : isAttention ? 'Atenção: reserva elevada' : bankBalance === 0 ? 'Sem saldo bancário' : 'Reserva dentro do saldo bancário'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body font-semibold text-warm-white">{label}</p>
        <p className="text-data text-steel">{percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% reservado</p>
      </div>
      <div
        role="progressbar"
        aria-label={`Proporção reservada em ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(visualPercentage)}
        aria-valuetext={`${formatEnvelopeCurrency(reserved)} reservados de ${formatEnvelopeCurrency(bankBalance)}; ${formatEnvelopeCurrency(available)} disponíveis. ${state}.`}
        className="h-3 overflow-hidden rounded-sm border border-line-strong bg-surface-2"
      >
        <div className={`h-full ${tone}`} style={{ width: `${visualPercentage}%` }} />
      </div>
      <div className="grid grid-cols-1 gap-2 text-data">
        <span className="text-steel">Bancário: <strong className="font-medium text-warm-white">{formatEnvelopeCurrency(bankBalance)}</strong></span>
        <span className="text-steel">Reservado: <strong className="font-medium text-warm-white">{formatEnvelopeCurrency(reserved)}</strong></span>
        <span className="text-steel">Disponível: <strong className={available < 0 ? 'font-medium text-danger' : 'font-medium text-warm-white'}>{formatEnvelopeCurrency(available)}</strong></span>
      </div>
      <p className={`text-body-sm ${isExceeded ? 'text-danger' : isAttention ? 'text-warning' : 'text-steel'}`}>
        {state}. O estado também está descrito em texto e não depende apenas da cor.
      </p>
    </div>
  )
}

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
  const [activeFinanceTab, setActiveFinanceTab] = useState('resumo')
  const [period, setPeriod] = useState('month')
  const [customRange, setCustomRange] = useState({ start: '2026-08-01', end: '2026-08-31' })
  const [currencyValue, setCurrencyValue] = useState(null)
  const [negativeCurrencyValue, setNegativeCurrencyValue] = useState(-1250)
  const [selectedEnvelope, setSelectedEnvelope] = useState(null)

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

      <Section title="Financeiro">
        <div className="mb-8 rounded-md border border-info bg-info/12 p-4">
          <p className="text-body text-info">Componentes em revisão — não conectados ao banco</p>
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <h3 className="mb-4 text-h3 text-warm-white">DataTable</h3>
            <DataTable
              caption="Lançamentos fictícios para demonstração visual"
              columns={DEMO_COLUMNS}
              rows={DEMO_LANCAMENTOS}
              renderAction={(row) => <Button size="sm" variant="ghost" aria-label={`Ver ${row.descricao}`}>Ver</Button>}
            />
          </div>

          <div>
            <h3 className="mb-4 text-h3 text-warm-white">Tabs</h3>
            <Tabs
              label="Demonstração de áreas financeiras"
              value={activeFinanceTab}
              onValueChange={setActiveFinanceTab}
              items={[
                { value: 'resumo', label: 'Resumo', content: <p className="text-body text-steel">Painel de demonstração visual do resumo.</p> },
                { value: 'receitas', label: 'Receitas', content: <p className="text-body text-steel">Painel de demonstração visual das receitas.</p> },
                { value: 'despesas', label: 'Despesas', content: <p className="text-body text-steel">Painel de demonstração visual das despesas.</p> },
              ]}
            />
          </div>

          <div>
            <h3 className="mb-4 text-h3 text-warm-white">PeriodSelector</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <PeriodSelector value={period} onChange={setPeriod} onApply={() => {}} />
              <PeriodSelector value="custom" onChange={() => {}} customStart={customRange.start} customEnd={customRange.end} onCustomRangeChange={setCustomRange} onApply={() => {}} />
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-h3 text-warm-white">CurrencyInput</h3>
            <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
              <CurrencyInput label="Valor demonstrativo" value={currencyValue} onValueChange={setCurrencyValue} />
              <CurrencyInput label="Saldo negativo permitido" value={negativeCurrencyValue} onValueChange={setNegativeCurrencyValue} allowNegative helpText="Digite apenas algarismos; use o sinal de menos para saldo devedor." />
              <CurrencyInput label="Valor com erro" value={0} onValueChange={() => {}} error="O valor deve ser maior que zero." />
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-h3 text-warm-white">FinancialChart</h3>
            <FinancialChart
              title="Fluxo demonstrativo"
              summary="Valores fictícios usados somente para revisar hierarquia, legenda e acessibilidade."
              data={DEMO_CHART}
              formatValue={formatDemoCurrency}
            />
          </div>
        </div>
      </Section>

      <Section title="Envelopes financeiros — demonstração visual">
        <div className="mb-8 rounded-md border border-info bg-info/12 p-4" role="note">
          <p className="text-label text-info">Demonstração — dados fictícios</p>
          <p className="mt-2 text-body text-warm-white">
            Envelope é uma reserva lógica vinculada a uma conta bancária. Distribuir ou resgatar muda a reserva, mas não cria uma segunda movimentação bancária.
          </p>
        </div>

        <div className="flex flex-col gap-8">
          <Card>
            <Card.Header title="Conta principal" action={<Badge variant="info">Demonstração</Badge>} />
            <Card.Body>
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-label text-steel">Saldo bancário</p>
                  <p className="mt-2 text-data-lg text-warm-white">R$ 24.000,00</p>
                </div>
                <div>
                  <p className="text-label text-steel">Reservado em envelopes</p>
                  <p className="mt-2 text-data-lg text-warning">R$ 7.200,00</p>
                </div>
                <div>
                  <p className="text-label text-steel">Saldo disponível</p>
                  <p className="mt-2 text-data-lg text-success">R$ 16.800,00</p>
                </div>
              </div>
              <p className="mt-6 border-t border-line pt-4 text-body text-steel">
                A reserva reduz somente o saldo disponível. O saldo bancário real continua em R$ 24.000,00 até que exista uma movimentação bancária efetiva.
              </p>
            </Card.Body>
          </Card>

          <div aria-labelledby="envelope-cards-title">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="envelope-cards-title" className="text-h3 text-warm-white">Reservas por propósito</h3>
                <p className="mt-2 text-body text-steel">Cards demonstrativos; nenhuma ação altera dados.</p>
              </div>
              <Button disabled><WalletCards size={16} aria-hidden="true" />Distribuir lucro diário</Button>
            </div>

            <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {DEMO_ENVELOPES.map((envelope) => (
                <Card
                  key={envelope.id}
                  className="flex h-full flex-col"
                  aria-labelledby={`envelope-${envelope.id}-title`}
                >
                  <Card.Body className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <WalletCards size={20} className="mt-1 shrink-0 text-copper" aria-hidden="true" />
                        <div className="min-w-0">
                          <h4 id={`envelope-${envelope.id}-title`} className="text-h3 text-warm-white">{envelope.nome}</h4>
                          <p className="mt-1 text-body-sm text-steel">{envelope.finalidade}</p>
                        </div>
                      </div>
                      <Badge variant={envelope.variant}>{envelope.percentual}</Badge>
                    </div>

                    <p className="mt-4 text-body-sm text-steel">Conta vinculada: {envelope.conta}</p>
                    <div className="mt-6">
                      <p className="text-label text-steel">Saldo reservado</p>
                      <p className="mt-2 text-data-lg text-warm-white">{formatEnvelopeCurrency(envelope.saldo)}</p>
                    </div>

                    <div className="mt-6 border-t border-line pt-4">
                      <ReserveMeter label={`Uso de ${envelope.nome}`} bankBalance={envelope.saldoBancario} reserved={envelope.saldo} />
                    </div>

                    <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
                      <span className="text-body-sm text-steel">Situação</span>
                      <Badge variant={envelope.variant}>{envelope.status}</Badge>
                    </div>

                    <div className="mt-auto flex flex-col gap-3 pt-6">
                      <Button variant="secondary" className="w-full" onClick={() => setSelectedEnvelope(envelope)}>
                        <History size={16} aria-hidden="true" />Ver extrato de {envelope.nome}
                      </Button>
                      <Button variant="ghost" className="w-full" disabled aria-describedby={`envelope-${envelope.id}-resgate-help`}>
                        <ReceiptText size={16} aria-hidden="true" />Usar / resgatar
                      </Button>
                      <p id={`envelope-${envelope.id}-resgate-help`} className="text-body-sm text-steel">
                        Integração com contas a pagar virá em uma etapa posterior.
                      </p>
                    </div>
                  </Card.Body>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-h3 text-warm-white">Visão compacta</h3>
            <p className="mb-4 text-body text-steel">Consulta tabular secundária, sem ações primárias duplicadas.</p>
            <DataTable
              caption="Visão compacta dos envelopes financeiros fictícios"
              columns={DEMO_ENVELOPE_COLUMNS}
              rows={DEMO_ENVELOPES}
            />
          </div>

          <div>
            <h3 className="mb-4 text-h3 text-warm-white">Estados da interface</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <Card.Header title="Carregando" />
                <Card.Body className="flex min-h-32 items-center justify-center">
                  <span className="inline-flex items-center gap-3 text-body text-steel"><Spinner size={24} /> Carregando envelopes</span>
                </Card.Body>
              </Card>
              <Card role="alert" className="border-danger">
                <Card.Header title="Erro ao carregar" />
                <Card.Body className="flex gap-3">
                  <AlertTriangle size={20} className="shrink-0 text-danger" aria-hidden="true" />
                  <p className="text-body text-danger">Não foi possível carregar os envelopes. Tente novamente.</p>
                </Card.Body>
              </Card>
            </div>
            <div className="mt-4 rounded-md border border-line bg-surface-1">
              <EmptyState
                icon={Inbox}
                title="Nenhum envelope cadastrado"
                description="Quando houver envelopes, as reservas lógicas vinculadas às contas aparecerão aqui."
              />
            </div>
          </div>
        </div>

        <Modal
          open={Boolean(selectedEnvelope)}
          onClose={() => setSelectedEnvelope(null)}
          title={selectedEnvelope ? `Extrato demonstrativo — ${selectedEnvelope.nome}` : 'Extrato demonstrativo'}
          className="max-w-5xl"
          footer={<Button variant="secondary" onClick={() => setSelectedEnvelope(null)}>Fechar extrato</Button>}
        >
          {selectedEnvelope && (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-info bg-info/12 p-4" role="note">
                <p className="text-body text-info">Dados fictícios em BRT. Distribuição, resgate e estorno não representam uma segunda movimentação bancária.</p>
              </div>
              <DataTable
                caption={`Extrato demonstrativo do envelope ${selectedEnvelope.nome}`}
                columns={DEMO_EXTRATO_COLUMNS}
                rows={buildDemoStatement(selectedEnvelope)}
              />
            </div>
          )}
        </Modal>
      </Section>
    </div>
  )
}
