// Service worker do Plano de Leitura da Biblia.
//
// Estrategia: rede primeiro, cache como rede de seguranca. Assim um deploy
// novo aparece na proxima abertura com internet, e sem internet o app ainda
// abre com a ultima versao guardada.
//
// Chamadas ao Supabase e ao CDN NAO passam por aqui: sao de outra origem e
// seguem direto para a rede. Progresso desatualizado e pior que erro de rede.

const CACHE = 'plano-biblia-v1';
const ESSENCIAIS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ESSENCIAIS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((achado) => achado || caches.match('./index.html')))
  );
});
