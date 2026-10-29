/* Manitos · service worker: recibe las notificaciones push y abre la app al tocarlas. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { titulo: "Manitos", cuerpo: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || "Manitos", {
      body: d.cuerpo || "",
      icon: "/icono-192.png",
      badge: "/badge.png",
      tag: d.tag,
      renotify: !!d.tag,
      data: { url: d.url || "/panel" },
      lang: "es-AR",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "/panel", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && "focus" in v) {
          v.navigate(destino);
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
