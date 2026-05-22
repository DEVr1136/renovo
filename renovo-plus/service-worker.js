importScripts("./app-version.js");

const VERSION = String(self.RENOVO_PLUS_VERSION || "dev");
const CACHE_NAME = "ambiente-digital-plus-" + VERSION;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app-version.js",
  "./styles.css?v=0.1.0-alpha.23",
  "./bg-renovo.avif",
  "./firebase-plus.js?v=0.1.0-alpha.23",
  "./app.js?v=0.1.0-alpha.23",
  "../icon.png",
  "../pwa-192.png",
  "../pwa-512.png",
  "../apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && (/^ambiente-digital-plus-/.test(key) || /^renovo-static-/.test(key)))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch (_) { payload = { notification: { title: "Ambiente Digital", body: event.data.text() } }; }
  const n = payload.notification || {};
  event.waitUntil(
    self.registration.showNotification(n.title || "Ambiente Digital", {
      body: n.body || "",
      icon: n.icon || "../icon.png",
      badge: "../pwa-192.png",
      data: payload.data || {},
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  if (!isSameOrigin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
