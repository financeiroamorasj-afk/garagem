import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAdminAccess } from '../src/lib/auth/adminAccess.js'

test('resolve os quatro estados de autorização administrativa com negação por padrão', () => {
  assert.equal(resolveAdminAccess({ loading: true }), 'loading')
  assert.equal(resolveAdminAccess({ loading: false, session: null }), 'signed_out')
  assert.equal(resolveAdminAccess({ loading: false, session: {}, profile: null }), 'denied')
  assert.equal(resolveAdminAccess({ loading: false, session: {}, profile: { role: 'barbeiro' } }), 'denied')
  assert.equal(resolveAdminAccess({ loading: false, session: {}, profile: { role: 'admin' } }), 'allowed')
  assert.equal(resolveAdminAccess({ loading: false, session: {}, profile: { role: 'master' } }), 'allowed')
})
