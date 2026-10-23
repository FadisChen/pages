// Service worker for 人生籤 Life Lottery: makes the game playable offline.
//
// Scope is limited to this folder (registered as ./sw.js). Cache names start with "lifelottery-" and
// only caches with that prefix are ever deleted, so other pages on the same origin are never touched.
//
// Strategy: precache the whole game at install; afterwards network-first for same-origin GETs
// (always the freshest code when online), falling back to the cache when offline.
// Bump CACHE_VERSION whenever the list of files changes.

const CACHE_PREFIX = 'lifelottery-';
const CACHE_VERSION = 'v3';
const CACHE = CACHE_PREFIX + CACHE_VERSION;

const PRECACHE = [
  './',
  'css/style.css',
  'icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon-maskable.svg',
  'index.html',
  'js/data/causes.js',
  'js/data/conditions.js',
  'js/data/countries.js',
  'js/data/eras.js',
  'js/data/events/adult_family.js',
  'js/data/events/adult_work.js',
  'js/data/events/aging.js',
  'js/data/events/childhood.js',
  'js/data/events/health.js',
  'js/data/events/index.js',
  'js/data/events/migration.js',
  'js/data/events/regional.js',
  'js/data/events/seed.js',
  'js/data/events/world.js',
  'js/data/events/youth.js',
  'js/data/names.js',
  'js/data/riskref.js',
  'js/data/yearly.js',
  'js/engine/birth.js',
  'js/engine/events.js',
  'js/engine/helpers.js',
  'js/engine/life.js',
  'js/engine/mortality.js',
  'js/engine/rng.js',
  'js/engine/summary.js',
  'js/engine/systems.js',
  'js/main.js',
  'js/storage.js',
  'js/strings.js',
  'js/theme-init.js',
  'js/ui/chart.js',
  'js/ui/dom.js',
  'js/ui/pacing.js',
  'js/ui/review.js',
  'js/ui/screens/about.js',
  'js/ui/screens/album.js',
  'js/ui/screens/death.js',
  'js/ui/screens/landing.js',
  'js/ui/screens/life.js',
  'js/ui/screens/lottery.js',
  'js/ui/screens/setup.js',
  'js/ui/screens/summary.js',
  'js/ui/session.js',
  'js/ui/sharecard.js',
  'js/ui/ticker.js',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One missing file (for example an event file still being written) must not break the install.
    await Promise.all(PRECACHE.map(async (path) => {
      try {
        const res = await fetch(new Request(path, { cache: 'reload' }));
        if (res.ok) await cache.put(new URL(path, self.registration.scope).href, res);
      } catch (e) { /* offline during install: runtime caching will fill in later */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match(new URL('./', self.registration.scope).href) || await cache.match(new URL('index.html', self.registration.scope).href);
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
