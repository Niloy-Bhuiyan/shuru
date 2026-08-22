/* eslint-disable no-undef */
/**
 * Shuru service worker — push notifications only.
 *
 * Deliberately does NOT cache anything. An offline cache for an app whose
 * whole value is live listing data would serve stale deadlines and stale odds,
 * which is worse than an offline error. This worker exists solely so the
 * browser has somewhere to deliver push events.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // A payload we cannot parse is not worth guessing at.
    return;
  }

  const title = payload.title || "Shuru";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      // Collapses repeat alerts about the same subject instead of stacking.
      tag: payload.tag || undefined,
      data: { url: payload.url || "/notifications" },
      badge: "/icon-badge.png",
      icon: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Focus an existing tab rather than opening a duplicate.
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
