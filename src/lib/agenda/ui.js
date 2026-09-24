const STATUS = {
  pendente: { label: 'Pendente', variant: 'warning' },
  confirmado: { label: 'Confirmado', variant: 'info' },
  encaixe: { label: 'Encaixe', variant: 'info' },
  em_atendimento: { label: 'Em atendimento', variant: 'warning' },
  aguardando_pagamento: { label: 'Aguardando cobrança', variant: 'info' },
  concluido: { label: 'Concluído', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'danger' },
}

const ERROR_MESSAGES = {
  AGENDA_ADMIN_NAO_AUTORIZADO: 'Seu usuário não possui permissão para consultar a agenda geral.',
  AGENDA_BARBEIRO_NAO_AUTORIZADO: 'Este acesso não pertence a um barbeiro.',
  AGENDA_BARBEIRO_INATIVO_OU_NAO_VINCULADO: 'Seu acesso à agenda está inativo. Fale com o administrador da barbearia.',
  AGENDA_AGENDAMENTO_NAO_ENCONTRADO: 'Este horário não foi encontrado na sua agenda.',
  AGENDA_STATUS_ALTERADO: 'O atendimento foi atualizado em outro dispositivo. A agenda será recarregada.',
  AGENDA_TRANSICAO_INVALIDA: 'Esta ação não está disponível para o estado atual do atendimento.',
  AGENDA_DATA_INVALIDA: 'Não foi possível abrir essa data.',
  AGENDA_PERIODO_INVALIDO: 'Não foi possível abrir esse período.',
  AGENDA_PERIODO_MUITO_LONGO: 'O período solicitado é maior que o limite da agenda.',
}

function dateFromKey(data) {
  const [year, month, day] = data.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function dataLocalKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function deslocarDataKey(data, dias) {
  const next = dateFromKey(data)
  next.setDate(next.getDate() + dias)
  return dataLocalKey(next)
}

export function intervaloAgenda(data, visualizacao) {
  const selected = dateFromKey(data)
  let start = new Date(selected)
  let end = new Date(selected)

  if (visualizacao === 'semana') {
    const mondayOffset = (selected.getDay() + 6) % 7
    start.setDate(selected.getDate() - mondayOffset)
    end = new Date(start)
    end.setDate(start.getDate() + 6)
  } else if (visualizacao === 'mes') {
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1)
    const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0)
    const firstOffset = (first.getDay() + 6) % 7
    start = new Date(first)
    start.setDate(first.getDate() - firstOffset)
    const lastOffset = (7 - ((last.getDay() + 6) % 7) - 1) % 7
    end = new Date(last)
    end.setDate(last.getDate() + lastOffset)
  }

  const days = []
  const cursor = new Date(start)
  while (cursor <= end) {
    days.push(dataLocalKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return { start: dataLocalKey(start), end: dataLocalKey(end), days }
}

export function deslocarVisualizacao(data, visualizacao, direcao) {
  if (visualizacao === 'dia') return deslocarDataKey(data, direcao)
  if (visualizacao === 'semana') return deslocarDataKey(data, direcao * 7)
  const selected = dateFromKey(data)
  return dataLocalKey(new Date(selected.getFullYear(), selected.getMonth() + direcao, 1))
}

export function dataHoraLocalKey(value) {
  return dataLocalKey(new Date(value))
}

export function rotuloPeriodoAgenda(data, visualizacao) {
  const selected = dateFromKey(data)
  if (visualizacao === 'dia') return formatarDataAgenda(data)
  if (visualizacao === 'mes') {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(selected)
  }
  const range = intervaloAgenda(data, 'semana')
  const start = dateFromKey(range.start)
  const end = dateFromKey(range.end)
  const startLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: start.getMonth() === end.getMonth() ? undefined : 'short' }).format(start)
  const endLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(end)
  return `${startLabel} – ${endLabel}`
}

export function formatarDataAgenda(data) {
  const [year, month, day] = data.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(year, month - 1, day))
}

export function statusAgenda(status) {
  return STATUS[status] ?? { label: 'Desconhecido', variant: 'neutral' }
}

export function acaoPrincipalAgenda(status) {
  if (['pendente', 'confirmado', 'encaixe'].includes(status)) {
    return { label: 'Iniciar atendimento', nextStatus: 'em_atendimento' }
  }
  if (status === 'em_atendimento') {
    return { label: 'Concluir atendimento', nextStatus: 'concluido' }
  }
  return null
}

export function resumoAgenda(rows) {
  return {
    total: rows.filter((row) => row.status !== 'cancelado').length,
    restantes: rows.filter((row) => !['aguardando_pagamento', 'concluido', 'cancelado'].includes(row.status)).length,
    concluidos: rows.filter((row) => row.status === 'concluido').length,
  }
}

export function mensagemErroAgenda(error) {
  const detail = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ')
  const code = Object.keys(ERROR_MESSAGES).find((key) => detail.includes(key))
  return ERROR_MESSAGES[code] ?? 'Não foi possível carregar a agenda. Verifique sua conexão e tente novamente.'
}
