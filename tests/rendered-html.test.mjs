import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GAME_SAVE_KEY, parseGameSave, RELEASE_VERSION } from "../app/game-save.ts";
import { disablePushNotifications, enablePushNotifications } from "../app/pwa-client.ts";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the Anna Atelier game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Ателье Анны — уютная игра<\/title>/i);
  assert.match(html, /Ателье Анны/);
  assert.match(html, /Загружаем мастерскую/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("uses the versioned, validated browser save schema", async () => {
  assert.equal(RELEASE_VERSION, "1.0.0");
  assert.equal(GAME_SAVE_KEY, "atelier_anna_save_v1");
  assert.equal(parseGameSave("not-json"), null);
  assert.equal(parseGameSave(JSON.stringify({ schemaVersion: 0, state: {} })), null);
  assert.equal(parseGameSave(JSON.stringify({ schemaVersion: 1, state: { board: [0] } })), null);

  const valid = parseGameSave(JSON.stringify({
    schemaVersion: 1,
    state: {
      board: Array(49).fill(2), score: 420, moves: 18, coins: 91, orderIndex: 1,
      activeOrder: true, orderProgress: 7, orderReady: false, hunger: 72, energy: 61,
      boredom: 54, drawingSketchIndex: 2, completedSketches: [0, 2, 2, 99], soundEnabled: true,
    },
  }));
  assert.ok(valid);
  assert.equal(valid.coins, 91);
  assert.deepEqual(valid.completedSketches, [0, 2]);
});

test("connects the complete order flow", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.match(game, /type Screen = "home" \| "match3" \| "drawing"/);
  assert.match(game, /Принять заказ/);
  assert.match(game, /setScreen\("match3"\)/);
  assert.match(game, /id="match-board"/);
  assert.match(game, /setScreen\("home"\)/);
  assert.match(game, /setCelebrating\(true\)/);
  assert.match(game, /onEnded=\{displayedVisual\.id === "celebrates" \? finishCelebration/);
  assert.match(game, /setShowOrderReadyMessage\(true\)/);
  assert.match(game, /Заказ готов!/);
  assert.match(game, /Заказ «\$\{finishedTitle\}» готов!/);
  assert.doesNotMatch(game, /showDeliveryModal|deliverOrder|Отдать заказ|передан клиенту/);
});

test("keeps every activity inside one studio window", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.match(game, /className=\{`studio-window studio-window-\$\{screen\}`\}/);
  assert.match(game, /aria-label="Главное окно игры"/);
  assert.match(game, /aria-label="Игра три в ряд"/);
  assert.match(game, /aria-label="Игра с рисованием"/);
  assert.doesNotMatch(game, /className="screen-topline"/);
});

test("shows incoming orders in Anna's upper-right bubble", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /\[showOrderModal, setShowOrderModal\] = useState\(false\)/);
  assert.match(game, /className="mood-bubble order-alert-bubble"/);
  assert.match(game, /aria-expanded=\{showOrderModal\}/);
  assert.match(game, /className="order-modal order-inbox-card"/);
  assert.match(game, /aria-modal="false"/);
  assert.match(css, /\.mood-bubble\s*\{[^}]*top: 22px;[^}]*right: 22px;/);
  assert.match(css, /\.order-alert-bubble\s*\{[^}]*cursor: pointer/);
  assert.match(css, /\.order-inbox-card\s*\{[^}]*position: absolute;[^}]*top: 76px;[^}]*right: 18px;/);
  assert.doesNotMatch(game, /order-modal-backdrop/);
  assert.match(css, /@keyframes order-arrive/);
});

test("shows the active match-three task below the board", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const boardIndex = game.indexOf('aria-label="Игровое поле 7 на 7"');
  const taskIndex = game.indexOf('className={`match-task-card panel');
  assert.ok(boardIndex >= 0, "match-three board is present");
  assert.ok(taskIndex > boardIndex, "order task follows the board");
  assert.match(game, /Задание заказа/);
});

test("crossfades Anna states without revealing the brown loading surface", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(game, /poster=|STATE_IMAGES|assets\/states\//);
  assert.match(game, /scene-video-current/);
  assert.match(game, /scene-video-incoming/);
  assert.match(game, /onCanPlay=\{revealIncomingVideo\}/);
  assert.match(game, /assets\/anna-atelier-scene\.png/);
  assert.match(css, /\.scene-video-incoming\.scene-video-ready\s*\{[^}]*opacity: 1/);
});

test("keeps the whole tamagotchi interface compact inside Anna's game field", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /Ателье Анны/);
  assert.match(game, /className="atelier-hud"/);
  assert.match(game, /Уровень/);
  assert.match(game, /монет/);
  assert.doesNotMatch(game, /className="status-pill"|className="stage-player-panel"/);
  assert.match(game, /className="home-layout home-layout-single screen-enter"/);
  assert.match(css, /\.home-layout-single \.anna-card\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(css, /\.home-layout-single \.anna-copy\s*\{[^}]*position: relative/);
  assert.match(css, /\.home-layout-single \.meters\s*\{[^}]*grid-template-columns: repeat\(3/);
  assert.match(css, /\.atelier-hud\s*\{[^}]*position: absolute/);
  assert.doesNotMatch(game, /mobile-player-panel|home-sidebar|home-action-card|letter-preview|Открыть заказ/);
  assert.doesNotMatch(game, /className="app-nav"/);
  assert.match(game, /className="inline-back-button"/);
});

test("removes the separate Atelier and Orders tab panel", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(game, /const gameNav|className="app-nav"|setScreen\("orders"\)|ordersScreen/);
  assert.match(game, /aria-label="Вернуться к Анне"/);
});

test("supports swipe controls on the match-three board", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /function beginSwipe/);
  assert.match(game, /function endSwipe/);
  assert.match(game, /onPointerDown=\{\(event\) => beginSwipe\(index, event\)\}/);
  assert.match(game, /onPointerUp=\{endSwipe\}/);
  assert.match(game, /trySwap\(start\.index, target\)/);
  assert.match(css, /\.match-board\s*\{[^}]*touch-action: none/);
});

test("keeps the mobile match-three game on one screen", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /screen === "home" \? "topbar" : "topbar topbar-match-hidden"/);
  assert.match(game, /game-shell game-shell-\$\{screen\}/);
  assert.match(css, /\.topbar\.topbar-match-hidden\s*\{\s*display: none/);
  assert.match(css, /\.game-shell-match3\s*\{[^}]*height: 100dvh;[^}]*overflow: hidden/);
  assert.match(css, /\.game-shell-match3 \.match-layout\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(css, /\.game-shell-match3 \.tip-card\s*\{\s*display: none/);
  assert.doesNotMatch(css, /:has\(#match-board\)/);
});

test("gives level four more moves and offers a retry when moves run out", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /const LEVEL_FOUR_MOVES = 32/);
  assert.match(game, /return level >= 4 \? LEVEL_FOUR_MOVES : STARTING_MOVES/);
  assert.match(game, /setMoves\(movesForLevel\(level\)\)/);
  assert.match(game, /const movesFinished = screen === "match3" && activeOrder && !orderReady && !busy && moves <= 0/);
  assert.match(game, /className="moves-finished-overlay" role="dialog" aria-modal="true"/);
  assert.match(game, />Попробовать снова<\/button>/);
  assert.match(game, /function retryCurrentMatch\(\)/);
  assert.match(game, /setOrderProgress\(0\)/);
  assert.match(css, /\.moves-finished-overlay\s*\{/);
  assert.match(css, /\.moves-finished-overlay \.primary-button\s*\{/);
});

test("keeps the order-ready message centered inside the match-three field", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.board-panel\s*\{[^}]*position: relative/);
  assert.match(css, /\.order-ready-overlay\s*\{[^}]*left: 50%;[^}]*box-sizing: border-box;[^}]*max-width: calc\(100% - 28px\)/);
  assert.match(css, /animation: order-ready-pop 320ms ease both/);
  assert.match(css, /@keyframes order-ready-pop[^}]*translate\(-50%, -50%\)[^}]*\}/);
});

test("unlocks drawing when Anna is bored", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /DRAWING_UNLOCK_AT = 50/);
  assert.match(game, /drawingUnlocked/);
  assert.match(game, /Картина Анны/);
  assert.match(game, /onPointerMove=\{continueSketchLine\}/);
  assert.match(game, /Контур готов/);
  assert.match(game, /Выберите цвет/);
  assert.match(game, /Украсьте картину/);
  assert.match(game, /function paintDrawingZone/);
  assert.match(game, /function createColoringRegionMap/);
  assert.match(game, /onPointerUp=\{paintDrawingZone\}/);
  assert.match(game, /Раскрасьте элементы/);
  assert.match(game, /paintedZones\.length === 0/);
  assert.match(game, /directRegionSize >= 8/);
  assert.match(game, /const searchRadius = 26/);
  assert.match(game, /setBoredom\(5\)/);
  assert.match(css, /\.trace-canvas\s*\{[^}]*touch-action: none/);
  assert.match(css, /\.coloring-canvas\s*\{[^}]*touch-action: manipulation/);
  assert.doesNotMatch(game, /DRAWING_PATTERN|chooseDrawing/);
  assert.doesNotMatch(game, /болез|illness|sick/i);
});

test("keeps the mobile drawing game on one screen", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.game-shell-drawing\s*\{[^}]*height: 100dvh;[^}]*overflow: hidden/);
  assert.match(css, /\.game-shell-drawing \.drawing-layout\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(css, /\.game-shell-drawing \.sketch-page\s*\{[^}]*grid-template-rows: auto auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.game-shell-drawing \.drawing-reward\s*\{\s*display: none/);
});

test("ships generated tracing pictures for the drawing game", async () => {
  const filenames = ["sketch-flower.png", "sketch-dress.png", "sketch-kitten.png"];
  for (const filename of filenames) {
    const picture = await readFile(new URL(`../public/assets/drawing/${filename}`, import.meta.url));
    assert.deepEqual([...picture.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${filename} is a PNG`);
    assert.ok(picture.length > 100_000, `${filename} contains the generated illustration`);
  }
});

test("keeps each Anna video ready for streaming playback", async () => {
  const filenames = ["anna-bored.mp4", "anna-celebrates.mp4", "anna-eating.mp4", "anna-hungry.mp4", "anna-resting.mp4", "anna-sewing.mp4", "anna-tired.mp4"];
  for (const filename of filenames) {
    const video = await readFile(new URL(`../public/assets/videos/${filename}`, import.meta.url));
    const moovOffset = video.indexOf(Buffer.from("moov"));
    const mediaOffset = video.indexOf(Buffer.from("mdat"));
    assert.ok(moovOffset > 0 && mediaOffset > 0, `${filename} contains MP4 playback boxes`);
    assert.ok(moovOffset < mediaOffset, `${filename} stores its playback index before media data`);
  }
});

test("plays the supplied rest animation through the same stage player as every Anna state", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /id: "resting", video: assetPath\("assets\/videos\/anna-resting\.mp4"\)/);
  assert.match(game, /assets\/videos\/anna-resting\.mp4/);
  assert.match(game, /restCutsceneActiveRef\.current/);
  assert.match(game, /className="scene-image scene-video-current"/);
  assert.match(game, /displayedVisual\.id !== "celebrates" && displayedVisual\.id !== "resting"/);
  assert.match(game, /displayedVisual\.id === "resting" \? \(\) => finishRestCutscene\(\)/);
  assert.doesNotMatch(game, /className="(?:stage-)?rest-cutscene"|aria-label="Отдых Анны у моря"/);
  assert.doesNotMatch(css, /\.stage-rest-cutscene/);
  assert.match(css, /\.character-stage \.scene-image\s*\{[^}]*object-fit: cover/);
  assert.doesNotMatch(game, /className="celebration-banner"/);
  assert.doesNotMatch(game, /celebrating \? "Радуется"/);
  assert.match(game, /orderReady \? "Готово" : "Шить"/);
});

test("resets every persisted game field for a new game", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.match(game, /function resetGame\(\)/);
  assert.match(game, /clearGameSave\(window\.localStorage\)/);
  assert.match(game, /setCoins\(36\)/);
  assert.match(game, /setOrderIndex\(0\)/);
  assert.match(game, /setCompletedSketches\(\[\]\)/);
  assert.match(game, /Начать новую игру\? Текущий прогресс будет удалён/);
});

test("builds a movable release with a polished loading state", async () => {
  const html = await readFile(new URL("../github-pages/index.html", import.meta.url), "utf8");
  const config = await readFile(new URL("../vite.pages.config.ts", import.meta.url), "utf8");
  const packageData = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageData.version, "1.0.0");
  assert.match(html, /data-asset-prefix="\.\/"/);
  assert.match(html, /Загружаем мастерскую/);
  assert.match(html, /content="1\.0\.0"/);
  assert.match(config, /base: "\.\/"/);
});

test("ships an installable subdirectory-safe PWA", async () => {
  const html = await readFile(new URL("../github-pages/index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Ателье Анны");
  assert.equal(manifest.short_name, "Ателье Анны");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512", "512x512"]);
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /apple-touch-icon" sizes="180x180"/);

  for (const [filename, expectedSize] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-512.png", 512]]) {
    const png = await readFile(new URL(`../public/icons/${filename}`, import.meta.url));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), expectedSize);
    assert.equal(png.readUInt32BE(20), expectedSize);
  }
});

test("provides contextual install and notification controls", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const client = await readFile(new URL("../app/pwa-client.ts", import.meta.url), "utf8");
  assert.match(game, /beforeinstallprompt/);
  assert.match(game, /Добавить на телефон/);
  assert.match(game, /Добавь Ателье Анны на экран телефона/);
  assert.match(game, /Открой игру в Safari/);
  assert.match(game, /Анна может позвать тебя в ателье/);
  assert.match(game, /Разрешить уведомления/);
  assert.match(game, /Не сейчас/);
  assert.match(client, /Notification\.requestPermission\(\)/);
  assert.match(client, /getSubscription\(\)/);
  assert.match(client, /pushManager\.subscribe/);
  assert.match(client, /api\/push\/subscribe/);
  assert.match(client, /api\/push\/unsubscribe/);
  assert.match(client, /credentials: "include"/);
  assert.doesNotMatch(client, /VAPID_PRIVATE|ownsGame|userId/);
});

test("subscribes idempotently and unregisters through the scoped push API", async () => {
  const names = ["window", "document", "navigator", "Notification", "fetch"];
  const descriptors = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const preferences = new Map();
  const requests = [];
  let currentSubscription = null;
  let subscribeCalls = 0;
  let unsubscribeCalls = 0;
  const subscription = {
    toJSON: () => ({ endpoint: "https://push.example/subscription", keys: { p256dh: "key", auth: "auth" } }),
    unsubscribe: async () => { unsubscribeCalls += 1; currentSubscription = null; return true; },
  };
  const registration = {
    pushManager: {
      getSubscription: async () => currentSubscription,
      subscribe: async () => { subscribeCalls += 1; currentSubscription = subscription; return subscription; },
    },
  };

  try {
    const notification = { requestPermission: async () => "granted" };
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      PushManager: function PushManager() {}, Notification: notification,
      atob: globalThis.atob,
      matchMedia: () => ({ matches: false }),
      localStorage: { getItem: (key) => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) },
    } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { dataset: { assetPrefix: "./" } }, baseURI: "https://shop.example/games/atelier-anna/" } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: {}, language: "ru-RU", userAgent: "Android", platform: "", maxTouchPoints: 5 } });
    Object.defineProperty(globalThis, "Notification", { configurable: true, value: notification });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url, options) => { requests.push({ url, options }); return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }); } });

    const config = { vapidPublicKey: "A".repeat(43) };
    await enablePushNotifications(registration, config);
    await enablePushNotifications(registration, config);
    assert.equal(subscribeCalls, 1, "an existing browser subscription is reused");
    assert.equal(requests[0].url, "https://shop.example/games/atelier-anna/api/push/subscribe");
    assert.equal(requests[0].options.credentials, "include");
    assert.doesNotMatch(requests[0].options.body, /userId|owner|purchase/i);

    const result = await disablePushNotifications(registration);
    assert.equal(requests.at(-1).url, "https://shop.example/games/atelier-anna/api/push/unsubscribe");
    assert.equal(unsubscribeCalls, 1);
    assert.deepEqual(result, { unsubscribed: true, serverSynced: true });
    assert.equal(preferences.get("atelier_anna_notifications_v1"), "disabled");
  } finally {
    for (const name of names) {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test("uses a versioned service worker without caching auth or navigation", async () => {
  const worker = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
  assert.match(worker, /atelier-anna-static-v/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /api\|auth\|account\|callback\|signin\|signout/);
  assert.match(worker, /request\.headers\.has\("range"\)/);
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(worker, /clients\.openWindow/);
  assert.match(worker, /searchParams\.set\("destination"/);
  assert.doesNotMatch(worker, /cache\.addAll|localStorage\.ownsGame/);
});

test("routes notification destinations into existing game states", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.match(game, /searchParams\.get\("destination"\)/);
  assert.match(game, /destination === "drawing"/);
  assert.match(game, /\["order", "orders", "match3"\]\.includes\(destination\)/);
  assert.match(game, /setShowOrderModal\(true\)/);
  assert.match(game, /history\.replaceState/);
});

test("hardens the touch viewport and safe areas", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /overscroll-behavior: none/);
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
});

test("adds opt-in game sound effects", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /\[soundEnabled, setSoundEnabled\] = useState\(false\)/);
  assert.match(game, /new AudioContextConstructor\(\)/);
  assert.match(game, /className=\{`sound-toggle/);
  assert.match(game, /aria-pressed=\{soundEnabled\}/);
  assert.match(game, /playSound\("success"\)/);
  assert.match(game, /playSound\("coin"\)/);
  assert.match(css, /\.sound-toggle\s*\{[^}]*position: absolute/);
});

test("loops the supplied soundtrack behind the whole game", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const soundtrack = await readFile(new URL("../public/assets/audio/anna-atelier-theme.mp3", import.meta.url));
  assert.deepEqual(soundtrack.subarray(0, 3).toString("ascii"), "ID3");
  assert.ok(soundtrack.length > 1_000_000, "soundtrack contains the supplied audio");
  assert.match(game, /new Audio\(assetPath\("assets\/audio\/anna-atelier-theme\.mp3"\)\)/);
  assert.match(game, /soundtrack\.loop = true/);
  assert.match(game, /soundtrack\.volume = 0\.24/);
  assert.match(game, /soundtrackRef\.current\.play\(\)/);
  assert.match(game, /soundtrackRef\.current\?\.pause\(\)/);
});
