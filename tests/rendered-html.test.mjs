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
  assert.match(game, /setShowDeliveryModal\(true\)/);
  assert.match(game, /Отдать заказ/);
  assert.match(game, /передан клиенту/);
  assert.match(game, /setCelebrating\(true\)[\s\S]*setScreen\("home"\)/);
});

test("unlocks drawing when Anna is bored", async () => {
  const game = await readFile(new URL("../app/Game.tsx", import.meta.url), "utf8");
  assert.match(game, /DRAWING_UNLOCK_AT = 100/);
  assert.match(game, /drawingUnlocked/);
  assert.match(game, /Нарисуйте узор/);
  assert.match(game, /setBoredom\(5\)/);
  assert.doesNotMatch(game, /болез|illness|sick/i);
});
