// =====================================================================
// Service worker de Al día
// - Guarda la app para que abra al instante y sin conexión
// - Recibe los avisos push y los muestra aunque la app esté cerrada
// Cambiá VERSION cada vez que publiques cambios.
// =====================================================================

const VERSION = 'al-dia-v3';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/estilos.css',
  'js/app.js', 'js/config.js', 'js/datos.js', 'js/fechas.js', 'js/parser.js',
  'js/notificaciones.js', 'js/acciones.js', 'js/vista-pendientes.js', 'js/vista-calendario.js', 'js/formularios.js', 'js/ui.js',
  'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Red primero para lo nuestro (así ves los cambios), caché si no hay señal
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r; })
        .catch(() => caches.match(e.request, { ignoreSearch: true })),
    );
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // Librería de Supabase: caché primero (la versión está fija)
    e.respondWith(
      caches.match(e.request).then((c) => c || fetch(e.request).then((r) => {
        const copia = r.clone(); caches.open(VERSION).then((ca) => ca.put(e.request, copia)); return r;
      })),
    );
  }
});

// ---------------------------------------------------------------------
// Push: llega desde la función "recordatorios" de Supabase
// ---------------------------------------------------------------------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Al día', {
    body: d.cuerpo || '',
    tag: d.tag || undefined,
    renotify: true,
    icon: 'iconos/icono-192.png',
    badge: 'iconos/icono-192.png',
    data: { item: d.item || null },
  }));
});

// Tocar la notificación abre la app directo en esa tarea
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const item = e.notification.data?.item;
  const destino = new URL(item ? `./?item=${item}` : './', self.registration.scope).href;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if (v.url.startsWith(self.registration.scope)) {
        await v.focus();
        v.postMessage({ tipo: 'abrir-item', item });
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});
