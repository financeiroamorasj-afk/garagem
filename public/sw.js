self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() || {} } catch { data = { body: event.data?.text() || '' } }

  event.waitUntil(self.registration.showNotification(data.title || 'Garagem System', {
    body: data.body || 'Sua agenda foi atualizada.',
    icon: '/garagem-symbol.png',
    badge: '/garagem-symbol.png',
    tag: data.tag || 'garagem-agenda',
    renotify: true,
    data: { url: data.url || '/login' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/login', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const current = windows.find((client) => client.url.startsWith(self.location.origin))
    if (current) {
      await current.focus()
      current.navigate(target)
      return
    }
    await self.clients.openWindow(target)
  })())
})
