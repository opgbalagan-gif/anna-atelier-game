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
  assert.match(html, /Принять заказ/);
  assert.match(html, /Заказы/);
  assert.match(html, /Скука/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("connects the complete order flow", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.match(game, /type Screen = "home" \| "match3" \| "orders" \| "drawing"/);
  assert.match(game, /Принять заказ/);
  assert.match(game, /setScreen\("match3"\)/);
  assert.match(game, /id="match-board"/);
  assert.match(game, /setScreen\("home"\)/);
  assert.match(game, /setCelebrating\(true\)/);
  assert.match(game, /onEnded=\{celebrating \? finishCelebration/);
  assert.match(game, /setShowOrderReadyMessage\(true\)/);
  assert.match(game, /Заказ готов!/);
  assert.match(game, /setCompletedOrders/);
  assert.match(game, /Заказ «\$\{finishedTitle\}» готов!/);
  assert.doesNotMatch(game, /showDeliveryModal|deliverOrder|Отдать заказ|передан клиенту/);
});

test("keeps every activity inside one studio window", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.match(game, /className=\{`studio-window studio-window-\$\{screen\}`\}/);
  assert.match(game, /aria-label="Главное окно игры"/);
  assert.match(game, /aria-label="Игра три в ряд"/);
  assert.match(game, /aria-label="Игра с рисунками"/);
  assert.doesNotMatch(game, /className="screen-topline"/);
});

test("shows the active match-three task below the board", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const boardIndex = game.indexOf('aria-label="Игровое поле 7 на 7"');
  const taskIndex = game.indexOf('className={`match-task-card panel');
  assert.ok(boardIndex >= 0, "match-three board is present");
  assert.ok(taskIndex > boardIndex, "order task follows the board");
  assert.match(game, /Задание заказа/);
});

test("switches Anna states without static pictures", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(game, /poster=|STATE_IMAGES|assets\/states\//);
  assert.match(game, /<video[^>]+autoPlay[^>]+preload="auto"/);
});

test("keeps only the title above Anna on mobile", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /Ателье Анны/);
  assert.match(game, /mobile-player-panel/);
  assert.match(css, /\.topbar > \.topbar-stats\s*\{\s*display: none/);
  assert.match(css, /\.mobile-player-panel\s*\{\s*display: block/);
  assert.match(css, /\.app-nav\s*\{[^}]*position: fixed[^}]*bottom:/);
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

test("moves the mobile match-three board closer to the top", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /screen === "match3" \? "topbar topbar-match-hidden"/);
  assert.match(css, /\.topbar\.topbar-match-hidden\s*\{\s*display: none/);
  assert.match(css, /\.topbar-match-hidden ~ \.studio-window \.board-panel\s*\{\s*padding-top: 15px/);
  assert.doesNotMatch(css, /:has\(#match-board\)/);
});

test("unlocks drawing when Anna is bored", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.match(game, /DRAWING_UNLOCK_AT = 100/);
  assert.match(game, /drawingUnlocked/);
  assert.match(game, /Нарисуйте узор/);
  assert.match(game, /setBoredom\(5\)/);
  assert.doesNotMatch(game, /болез|illness|sick/i);
});
