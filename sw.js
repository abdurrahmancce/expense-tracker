// Uses paths RELATIVE to this file's own location, so it never depends
// on the repo name (works no matter what the folder/repo is called).
const CACHE = "expense-tracker-v3";
const PRECACHE = ["./", "./index.html", "./style.css", "./script.js"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(err => {
      console.error("Precache failed:", err);
    })
  );
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
  if(url.includes("firestore") || url.includes("firebase") || url.includes("googleapis")){
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
