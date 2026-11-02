// ─── Cache version ──────────────────────────────────────────────────────────
// Bump ONLY when you want users to get fresh files.
// Old cache is kept alive until the new SW fully installs — so offline never breaks.
const CACHE_SHELL = "expense-tracker-shell-v13";
const CACHE_CDN   = "expense-tracker-cdn-v13";

// App shell files to pre-cache on install
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./sw.js",
  "./manifest.json"
];

// CDN libraries — versioned URLs, cache forever
const CDN_FILES = [
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"
];

// ─── Install: pre-cache everything BEFORE activating ────────────────────────
// waitUntil keeps the SW in "installing" state until all files are cached.
// This means the OLD sw (with its old cache) stays active until this completes —
// so users are never left with NO cache while a new SW is installing.
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const shellCache = await caches.open(CACHE_SHELL);
    const cdnCache   = await caches.open(CACHE_CDN);

    // Pre-cache shell — fetch each file individually so one 404 doesn't kill all
    await Promise.allSettled(
      SHELL_FILES.map(url =>
        fetch(new Request(url, { cache: "reload" }))
          .then(res => {
            if(res.ok) return shellCache.put(url, res);
          })
          .catch(err => console.warn("[SW] Shell cache miss:", url, err))
      )
    );

    // Pre-cache CDN — skip if already cached (they never change)
    await Promise.allSettled(
      CDN_FILES.map(url =>
        cdnCache.match(url).then(hit => {
          if(hit) return; // already have it
          return fetch(url)
            .then(res => { if(res.ok) cdnCache.put(url, res); })
            .catch(err => console.warn("[SW] CDN cache miss:", url, err));
        })
      )
    );

    // Take over immediately — don't wait for old tabs to close
    self.skipWaiting();
  })());
});

// ─── Activate: delete OLD caches only, notify clients ───────────────────────
self.addEventListener("activate", e => {
  const keep = new Set([CACHE_SHELL, CACHE_CDN]);
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => !keep.has(k)).map(k => {
          console.log("[SW] Deleting old cache:", k);
          return caches.delete(k);
        }))
      )
      .then(async () => {
        await self.clients.claim();
        // Notify open tabs that a new version is ready
        const allClients = await self.clients.matchAll({ type: "window" });
        allClients.forEach(c => c.postMessage({ type: "SW_UPDATED", version: CACHE_SHELL }));
      })
  );
});

// ─── Fetch strategy ──────────────────────────────────────────────────────────
self.addEventListener("fetch", e => {
  const url = e.request.url;

  // Never intercept Firebase / Google API calls — always go to network
  if(
    url.includes("firestore.googleapis.com") ||
    url.includes("identitytoolkit.googleapis.com") ||
    url.includes("securetoken.googleapis.com") ||
    url.includes("firebase.googleapis.com") ||
    url.includes("googleapis.com") ||
    url.includes("googletagmanager.com") ||
    url.includes("google-analytics.com")
  ){
    return; // browser handles it — falls back to Firestore's own offline cache
  }

  // CDN libraries — cache-first (URL is versioned, content never changes)
  if(CDN_FILES.some(f => url === f || url.startsWith(f))){
    e.respondWith(
      caches.open(CACHE_CDN).then(async c => {
        const hit = await c.match(e.request);
        if(hit) return hit;
        // Not in cache yet — fetch, cache, return
        try {
          const res = await fetch(e.request);
          if(res.ok) c.put(e.request, res.clone());
          return res;
        } catch {
          return new Response("CDN library unavailable offline", { status: 503 });
        }
      })
    );
    return;
  }

  // App shell — CACHE-FIRST with background revalidation (stale-while-revalidate)
  // 1. Serve from cache immediately (fast, works offline)
  // 2. Fetch from network in background and update cache for next visit
  e.respondWith(
    caches.open(CACHE_SHELL).then(async c => {
      const cached = await c.match(e.request);

      // Background revalidation — update cache silently
      const networkFetch = fetch(e.request)
        .then(res => {
          if(res.ok) c.put(e.request, res.clone());
          return res;
        })
        .catch(() => null); // offline — ignore, we have cache

      if(cached){
        // Serve cache immediately, update in background
        networkFetch; // fire-and-forget
        return cached;
      }

      // Nothing in cache — wait for network (first visit or cache cleared)
      try {
        const res = await networkFetch;
        if(res && res.ok) return res;
      } catch {}

      // Total failure — return a minimal offline page
      return new Response(
        `<!DOCTYPE html><html><head><meta charset="UTF-8">
         <meta name="viewport" content="width=device-width,initial-scale=1">
         <title>Expense Tracker — Offline</title>
         <style>
           body{margin:0;min-height:100vh;display:flex;align-items:center;
                justify-content:center;flex-direction:column;gap:16px;
                font-family:system-ui,sans-serif;background:#0f1117;color:#e8eaf0;
                text-align:center;padding:24px}
           .icon{font-size:64px}
           h2{margin:0;font-size:1.4rem}
           p{margin:0;color:#8b92a8;font-size:.95rem}
           button{margin-top:8px;padding:12px 28px;border:none;border-radius:12px;
                  background:#2563eb;color:#fff;font-size:1rem;cursor:pointer;
                  font-weight:600}
         </style></head>
         <body>
           <div class="icon">📶</div>
           <h2>You're offline</h2>
           <p>Connect to the internet and reload to use Expense Tracker.</p>
           <button onclick="location.reload()">Retry</button>
         </body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    })
  );
});