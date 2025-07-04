// service-worker.js

const CACHE_NAME = "amigo-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/home.html",
  "/style.css",
  "/main.js",
  "/manifest.json",
  "https://cdn.tailwindcss.com"
];

// 🔁 Install and Cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 💡 Serve Cached Files
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});

// 🧼 Clean Old Caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      )
    )
  );
});
