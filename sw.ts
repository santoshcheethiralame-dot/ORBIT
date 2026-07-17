/// <reference lib="webworker" />
// Custom Orbit service worker (vite-plugin-pwa injectManifest). Keeps the
// Workbox offline precache + font caching that generateSW gave us, and adds the
// Web Push handlers that generateSW could not hold — the whole reason we run a
// custom SW. This is what lets the drill-sergeant reminders reach a closed,
// installed PWA on your phone.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { StaleWhileRevalidate, CacheFirst } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

self.skipWaiting();
clientsClaim();

// ── Offline: precache the app shell + assets, keep index.html as fallback ─────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({ cacheName: "gfonts-css", plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })] }),
);
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "gfonts-files",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
);

// ── Web Push: the drill sergeant's mouth ──────────────────────────────────────
interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  sticky?: boolean; // requireInteraction (Android; iOS ignores)
  vibrate?: number[];
  actions?: { action: string; title: string }[];
}

self.addEventListener("push", (event: PushEvent) => {
  let data: PushPayload = {};
  try {
    data = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    data = { title: "Orbit", body: event.data?.text() || "" };
  }
  const options: NotificationOptions & { vibrate?: number[]; actions?: { action: string; title: string }[]; renotify?: boolean } = {
    body: data.body || "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-64x64.png",
    tag: data.tag || "orbit-reminder",
    renotify: true,
    requireInteraction: !!data.sticky,
    vibrate: data.vibrate || [220, 90, 220, 90, 320],
    data: { url: data.url || "/?action=focus" },
    actions: data.actions || [
      { action: "focus", title: "Start now" },
      { action: "snooze", title: "Snooze 20m" },
    ],
  };
  event.waitUntil(self.registration.showNotification(data.title || "Orbit", options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  if (event.action === "snooze") {
    event.waitUntil(openApp("/?snooze=20"));
    return;
  }
  const url = (event.notification.data && (event.notification.data as { url?: string }).url) || "/?action=focus";
  event.waitUntil(openApp(url));
});

function openApp(url: string): Promise<unknown> {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if ("focus" in client) {
        (client as WindowClient).navigate(url).catch(() => {});
        return (client as WindowClient).focus();
      }
    }
    return self.clients.openWindow(url);
  });
}
