// GYM LAB: funciona sin conexión. Primero intenta la red (para ver los cambios) y si no hay, usa la copia guardada.
const CACHE = 'gymlab-v2';
const ARCHIVOS = [
  './', 'index.html', 'estilos.css', 'manifest.json', 'rutina.json',
  'sonido.js', 'temporizador.js', 'registro.js', 'graficos.js', 'app.js',
  'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/icono-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
