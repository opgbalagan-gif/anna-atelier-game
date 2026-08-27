import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(html, /Главный экран ателье/);
  assert.match(html, /Новый заказ: Летнее платье/);
  assert.match(html, /Скука/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
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
  assert.match(game, /onPointerUp=\{paintDrawingZone\}/);
  assert.match(game, /Раскрасьте элементы/);
  assert.match(game, /paintedZones\.length === 0/);
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
  const filenames = ["anna-bored.mp4", "anna-celebrates.mp4", "anna-eating.mp4", "anna-hungry.mp4", "anna-sewing.mp4", "anna-tired.mp4"];
  for (const filename of filenames) {
    const video = await readFile(new URL(`../public/assets/videos/${filename}`, import.meta.url));
    const moovOffset = video.indexOf(Buffer.from("moov"));
    const mediaOffset = video.indexOf(Buffer.from("mdat"));
    assert.ok(moovOffset > 0 && mediaOffset > 0, `${filename} contains MP4 playback boxes`);
    assert.ok(moovOffset < mediaOffset, `${filename} stores its playback index before media data`);
  }
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
