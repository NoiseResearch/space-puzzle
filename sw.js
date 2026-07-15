/* Space Puzzle service worker
   Auto-update model (same as Space Blocks):
   To push an update, change SW_VERSION below (any byte change), and bump
   version.json "rev" and APP_REV in index.html to match. On the next open the
   new worker installs, re-caches everything fresh, and takes over; force-quit
   and reopen the installed app once to load the new version.                   */
const SW_VERSION = 'space-puzzle-v7';

const CORE = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SW_VERSION).then((c) => c.addAll(CORE).catch(() => {}))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Let the browser stream audio directly (supports HTTP range requests; never cache big MP3s).
  if (url.pathname.endsWith('.mp3')) return;

  // Always try the network first for version.json so update checks are fresh.
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || new Response('{"rev":0}', { headers: { 'Content-Type': 'application/json' } }))));
    return;
  }

  // Everything else: cache-first, then network (and cache same-origin successes).
  // Guarantees a Response is always returned — never resolves to undefined (fixes blank-page-on-slow-network).
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && url.origin === location.origin) {
        const cache = await caches.open(SW_VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (_) {
      if (req.mode === 'navigate') {
        const idx = await caches.match('./index.html');
        if (idx) return idx;
      }
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
