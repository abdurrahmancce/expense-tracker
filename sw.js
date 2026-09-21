// Bump this version string every time index.html/style.css/script.js change
// so the old cached copies get thrown away and users always get the latest.
const CACHE = "expense-tracker-v2";
const PRECACHE = [
  "/Expense-Tracker/",
  "/Expense-Tracker/index.html",
  "/Expense-Tracker/style.css",
  "/Expense-Tracker/script.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = e.request.url;
  // Never cache Firebase/Firestore/Google API calls or the app files
  // themselves in a stale way — network-first for our own core files
  // so updates show up immediately, cache is just an offline fallback.
  if(url.includes("firestore") || url.includes("firebase") || url.includes("googleapis")){
    return;
  }

  const isCoreFile = PRECACHE.some(p => url.endsWith(p) || url.endsWith("/Expense-Tracker/"));

  if(isCoreFile){
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
