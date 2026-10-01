import test from 'node:test'
import assert from 'node:assert/strict'
import { MATERIAL_USAGE_PRESETS, montarMateriaisDoPreset } from '../src/lib/catalogo/presets.js'

test('modelos de uso vinculam materiais e quantidades editáveis ao serviço', () => {
  const materials = [
    { id: 'lamina', nome: 'Lâmina descartável' },
    { id: 'espuma', nome: 'Creme, gel ou espuma de barbear' },
    { id: 'navalhete', nome: 'Navalhete' },
  ]
  const links = montarMateriaisDoPreset(materials, 'barba')

  assert.equal(MATERIAL_USAGE_PRESETS.length, 5)
  assert.deepEqual(links.map((item) => item.material_id), ['lamina', 'espuma', 'navalhete'])
  assert.equal(links.find((item) => item.material_id === 'espuma').quantidade, 5)
  assert.match(links[0].observacao, /Sugestão inicial/)
})

test('modelo ignora material ausente ou desativado sem criar vínculo inválido', () => {
  assert.deepEqual(montarMateriaisDoPreset([], 'corte'), [])
  assert.deepEqual(montarMateriaisDoPreset([{ id: 'x', nome: 'Outro' }], 'inexistente'), [])
})
