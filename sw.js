// ─── Cache version ──────────────────────────────────────────────────────────
// Bump this string any time you want all clients to pick up fresh copies.
const CACHE_SHELL    = "expense-tracker-shell-v9";   // app shell (HTML/CSS/JS)
const CACHE_CDN      = "expense-tracker-cdn-v9";     // third-party libraries

// App-shell files — cache-first, updated when the SW version bumps
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

// CDN libraries — immutable (versioned URLs), so one cache forever
const CDN_FILES = [
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"
];

// ─── Install: pre-cache shell + CDN libs ────────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const [shellCache, cdnCache] = await Promise.all([
      caches.open(CACHE_SHELL),
      caches.open(CACHE_CDN)
    ]);
    // Shell files — fail loudly so we know about broken assets
    await shellCache.addAll(SHELL_FILES).catch(err =>
      console.error("[SW] Shell precache failed:", err)
    );
    // CDN files — fail silently; they'll be fetched on demand if missing
    await Promise.allSettled(
      CDN_FILES.map(url =>
        cdnCache.match(url).then(hit => hit ? null : cdnCache.add(url))
      )
    );
  })());
  self.skipWaiting();
});

// ─── Activate: purge old caches + notify all clients of update ───────────────
self.addEventListener("activate", e => {
  const keep = new Set([CACHE_SHELL, CACHE_CDN]);
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k))))
      .then(async () => {
        // Tell every open tab that a new version is live
        const allClients = await self.clients.matchAll({ type: "window" });
        allClients.forEach(client => {
          client.postMessage({ type: "SW_UPDATED", version: CACHE_SHELL });
        });
      })
  );
  self.clients.claim();
});

// ─── Fetch strategy ──────────────────────────────────────────────────────────
self.addEventListener("fetch", e => {
  const url = e.request.url;

  // Firebase API calls — always network only (never cache Firestore data)
  if(
    url.includes("firestore.googleapis.com") ||
    url.includes("identitytoolkit.googleapis.com") ||
    url.includes("securetoken.googleapis.com") ||
    url.includes("firebase.googleapis.com")
  ){
    return; // let the browser handle it normally
  }

  // CDN libraries — cache-first (they never change for a given version URL)
  if(CDN_FILES.some(f => url === f)){
    e.respondWith(
      caches.open(CACHE_CDN).then(c =>
        c.match(e.request).then(hit => {
          if(hit) return hit;
          return fetch(e.request).then(res => {
            if(res.ok) c.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // App shell — network-first with cache fallback so updates land quickly
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if(res.ok){
          caches.open(CACHE_SHELL).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
