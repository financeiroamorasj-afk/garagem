import test from 'node:test'
import assert from 'node:assert/strict'
import { settlementKeyFor } from '../src/lib/financeiro/settlementIntent.js'

test('retries da mesma intenção reutilizam a chave e nova intenção cria outra', () => {
  let sequence = 0
  const uuid = () => `uuid-${++sequence}`
  const first = settlementKeyFor(null, 'pagar', 'titulo-1', uuid)
  const retry = settlementKeyFor(first, 'pagar', 'titulo-1', uuid)
  const afterCancel = settlementKeyFor(null, 'pagar', 'titulo-1', uuid)
  const anotherTitle = settlementKeyFor(afterCancel, 'pagar', 'titulo-2', uuid)

  assert.equal(retry.key, first.key)
  assert.notEqual(afterCancel.key, first.key)
  assert.notEqual(anotherTitle.key, afterCancel.key)
})
