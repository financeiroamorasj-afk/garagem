function normalizar(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}

export const MATERIAL_USAGE_PRESETS = [
  {
    id: 'corte',
    label: 'Corte',
    items: [
      ['Papel de pescoço', 1], ['Álcool 70%', 3], ['Desinfetante para instrumentos', 5],
      ['Toalha limpa', 1], ['Capa de corte', 1], ['Máquina de corte', 1],
      ['Máquina de acabamento', 1], ['Pente de corte', 1], ['Jogo de pentes graduados', 1],
      ['Tesoura de corte', 1], ['Borrifador de água', 1], ['Secador profissional', 1],
    ],
  },
  {
    id: 'barba',
    label: 'Barba',
    items: [
      ['Lâmina descartável', 1], ['Álcool 70%', 3], ['Desinfetante para instrumentos', 5],
      ['Creme, gel ou espuma de barbear', 5], ['Óleo pré-barba', 2],
      ['Balm ou loção pós-barba', 2], ['Óleo para barba', 1], ['Toalha limpa', 1],
      ['Navalhete', 1], ['Escova para barba', 1],
    ],
  },
  {
    id: 'combo',
    label: 'Corte + barba',
    items: [
      ['Lâmina descartável', 1], ['Papel de pescoço', 1], ['Álcool 70%', 5],
      ['Desinfetante para instrumentos', 8], ['Creme, gel ou espuma de barbear', 5],
      ['Óleo pré-barba', 2], ['Balm ou loção pós-barba', 2], ['Óleo para barba', 1],
      ['Toalha limpa', 1], ['Capa de corte', 1], ['Máquina de corte', 1],
      ['Máquina de acabamento', 1], ['Pente de corte', 1], ['Jogo de pentes graduados', 1],
      ['Tesoura de corte', 1], ['Navalhete', 1], ['Escova para barba', 1],
      ['Borrifador de água', 1], ['Secador profissional', 1],
    ],
  },
  {
    id: 'acabamento',
    label: 'Acabamento',
    items: [
      ['Lâmina descartável', 1], ['Papel de pescoço', 1], ['Álcool 70%', 3],
      ['Desinfetante para instrumentos', 3], ['Balm ou loção pós-barba', 1],
      ['Máquina de acabamento', 1], ['Navalhete', 1], ['Capa de corte', 1],
    ],
  },
  {
    id: 'lavagem',
    label: 'Lavagem e finalização',
    items: [
      ['Shampoo', 10], ['Condicionador', 10], ['Pomada ou cera modeladora', 2],
      ['Toalha limpa', 1], ['Pente de corte', 1], ['Secador profissional', 1],
    ],
  },
]

export function montarMateriaisDoPreset(materials, presetId) {
  const preset = MATERIAL_USAGE_PRESETS.find((item) => item.id === presetId)
  if (!preset) return []
  const byName = new Map(materials.map((material) => [normalizar(material.nome), material]))
  return preset.items.flatMap(([name, quantity]) => {
    const material = byName.get(normalizar(name))
    return material ? [{ material_id: material.id, quantidade: quantity, observacao: 'Sugestão inicial; ajuste ao protocolo da unidade.' }] : []
  })
}
