self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  const { title, body, conversationId, type } = data;

  const options = {
    body: body || 'Nuevo mensaje',
    icon: '/favicon.ico',
    tag: conversationId,
    renotify: type === 'call',
    data: { conversationId, type },
  };

  event.waitUntil(self.registration.showNotification(title || 'Messenger', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { conversationId } = event.notification.data || {};
  if (!conversationId) return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const url = `/chat/${conversationId}`;
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
