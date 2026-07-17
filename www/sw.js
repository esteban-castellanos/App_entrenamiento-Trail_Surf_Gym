const CACHE = 'esteban-training-v7';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

let restTimeoutId = null;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'scheduleRest') {
    if (restTimeoutId) clearTimeout(restTimeoutId);
    const delay = Math.max(0, data.endAt - Date.now());
    if (delay === 0) {
      maybeNotifyRestDone(data.label, data.notify);
      return;
    }
    restTimeoutId = setTimeout(() => {
      restTimeoutId = null;
      maybeNotifyRestDone(data.label, data.notify);
    }, delay);
  }
  if (data.type === 'cancelRest') {
    if (restTimeoutId) clearTimeout(restTimeoutId);
    restTimeoutId = null;
  }
});

function maybeNotifyRestDone(label, notify) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    list.forEach((c) => c.postMessage({ type: 'restDone' }));
    const appVisible = list.some((c) => c.visibilityState === 'visible');
    if (!notify || appVisible) return;
    return self.registration.showNotification('⏱ Descanso terminado', {
      body: label || 'Siguiente serie',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'rest-timer',
      renotify: true,
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length) return list[0].focus();
      return clients.openWindow('./index.html');
    })
  );
});
