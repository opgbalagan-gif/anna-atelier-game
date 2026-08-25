"use client";

import { useEffect, useMemo, useState } from "react";

const BOARD_SIZE = 7;
const STARTING_MOVES = 24;
const DRAWING_UNLOCK_AT = 100;

const STATE_IMAGES = [
  "assets/states/anna-sewing-day.png",
  "assets/states/anna-bored-day.png",
  "assets/states/anna-hungry-day.png",
  "assets/states/anna-tired-day.png",
  "assets/states/anna-celebrates-day.png",
  "assets/states/anna-eating-day.png",
];

const TILE_TYPES = [
  { name: "катушка ниток", short: "Нитки" },
  { name: "мятная пуговица", short: "Пуговицы" },
  { name: "отрез ткани", short: "Ткань" },
  { name: "ножницы", short: "Ножницы" },
  { name: "игольница", short: "Игольницы" },
  { name: "сантиметровая лента", short: "Ленты" },
] as const;

const ORDERS = [
  { client: "Мадам Роза", title: "Летнее платье", note: "Лёгкое, с карманами и вышивкой", tile: 2, goal: 12, reward: 70, time: "2 дня" },
  { client: "Театр «Лира»", title: "Костюм для премьеры", note: "Бархат, золотая нить и точная посадка", tile: 0, goal: 15, reward: 95, time: "3 дня" },
  { client: "Семья Орловых", title: "Пальто для прогулок", note: "Тёплое, удобное и с яркими пуговицами", tile: 1, goal: 14, reward: 85, time: "4 дня" },
] as const;

const DRAWING_MOTIFS = [
  { symbol: "✿", name: "цветок", tone: "rose" },
  { symbol: "❧", name: "листок", tone: "teal" },
  { symbol: "♡", name: "сердце", tone: "coral" },
  { symbol: "✦", name: "звезда", tone: "gold" },
  { symbol: "⌁", name: "волна", tone: "blue" },
  { symbol: "◌", name: "пуговка", tone: "violet" },
] as const;
const DRAWING_PATTERN = [0, 3, 1, 2];

type Board = number[];
type Screen = "home" | "match3" | "orders" | "drawing";

function assetPath(path: string) {
  const html = typeof globalThis.document === "undefined" ? undefined : globalThis.document.documentElement;
  const prefix = html?.dataset.assetPrefix || "/";
  return `${prefix.replace(/\/?$/, "/")}${path.replace(/^\//, "")}`;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeBoard(seed = 104729): Board {
  const random = seededRandom(seed);
  const board: number[] = [];
  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const row = Math.floor(index / BOARD_SIZE);
    const column = index % BOARD_SIZE;
    let value = Math.floor(random() * TILE_TYPES.length);
    while (
      (column >= 2 && board[index - 1] === value && board[index - 2] === value) ||
      (row >= 2 && board[index - BOARD_SIZE] === value && board[index - BOARD_SIZE * 2] === value)
    ) value = Math.floor(random() * TILE_TYPES.length);
    board.push(value);
  }
  return board;
}

function findMatches(board: Board) {
  const matches = new Set<number>();
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    let runStart = 0;
    for (let column = 1; column <= BOARD_SIZE; column += 1) {
      const current = column < BOARD_SIZE ? board[row * BOARD_SIZE + column] : -1;
      const previous = board[row * BOARD_SIZE + column - 1];
      if (current !== previous) {
        if (column - runStart >= 3) for (let cursor = runStart; cursor < column; cursor += 1) matches.add(row * BOARD_SIZE + cursor);
        runStart = column;
      }
    }
  }
  for (let column = 0; column < BOARD_SIZE; column += 1) {
    let runStart = 0;
    for (let row = 1; row <= BOARD_SIZE; row += 1) {
      const current = row < BOARD_SIZE ? board[row * BOARD_SIZE + column] : -1;
      const previous = board[(row - 1) * BOARD_SIZE + column];
      if (current !== previous) {
        if (row - runStart >= 3) for (let cursor = runStart; cursor < row; cursor += 1) matches.add(cursor * BOARD_SIZE + column);
        runStart = row;
      }
    }
  }
  return matches;
}

function collapseBoard(board: Board, matched: Set<number>): Board {
  const next = [...board];
  for (let column = 0; column < BOARD_SIZE; column += 1) {
    const survivors: number[] = [];
    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const index = row * BOARD_SIZE + column;
      if (!matched.has(index)) survivors.push(board[index]);
    }
    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const index = row * BOARD_SIZE + column;
      next[index] = survivors[BOARD_SIZE - 1 - row] ?? Math.floor(Math.random() * TILE_TYPES.length);
    }
  }
  return next;
}

function areNeighbours(first: number, second: number) {
  const firstRow = Math.floor(first / BOARD_SIZE);
  const firstColumn = first % BOARD_SIZE;
  const secondRow = Math.floor(second / BOARD_SIZE);
  const secondColumn = second % BOARD_SIZE;
  return Math.abs(firstRow - secondRow) + Math.abs(firstColumn - secondColumn) === 1;
}

function TileSprite({ type, small = false }: { type: number; small?: boolean }) {
  return <span className={`tile-sprite tile-sprite-${type}${small ? " tile-sprite-small" : ""}`} style={{ backgroundImage: `url("${assetPath("assets/sewing-tiles.png")}")` }} aria-hidden="true" />;
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="meter-row"><div className="meter-copy"><span>{label}</span><strong>{Math.round(value)}%</strong></div><div className="meter-track" aria-label={`${label}: ${Math.round(value)}%`}><span className={`meter-fill meter-${tone}`} style={{ width: `${value}%` }} /></div></div>;
}

export default function Game() {
  const [screen, setScreen] = useState<Screen>("home");
  const [board, setBoard] = useState<Board>(() => makeBoard());
  const [selected, setSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(STARTING_MOVES);
  const [coins, setCoins] = useState(36);
  const [orderIndex, setOrderIndex] = useState(0);
  const [activeOrder, setActiveOrder] = useState(false);
  const [orderProgress, setOrderProgress] = useState(0);
  const [orderReady, setOrderReady] = useState(false);
  const [completedOrders, setCompletedOrders] = useState<number[]>([]);
  const [showOrderModal, setShowOrderModal] = useState(true);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [hunger, setHunger] = useState(76);
  const [energy, setEnergy] = useState(83);
  const [boredom, setBoredom] = useState(28);
  const [temporaryState, setTemporaryState] = useState<"eating" | null>(null);
  const [toast, setToast] = useState("В ателье пришёл новый заказ");
  const [drawingStep, setDrawingStep] = useState(0);
  const [drawingFeedback, setDrawingFeedback] = useState("Повторите узор по порядку");

  const hasAvailableOrder = orderIndex < ORDERS.length;
  const order = ORDERS[Math.min(orderIndex, ORDERS.length - 1)];
  const drawingUnlocked = boredom >= DRAWING_UNLOCK_AT;
  const levelProgress = Math.min(100, (score / 1600) * 100);
  const averageCare = Math.round((hunger + energy + (100 - boredom)) / 3);

  const annaState = useMemo(() => {
    if (temporaryState === "eating") return "Анна устроила уютный перекус";
    if (celebrating) return "Анна очень довольна проделанной работой!";
    if (energy <= 45) return "Анна устала — устройте небольшой отдых";
    if (hunger <= 45) return "Анна проголодалась — пора перекусить";
    if (drawingUnlocked) return "Анне срочно нужно творческое вдохновение";
    if (boredom >= 55) return "Анна заскучала — пора придумать новый эскиз";
    if (activeOrder) return "Анна работает над новым заказом";
    if (averageCare >= 75) return "Анна полна вдохновения";
    return "Анне не помешает немного заботы";
  }, [activeOrder, averageCare, boredom, celebrating, drawingUnlocked, energy, hunger, temporaryState]);

  const annaVisual = useMemo(() => {
    if (temporaryState === "eating") return { id: "eating", video: assetPath("assets/videos/anna-eating.mp4"), poster: assetPath("assets/states/anna-eating-day.png"), status: "Перекусывает", icon: "☕", alt: "Анна ест круассан и пьёт чай" };
    if (celebrating) return { id: "celebrates", video: assetPath("assets/videos/anna-celebrates.mp4"), poster: assetPath("assets/states/anna-celebrates-day.png"), status: "Радуется", icon: "✦", alt: "Анна радуется готовому заказу" };
    if (energy <= 45) return { id: "tired", video: assetPath("assets/videos/anna-tired.mp4"), poster: assetPath("assets/states/anna-tired-day.png"), status: "Устала", icon: "z", alt: "Уставшая Анна прикрывает зевок" };
    if (hunger <= 45) return { id: "hungry", video: assetPath("assets/videos/anna-hungry.mp4"), poster: assetPath("assets/states/anna-hungry-day.png"), status: "Проголодалась", icon: "⌁", alt: "Проголодавшаяся Анна сделала перерыв" };
    if (boredom >= 55) return { id: "bored", video: assetPath("assets/videos/anna-bored.mp4"), poster: assetPath("assets/states/anna-bored-day.png"), status: "Скучает", icon: "…", alt: "Анна скучает у швейной машинки" };
    return { id: "sewing", video: assetPath("assets/videos/anna-sewing.mp4"), poster: assetPath("assets/states/anna-sewing-day.png"), status: activeOrder ? "Шьёт заказ" : "В ателье", icon: "♡", alt: "Анна в дневном ателье" };
  }, [activeOrder, boredom, celebrating, energy, hunger, temporaryState]);

  useEffect(() => {
    STATE_IMAGES.forEach((src) => { const image = new Image(); image.src = assetPath(src); });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHunger((value) => Math.max(24, value - 1.5));
      setEnergy((value) => Math.max(20, value - 1));
      setBoredom((value) => Math.min(100, value + 2));
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!celebrating) return;
    const fallback = window.setTimeout(() => {
      setCelebrating(false);
      if (activeOrder && orderReady) setShowDeliveryModal(true);
    }, 6500);
    return () => window.clearTimeout(fallback);
  }, [activeOrder, celebrating, orderReady]);

  function acceptOrder() {
    if (!hasAvailableOrder) return;
    setActiveOrder(true); setOrderProgress(0); setOrderReady(false); setMoves(STARTING_MOVES);
    setBoard(makeBoard(Date.now() % 100000)); setShowOrderModal(false); setScreen("match3");
    setToast(`Заказ «${order.title}» принят — соберите ${TILE_TYPES[order.tile].short.toLowerCase()}`);
  }

  function finishCascade(points: number, collected: number[], combo: number) {
    const earnedCoins = Math.max(2, Math.floor(points / 32));
    const newProgress = Math.min(order.goal, orderProgress + collected[order.tile]);
    const materialsComplete = newProgress >= order.goal;
    setScore((value) => value + points); setCoins((value) => value + earnedCoins); setMoves((value) => Math.max(0, value - 1));
    setOrderProgress(newProgress); setOrderReady(materialsComplete);
    setBoredom((value) => Math.max(0, value - Math.min(14, 4 + combo * 2))); setBusy(false);
    if (materialsComplete) {
      setSelected(null); setMatched(new Set()); setCelebrating(true); setScreen("home");
      setToast("Все материалы собраны — Анна радуется готовой работе");
      return;
    }
    setToast(combo > 1 ? `Каскад ×${combo}! +${points} очков` : `Отличный шов! +${points} очков`);
  }

  function runCascade(current: Board, combo: number, points: number, collected: number[]) {
    const matches = findMatches(current);
    if (matches.size === 0) return finishCascade(points, collected, combo - 1);
    const nextCollected = [...collected];
    matches.forEach((index) => { nextCollected[current[index]] += 1; });
    setMatched(matches);
    window.setTimeout(() => {
      const collapsed = collapseBoard(current, matches); setBoard(collapsed); setMatched(new Set());
      window.setTimeout(() => runCascade(collapsed, combo + 1, points + matches.size * 12 * combo, nextCollected), 180);
    }, 260);
  }

  function selectTile(index: number) {
    if (busy || orderReady || !activeOrder) return;
    if (moves <= 0) return setToast("Ходы закончились — начните новый день");
    if (selected === null) return setSelected(index);
    if (selected === index) return setSelected(null);
    if (!areNeighbours(selected, index)) { setSelected(index); setToast("Выберите соседнюю фишку"); return; }
    const swapped = [...board]; [swapped[selected], swapped[index]] = [swapped[index], swapped[selected]]; setSelected(null);
    if (findMatches(swapped).size === 0) {
      setBoard(swapped); setBusy(true); setToast("Здесь ряд не складывается");
      window.setTimeout(() => { setBoard(board); setBusy(false); }, 280); return;
    }
    setBoard(swapped); setBusy(true); setToast("Материалы собраны!");
    window.setTimeout(() => runCascade(swapped, 1, 0, Array(TILE_TYPES.length).fill(0)), 180);
  }

  function careForAnna(kind: "food" | "rest" | "sew") {
    if (kind === "sew") {
      if (activeOrder && orderReady) setShowDeliveryModal(true); else if (activeOrder) setScreen("match3"); else if (hasAvailableOrder) setShowOrderModal(true); else setToast("Все заказы на сегодня выполнены");
      return;
    }
    const cost = kind === "food" ? 8 : 6;
    if (coins < cost) return setToast("Нужно ещё немного монет");
    setCoins((value) => value - cost);
    if (kind === "food") { setHunger((value) => Math.min(100, value + 22)); setTemporaryState("eating"); window.setTimeout(() => setTemporaryState(null), 4200); }
    else setEnergy((value) => Math.min(100, value + 20));
    setToast(kind === "food" ? "Чай и круассан готовы" : "Небольшая передышка");
  }

  function deliverOrder() {
    if (!orderReady || !activeOrder) return;
    const finishedIndex = orderIndex, finishedTitle = order.title, reward = order.reward;
    setCoins((value) => value + reward); setScore((value) => value + reward * 3);
    setCompletedOrders((value) => [...value, finishedIndex]); setActiveOrder(false); setOrderReady(false); setOrderProgress(0);
    setOrderIndex((value) => value + 1); setBoredom((value) => Math.max(0, value - 28)); setCelebrating(false); setShowDeliveryModal(false); setScreen("home");
    setToast(`Заказ «${finishedTitle}» передан клиенту! +${reward} монет`);
  }

  function finishCelebration() {
    if (!celebrating) return;
    setCelebrating(false);
    if (activeOrder && orderReady) setShowDeliveryModal(true);
  }

  function startNewDay() {
    setBoard(makeBoard(Date.now() % 100000)); setSelected(null); setMatched(new Set()); setMoves(STARTING_MOVES); setToast("Новый день в мастерской начался");
  }

  function chooseDrawing(motifIndex: number) {
    if (motifIndex !== DRAWING_PATTERN[drawingStep]) { setDrawingStep(0); setDrawingFeedback("Линия сбилась — начните узор заново"); return; }
    const nextStep = drawingStep + 1;
    if (nextStep === DRAWING_PATTERN.length) {
      setDrawingStep(DRAWING_PATTERN.length); setDrawingFeedback("Эскиз готов! Анна снова полна идей");
      setBoredom(5); setScore((value) => value + 140); setCoins((value) => value + 8); setToast("Новый эскиз готов · +140 очков");
      window.setTimeout(() => { setDrawingStep(0); setDrawingFeedback("Повторите узор по порядку"); setScreen("home"); }, 1500); return;
    }
    setDrawingStep(nextStep); setDrawingFeedback(`Верно! Осталось штрихов: ${DRAWING_PATTERN.length - nextStep}`);
  }

  const header = <>
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true">А</div><div><p className="eyebrow">уютная история мастерской</p><h1>Ателье Анны</h1></div></div><div className="topbar-stats" aria-label="Игровые показатели"><div className="stat-chip"><span>✦</span><strong>{score.toLocaleString("ru-RU")}</strong><small>очки</small></div><div className="stat-chip stat-coin"><span>●</span><strong>{coins}</strong><small>монеты</small></div><div className="level-chip"><div><strong>Уровень 1</strong><span>{Math.round(levelProgress)}%</span></div><div className="level-track"><span style={{ width: `${levelProgress}%` }} /></div></div></div></header>
    <nav className="app-nav" aria-label="Разделы игры"><button type="button" className={screen === "home" ? "nav-active" : ""} disabled={celebrating} onClick={() => setScreen("home")}><span>⌂</span>Ателье</button><button type="button" className={screen === "orders" ? "nav-active" : ""} disabled={celebrating} onClick={() => setScreen("orders")}><span>▤</span>Заказы<b>{activeOrder ? 1 : hasAvailableOrder ? "!" : "✓"}</b></button>{activeOrder && <button type="button" className={screen === "match3" ? "nav-active" : ""} disabled={celebrating} onClick={() => orderReady ? setShowDeliveryModal(true) : setScreen("match3")}><span>✂</span>{celebrating ? "Радуется" : orderReady ? "Отдать" : "Шить"}</button>}{drawingUnlocked && <button type="button" className={`draw-nav${screen === "drawing" ? " nav-active" : ""}`} disabled={celebrating} onClick={() => setScreen("drawing")}><span>✎</span>Рисовать</button>}</nav>
  </>;

  const annaCard = <aside className="anna-card panel"><div className="character-stage"><video key={annaVisual.video} className="scene-image" autoPlay loop={!celebrating} muted playsInline preload="auto" poster={annaVisual.poster} aria-label={annaVisual.alt} onEnded={celebrating ? finishCelebration : undefined}><source src={annaVisual.video} type="video/mp4" /></video><div className="stage-glow" /><div className="status-pill"><span>{annaVisual.id === "sewing" ? "✂" : annaVisual.icon}</span><strong>{annaVisual.status}</strong></div><span className={`mood-bubble${annaVisual.id !== "sewing" ? " boredom-alert" : ""}`} aria-label={`Состояние Анны: ${annaVisual.status}`}>{annaVisual.icon}</span></div><div className="anna-copy"><div className="section-heading compact-heading"><div><p className="eyebrow">хозяйка ателье</p><h2>Анна</h2></div><span className="care-score">{averageCare}%</span></div><p className="anna-state">{annaState}</p>{celebrating && <div className="celebration-banner"><span>✦</span><strong>Материалы собраны!</strong><small>{toast}</small></div>}<div className="meters"><Meter label="Сытость" value={hunger} tone="coral" /><Meter label="Энергия" value={energy} tone="gold" /><Meter label="Скука" value={boredom} tone="boredom" /></div><div className={`care-actions${drawingUnlocked ? " has-drawing" : ""}`}><button type="button" disabled={celebrating} onClick={() => careForAnna("food")}><span>☕</span><strong>Перекус</strong><small>8 ●</small></button><button type="button" disabled={celebrating} onClick={() => careForAnna("rest")}><span>☁</span><strong>Отдых</strong><small>6 ●</small></button><button type="button" onClick={() => careForAnna("sew")} disabled={celebrating}><span>✂</span><strong>{celebrating ? "Радуется" : orderReady ? "Отдать" : activeOrder ? "Шить" : "Заказ"}</strong><small>{celebrating ? "подождите" : orderReady ? "клиенту" : activeOrder ? "продолжить" : "принять"}</small></button>{drawingUnlocked && <button type="button" className="drawing-action" disabled={celebrating} onClick={() => setScreen("drawing")}><span>✎</span><strong>Рисовать</strong><small>− скука</small></button>}</div></div></aside>;

  const homeScreen = <section className="home-layout screen-enter" aria-label="Главный экран ателье">{annaCard}<aside className="home-sidebar"><section className="home-action-card panel"><div className="section-heading"><div><p className="eyebrow">Сегодня в ателье</p><h2>{activeOrder ? orderReady ? "Заказ можно отдать" : "Заказ в работе" : hasAvailableOrder ? "Новое письмо" : "Все готово"}</h2></div><span className="mail-seal">{activeOrder ? "✂" : "✉"}</span></div>{activeOrder ? <div className="home-order-preview"><div className="client-row"><div className="client-avatar">{order.client.slice(0, 1)}</div><div><small>Клиент</small><strong>{order.client}</strong></div></div><h3>{order.title}</h3><p>{order.note}</p><div className="home-progress"><span style={{ width: `${(orderProgress / order.goal) * 100}%` }} /></div><div className="progress-copy"><span>Материалы</span><strong>{orderProgress}/{order.goal}</strong></div><button type="button" className="primary-button" disabled={celebrating} onClick={() => orderReady ? setShowDeliveryModal(true) : setScreen("match3")}>{celebrating ? "Анна радуется…" : orderReady ? "Отдать заказ" : "Продолжить шить"}</button></div> : hasAvailableOrder ? <div className="letter-preview"><p>«Анна, очень надеюсь на ваше мастерство. Мне нужен особенный наряд…»</p><div><strong>{order.client}</strong><span>{order.time}</span></div><button type="button" className="primary-button" onClick={() => setShowOrderModal(true)}>Открыть заказ</button></div> : <div className="empty-day"><span>✓</span><h3>Все заказы выполнены</h3><p>Можно отдохнуть или порисовать новые эскизы.</p></div>}</section><section className={`inspiration-card panel${drawingUnlocked ? " inspiration-ready" : ""}`}><div><p className="eyebrow">творческое настроение</p><h3>{drawingUnlocked ? "Скука заполнилась" : "Альбом эскизов"}</h3><p>{drawingUnlocked ? "Анне пора отвлечься и нарисовать новый узор." : `Мини-игра откроется при скуке ${DRAWING_UNLOCK_AT}%`}</p></div><button type="button" disabled={!drawingUnlocked || celebrating} onClick={() => setScreen("drawing")}>{drawingUnlocked ? "Рисовать" : `${Math.round(boredom)}%`}</button></section><section className="home-note panel"><span>⌁</span><p><strong>Совет Анны</strong>Соберите материал в «3 в ряд», посмотрите, как Анна радуется, и передайте заказ клиенту.</p></section></aside></section>;

  const matchScreen = activeOrder ? <section className="screen-enter"><div className="screen-topline"><button type="button" className="back-button" onClick={() => setScreen("home")}>← В ателье</button><div><p className="eyebrow">заказ в работе</p><h2>{order.title}</h2></div></div><div className="match-layout"><section id="match-board" className="board-panel panel" aria-label="Поле три в ряд"><div className="section-heading board-heading"><div><p className="eyebrow">мастерская · этап материалов</p><h2>Соберите материалы</h2></div><div className={`moves-badge${moves <= 5 ? " moves-low" : ""}`}><strong>{moves}</strong><span>ходов</span></div></div><div className="task-strip"><TileSprite type={order.tile} small /><div><span>Нужно для заказа</span><strong>{TILE_TYPES[order.tile].short}</strong></div><div className="mini-progress"><span style={{ width: `${(orderProgress / order.goal) * 100}%` }} /></div><b>{orderProgress}/{order.goal}</b></div><div className={`match-board${busy ? " board-busy" : ""}`} role="grid" aria-label="Игровое поле 7 на 7">{board.map((type, index) => <button className={`tile tile-type-${type}${selected === index ? " tile-selected" : ""}${matched.has(index) ? " tile-matched" : ""}`} key={index} type="button" role="gridcell" aria-label={`${TILE_TYPES[type].name}, ряд ${Math.floor(index / BOARD_SIZE) + 1}, столбец ${(index % BOARD_SIZE) + 1}`} aria-pressed={selected === index} onClick={() => selectTile(index)} disabled={busy || orderReady}><TileSprite type={type} /></button>)}</div><div className="board-footer"><p aria-live="polite"><span>✦</span>{toast}</p><button type="button" className="text-button" onClick={startNewDay}>Новый день</button></div></section><aside className="order-brief-stack"><section className={`order-card panel${orderReady ? " order-ready" : ""}`}><div className="order-topline"><span>Текущий заказ</span><b>{order.time}</b></div><div className="client-row"><div className="client-avatar">{order.client.slice(0, 1)}</div><div><small>Клиент</small><strong>{order.client}</strong></div></div><div className="dress-sketch" aria-hidden="true"><div className="dress-hanger" /><div className="dress-bodice" /><div className="dress-skirt" /><span>✿</span></div><h2>{order.title}</h2><p>{order.note}</p><div className="order-material"><TileSprite type={order.tile} small /><div><span>Материал собран</span><strong>{orderProgress} из {order.goal}</strong></div><div className="ring-progress">{Math.round((orderProgress / order.goal) * 100)}%</div></div><button type="button" className="primary-button ready-button" disabled>{orderReady ? "Возвращаемся к Анне…" : "Сначала соберите материал"}</button></section><div className="tip-card"><span>⌁</span><p><strong>Как играть</strong>Меняйте соседние фишки и собирайте ряды от трёх.</p></div></aside></div></section> : homeScreen;

  const ordersScreen = <section className="orders-page panel screen-enter" aria-label="Заказы"><div className="orders-header"><div><p className="eyebrow">книга мастерской</p><h2>Заказы</h2><p>Здесь хранятся новые, текущие и завершённые работы.</p></div><span>{completedOrders.length}/{ORDERS.length}</span></div><div className="orders-grid">{ORDERS.map((item, index) => { const completed = completedOrders.includes(index), current = activeOrder && index === orderIndex, available = !activeOrder && index === orderIndex && hasAvailableOrder; return <article className={`orders-list-card${completed ? " order-completed" : ""}${current ? " order-current" : ""}`} key={item.title}><div className="order-list-number">{completed ? "✓" : index + 1}</div><div className="order-list-copy"><div><span>{item.client}</span><b>{completed ? "Готово" : current ? orderReady ? "Можно отдать" : "В работе" : available ? "Новое" : "Ожидает"}</b></div><h3>{item.title}</h3><p>{item.note}</p><small>Награда {item.reward} ● · {item.time}</small></div>{current && <button type="button" disabled={celebrating} onClick={() => orderReady ? setShowDeliveryModal(true) : setScreen("match3")}>{celebrating ? "Анна радуется…" : orderReady ? "Отдать" : `${orderProgress}/${item.goal}`}</button>}{available && <button type="button" onClick={() => setShowOrderModal(true)}>Открыть</button>}</article>; })}</div></section>;

  const drawingScreen = <section className="drawing-page screen-enter"><div className="screen-topline"><button type="button" className="back-button" onClick={() => setScreen("home")}>← В ателье</button><div><p className="eyebrow">альбом вдохновения</p><h2>Нарисуйте узор</h2></div></div><div className="drawing-layout"><section className="sketchbook panel"><div className="sketchbook-binding" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div><div className="sketch-page"><p className="eyebrow">эскиз № 12</p><h3>Узор для нового платья</h3><p>Нажимайте на рисунки снизу в том же порядке, что в подсказке.</p><div className="drawing-pattern" aria-label="Последовательность узора">{DRAWING_PATTERN.map((motif, index) => <div className={`${index < drawingStep ? "pattern-done" : ""}${index === drawingStep ? " pattern-current" : ""}`} key={`${motif}-${index}`}><span>{DRAWING_MOTIFS[motif].symbol}</span><small>{index + 1}</small></div>)}</div><div className="sketch-result" aria-live="polite"><div className="sketch-dress" aria-hidden="true"><span>{DRAWING_PATTERN.slice(0, drawingStep).map((motif) => DRAWING_MOTIFS[motif].symbol).join(" ")}</span></div><p>{drawingFeedback}</p></div></div></section><aside className="drawing-tools panel"><div><p className="eyebrow">палитра узоров</p><h3>Выберите рисунок</h3></div><div className="motif-grid">{DRAWING_MOTIFS.map((motif, index) => <button type="button" className={`drawing-motif motif-${motif.tone}`} key={motif.name} onClick={() => chooseDrawing(index)} disabled={drawingStep === DRAWING_PATTERN.length}><span>{motif.symbol}</span><small>{motif.name}</small></button>)}</div><div className="drawing-reward"><span>✦</span><div><strong>Награда за эскиз</strong><small>140 очков · скука исчезнет</small></div></div></aside></div></section>;

  return <main className="game-shell">{header}{screen === "home" && homeScreen}{screen === "match3" && matchScreen}{screen === "orders" && ordersScreen}{screen === "drawing" && drawingScreen}{showOrderModal && !activeOrder && hasAvailableOrder && <div className="order-modal-backdrop" role="presentation"><section className="order-modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title"><button type="button" className="modal-close" aria-label="Закрыть письмо" onClick={() => setShowOrderModal(false)}>×</button><div className="letter-stamp" aria-hidden="true">✿</div><p className="eyebrow">новый заказ</p><h2 id="new-order-title">{order.title}</h2><div className="modal-client"><span>{order.client.slice(0, 1)}</span><div><small>Пишет</small><strong>{order.client}</strong></div></div><p className="order-letter">«{order.note}. Очень надеюсь на ваше мастерство, Анна!»</p><div className="modal-order-details"><div><span>Материал</span><strong>{TILE_TYPES[order.tile].short} · {order.goal}</strong></div><div><span>Срок</span><strong>{order.time}</strong></div><div><span>Награда</span><strong>{order.reward} ●</strong></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowOrderModal(false)}>Не сейчас</button><button type="button" className="primary-button" onClick={acceptOrder}>Принять заказ</button></div></section></div>}{showDeliveryModal && activeOrder && orderReady && <div className="order-modal-backdrop" role="presentation"><section className="order-modal delivery-modal" role="dialog" aria-modal="true" aria-labelledby="delivery-order-title"><button type="button" className="modal-close" aria-label="Закрыть окно передачи" onClick={() => setShowDeliveryModal(false)}>×</button><div className="delivery-ribbon" aria-hidden="true">✓</div><p className="eyebrow">работа закончена</p><h2 id="delivery-order-title">Отдать заказ?</h2><div className="modal-client"><span>{order.client.slice(0, 1)}</span><div><small>Получит</small><strong>{order.client}</strong></div></div><p className="order-letter">Все материалы собраны, и Анна закончила работу. Передать клиенту «{order.title}»?</p><div className="modal-order-details"><div><span>Материал</span><strong>{orderProgress}/{order.goal}</strong></div><div><span>Заказ</span><strong>Готов</strong></div><div><span>Награда</span><strong>{order.reward} ●</strong></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowDeliveryModal(false)}>Оставить в ателье</button><button type="button" className="primary-button" onClick={deliverOrder}>Отдать заказ</button></div></section></div>}</main>;
}
