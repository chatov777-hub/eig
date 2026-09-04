/* sw.js — офлайн-кэш приложения. Свои файлы: cache-first. Google Fonts: stale-while-revalidate. */

const CACHE = "eig-v5-5";
const FONTS = "eig-fonts";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/app.css",
  "./js/store.js",
  "./js/scales.js",
  "./js/content.js",
  "./js/programs.js",
  "./js/volume.js",
  "./js/motivation.js",
  "./js/rings.js",
  "./js/picker.js",
  "./js/photos.js",
  "./js/sync.js",
  "./js/ai.js",
  "./js/train.js",
  "./js/history.js",
  "./js/app.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>Promise.all(
      ASSETS.map(u=>c.add(u).catch(()=>{}))    // один недостающий файл не должен ломать установку
    ))
  );
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k !== CACHE && k !== FONTS).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

/* обновление ставится только по явной команде из приложения */
self.addEventListener("message", e=>{
  if(e.data === "SKIP_WAITING") self.skipWaiting();
});

const isFont = url =>
  url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

self.addEventListener("fetch", e=>{
  if(e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  if(isFont(url)){
    e.respondWith(
      caches.open(FONTS).then(async c=>{
        const hit = await c.match(e.request);
        const net = fetch(e.request).then(r=>{
          if(r) c.put(e.request, r.clone());   // кладём даже opaque-ответ
          return r;
        }).catch(()=>null);
        return hit || net || Response.error();
      })
    );
    return;
  }

  if(url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(hit=>
      hit || fetch(e.request).then(r=>{
        if(r && r.ok && r.type === "basic"){
          const copy = r.clone();
          caches.open(CACHE).then(c=>c.put(e.request, copy)).catch(()=>{});
        }
        return r;
      }).catch(()=>caches.match("./index.html"))
    )
  );
});
