# ULTRANEWERSTOP: production integration for Atelier Anna v1.0.0

The distributable is a static mobile-first PWA intended to be mounted at `/games/atelier-anna/`. This repository does not contain the ULTRANEWERSTOP purchase database, account service, session middleware, or Web Push sender. Those responsibilities must remain on the store backend; the frontend never stores an `ownsGame` flag.

## Ownership and session boundary

Before public paid release, ULTRANEWERSTOP must:

1. Require an authenticated, entitled account for `/games/atelier-anna/` and the game bundles/assets below that path. A purchase check must be performed by trusted server or edge code, not JavaScript in this repository.
2. Keep the installed app on the same HTTPS origin and path. Its `start_url` is relative, so every Home Screen launch returns through the protected game URL.
3. Use a `Secure`, `HttpOnly` session cookie. `SameSite=Lax` is appropriate for a same-origin game; the cookie `Path` must include `/games/atelier-anna/` and the push endpoints.
4. On an expired session, redirect browser navigations to the existing account/login flow with a validated relative `return_to`. API calls must return `401` JSON instead of HTML.
5. Do not place authenticated HTML/API responses in a public CDN cache. Use `Cache-Control: private, no-store` for entitlement and session responses. Do not rely on the service worker for access control.

The `app/chatgpt-auth.ts` helper belongs to the optional ChatGPT Sites runtime. It is not an ULTRANEWERSTOP ownership integration and is not included in the static GitHub Pages build.

## Required Web Push API

All endpoints are relative to the game mount and require the same authenticated, entitled account. The server must derive the account identity from the session and must ignore any client-supplied user ID.

### `GET api/push/config`

Response `200`:

```json
{
  "vapidPublicKey": "BASE64URL_ENCODED_PUBLIC_KEY"
}
```

Return `401` for an expired session, `403` for an account without the game, or `404`/`503` while push is unavailable. The client hides the notification control when this endpoint is unavailable and never opens the operating-system permission prompt.

### `POST api/push/subscribe`

Content type: `application/json`. The request contains:

```json
{
  "subscription": {
    "endpoint": "https://push-service.example/subscription-id",
    "expirationTime": null,
    "keys": {
      "p256dh": "BASE64URL_PUBLIC_KEY",
      "auth": "BASE64URL_AUTH_SECRET"
    }
  },
  "client": {
    "appVersion": "1.0.0",
    "locale": "ru-RU",
    "timeZone": "Europe/Moscow",
    "standalone": true
  },
  "preferences": { "enabled": true }
}
```

Validate the payload and endpoint scheme/length, bind the subscription to the authenticated owner, encrypt secrets at rest, and upsert idempotently using a unique endpoint hash. Return `200` or `201`. Enforce `Origin`/CSRF policy and request-size/rate limits.

### `POST api/push/unsubscribe`

The request contains `{ "subscription": <PushSubscription JSON> }`. Remove only the subscription owned by the authenticated account and return `200` even if it is already absent. The frontend also unsubscribes in the browser and avoids duplicate subscriptions by calling `getSubscription()` first.

## Server secrets and sender

Store the VAPID subject, public key and private key only in the backend secret manager, for example:

- `WEB_PUSH_VAPID_SUBJECT`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`

Only the public key is returned by `api/push/config`. Never add the private key, purchase credentials, cookies, signing secrets or test accounts to the web build.

The sender must delete subscriptions after permanent `404`/`410` responses and should send messages only for real server-known events. Supported notification data fields are `url`, `action`, `destination` and `type`. URLs are constrained by the service worker to the installed game scope.

Example payload:

```json
{
  "title": "Ателье Анны",
  "body": "В ателье появился новый заказ",
  "tag": "order-ready-123",
  "url": "./?destination=orders",
  "action": "open",
  "destination": "orders",
  "type": "order_available"
}
```

## Exact push test

1. Deploy the build and API to HTTPS under `/games/atelier-anna/`.
2. Sign in as an entitled test customer.
3. On Android Chrome, or from the installed Home Screen app on iOS 16.4+, open the notification control and tap `Разрешить уведомления`.
4. Confirm that the backend stored exactly one subscription for that account.
5. Send the example payload through the backend's protected staff/test sender using that stored subscription and the server-side VAPID private key.
6. Put the app in the background, receive the notification, tap it and confirm that the existing app window is focused or a new scoped window opens.
7. Disable notifications in the game and confirm that the subscription is removed and a second send is not delivered.

Real delivery cannot be completed by this repository alone: it requires the ULTRANEWERSTOP account/entitlement service, persistent subscription storage, VAPID secrets and a server-side Web Push sender.

## Static hosting requirements

- HTTPS is mandatory outside localhost.
- Mount the contents of the release folder directly at `/games/atelier-anna/`, preserving filenames and subdirectories.
- Serve `.webmanifest` as `application/manifest+json`, `.js` as JavaScript, `.mp4` as `video/mp4`, `.mp3` as `audio/mpeg`, and PNG icons as `image/png`.
- Do not rewrite `manifest.webmanifest`, `service-worker.js`, icons, audio or video to HTML.
- Allow byte-range requests for MP4 files.
- Serve `service-worker.js` with `Cache-Control: no-cache` so new release workers are discovered promptly.
- Hashed JavaScript/CSS assets may use long immutable caching after the ownership layer has authorized access.
