const RELEASE_VERSION = "1.0.0";
const STATIC_CACHE = `atelier-anna-static-v${RELEASE_VERSION}`;
const CACHE_PREFIX = "atelier-anna-static-v";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function canCache(request, response) {
  if (!response || !response.ok || request.method !== "GET") return false;
  if (request.headers.has("authorization") || request.headers.has("range")) return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || /\/(?:api|auth|account|callback|signin|signout)(?:\/|$)/i.test(url.pathname)) return false;
  if (!["font", "image", "manifest", "script", "style"].includes(request.destination)) return false;
  const cacheControl = response.headers.get("cache-control") || "";
  const contentType = response.headers.get("content-type") || "";
  return !/private|no-store/i.test(cacheControl) && !/text\/html/i.test(contentType);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode === "navigate" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || /\/(?:api|auth|account|callback|signin|signout)(?:\/|$)/i.test(url.pathname)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (canCache(request, response)) await (await caches.open(STATIC_CACHE)).put(request, response.clone());
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw new Error("Offline asset unavailable");
    }
  })());
});

function notificationPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const data = notificationPayload(event);
  const title = typeof data.title === "string" ? data.title : "Ателье Анны";
  const body = typeof data.body === "string" ? data.body : "Анна зовёт тебя в ателье ✂️";
  const icon = new URL("icons/icon-192.png", self.registration.scope).toString();
  const badge = new URL("icons/icon-192.png", self.registration.scope).toString();
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon,
    badge,
    tag: typeof data.tag === "string" ? data.tag : undefined,
    data: {
      url: typeof data.url === "string" ? data.url : undefined,
      action: typeof data.action === "string" ? data.action : undefined,
      destination: typeof data.destination === "string" ? data.destination : undefined,
      type: typeof data.type === "string" ? data.type : undefined,
    },
  }));
});

function safeNotificationUrl(data) {
  try {
    const target = new URL(typeof data?.url === "string" ? data.url : "./", self.registration.scope);
    if (!data?.url && typeof data?.destination === "string") target.searchParams.set("destination", data.destination);
    if (!data?.url && typeof data?.action === "string") target.searchParams.set("action", data.action);
    if (!data?.url && typeof data?.type === "string") target.searchParams.set("type", data.type);
    if (target.origin !== self.location.origin || !target.href.startsWith(self.registration.scope)) return self.registration.scope;
    return target.href;
  } catch {
    return self.registration.scope;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = safeNotificationUrl(event.notification.data);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) {
      if ("navigate" in existing) await existing.navigate(targetUrl).catch(() => undefined);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
