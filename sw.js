const C = "finanzexperte-v1.3.2",
  F = ["./", "./index.html", "./app.js", "./manifest.webmanifest"];
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(C)
      .then((c) => c.addAll(F))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((a) =>
        Promise.all(a.filter((x) => x !== C).map((x) => caches.delete(x))),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.method === "GET" &&
    new URL(e.request.url).origin === location.origin
  )
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const x = r.clone();
          caches.open(C).then((c) => c.put(e.request, x));
          return r;
        })
        .catch(() => caches.match(e.request)),
    );
});
