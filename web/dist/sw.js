// Pexli Airdrop service worker — makes the site installable as a PWA and gives
// an offline fallback, WITHOUT ever trapping the user on stale assets.
//
// Strategy: NETWORK-FIRST for everything on the same origin (always fetch the
// freshest HTML/CSS/JS when online), and fall back to the cache only when the
// network is unavailable. Cross-origin requests (RPC, Firebase, X) are never
// touched. Bumping CACHE drops all previously cached files on activate.
const CACHE = "pexli-app-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave RPC/Firebase/X alone

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache a fresh copy of successful same-origin responses for offline use.
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        // Offline: serve the cached asset, or the cached app shell for a page nav.
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") return caches.match("/");
        throw new Error("offline and not cached");
      }),
  );
});
