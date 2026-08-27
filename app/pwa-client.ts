export const NOTIFICATION_PREFERENCE_KEY = "atelier_anna_notifications_v1";
const RELEASE_VERSION = "1.0.0";

const PUSH_CONFIG_PATH = "api/push/config";
const PUSH_SUBSCRIBE_PATH = "api/push/subscribe";
const PUSH_UNSUBSCRIBE_PATH = "api/push/unsubscribe";

export type DeferredInstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type PushBackendConfig = {
  vapidPublicKey: string;
};

export type NotificationPreference = "enabled" | "disabled" | "dismissed" | "unknown";

export class PushClientError extends Error {
  readonly code: "authorization-required" | "backend-unavailable" | "permission-denied" | "unsupported";

  constructor(code: "authorization-required" | "backend-unavailable" | "permission-denied" | "unsupported") {
    super(code);
    this.name = "PushClientError";
    this.code = code;
  }
}

export function scopedUrl(path: string) {
  const prefix = document.documentElement.dataset.assetPrefix || "./";
  const base = new URL(prefix, document.baseURI);
  return new URL(path.replace(/^\/+/, ""), base).toString();
}

export function isIosDevice() {
  const navigatorWithTouch = navigator as Navigator & { standalone?: boolean };
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || navigatorWithTouch.standalone === true;
}

export function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export function supportsWebPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function readNotificationPreference(storage: Pick<Storage, "getItem">): NotificationPreference {
  try {
    const value = storage.getItem(NOTIFICATION_PREFERENCE_KEY);
    return value === "enabled" || value === "disabled" || value === "dismissed" ? value : "unknown";
  } catch {
    return "unknown";
  }
}

export function writeNotificationPreference(storage: Pick<Storage, "setItem">, value: Exclude<NotificationPreference, "unknown">) {
  try {
    storage.setItem(NOTIFICATION_PREFERENCE_KEY, value);
  } catch {
    // Notification preferences are best-effort; browser permission remains authoritative.
  }
}

export async function registerGameServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register(scopedUrl("service-worker.js"), { scope: scopedUrl("./") });
  } catch {
    return null;
  }
}

export async function fetchPushBackendConfig(): Promise<PushBackendConfig | null> {
  if (!supportsWebPush()) return null;
  try {
    const response = await fetch(scopedUrl(PUSH_CONFIG_PATH), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("vapidPublicKey" in data) || typeof data.vapidPublicKey !== "string" || data.vapidPublicKey.length < 40) return null;
    return { vapidPublicKey: data.vapidPublicKey };
  } catch {
    return null;
  }
}

export async function hasPushSubscription(registration: ServiceWorkerRegistration | null) {
  if (!registration || !supportsWebPush()) return false;
  try {
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function postSubscription(path: string, subscription: PushSubscription) {
  const response = await fetch(scopedUrl(path), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      client: {
        appVersion: RELEASE_VERSION,
        locale: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        standalone: isStandaloneMode(),
      },
      preferences: { enabled: true },
    }),
  });
  if (response.status === 401 || response.status === 403) throw new PushClientError("authorization-required");
  if (!response.ok) throw new PushClientError("backend-unavailable");
}

export async function enablePushNotifications(registration: ServiceWorkerRegistration | null, config: PushBackendConfig) {
  if (!registration || !supportsWebPush()) throw new PushClientError("unsupported");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushClientError("permission-denied");

  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(config.vapidPublicKey),
  });
  try {
    await postSubscription(PUSH_SUBSCRIBE_PATH, subscription);
    writeNotificationPreference(window.localStorage, "enabled");
    return subscription;
  } catch (error) {
    if (!existing) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
}

export async function disablePushNotifications(registration: ServiceWorkerRegistration | null) {
  if (!registration || !supportsWebPush()) {
    writeNotificationPreference(window.localStorage, "disabled");
    return { unsubscribed: true, serverSynced: false };
  }
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    writeNotificationPreference(window.localStorage, "disabled");
    return { unsubscribed: true, serverSynced: true };
  }

  let serverSynced = false;
  try {
    const response = await fetch(scopedUrl(PUSH_UNSUBSCRIBE_PATH), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    serverSynced = response.ok;
  } catch {
    serverSynced = false;
  }
  const unsubscribed = await subscription.unsubscribe().catch(() => false);
  writeNotificationPreference(window.localStorage, "disabled");
  return { unsubscribed, serverSynced };
}
