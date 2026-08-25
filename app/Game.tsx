"use client";

import { useEffect, useMemo, useState } from "react";

const BOARD_SIZE = 7;
const STARTING_MOVES = 24;
const STATE_IMAGES = [
  "/assets/states/anna-sewing-day.png",
  "/assets/states/anna-bored-day.png",
  "/assets/states/anna-hungry-day.png",
  "/assets/states/anna-tired-day.png",
  "/assets/states/anna-celebrates-day.png",
];

const TILE_TYPES = [
  { id: 0, name: "катушка ниток", short: "Нитки" },
  { id: 1, name: "мятная пуговица", short: "Пуговицы" },
  { id: 2, name: "отрез ткани", short: "Ткань" },
  { id: 3, name: "ножницы", short: "Ножницы" },
  { id: 4, name: "игольница", short: "Игольницы" },
  { id: 5, name: "сантиметровая лента", short: "Ленты" },
] as const;

const ORDERS = [
  {
    client: "Мадам Роза",
    title: "Летнее платье",
    note: "Лёгкое, с карманами и вышивкой",
    tile: 2,
    goal: 12,
    reward: 70,
    time: "2 дня",
  },
  {
    client: "Театр «Лира»",
    title: "Костюм для премьеры",
    note: "Бархат, золотая нить и точная посадка",
    tile: 0,
    goal: 15,
    reward: 95,
    time: "3 дня",
  },
  {
    client: "Семья Орловых",
    title: "Пальто для прогулок",
    note: "Тёплое, удобное и с яркими пуговицами",
    tile: 1,
    goal: 14,
    reward: 85,
    time: "4 дня",
  },
] as const;

type Board = number[];

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
      (row >= 2 &&
        board[index - BOARD_SIZE] === value &&
        board[index - BOARD_SIZE * 2] === value)
    ) {
      value = Math.floor(random() * TILE_TYPES.length);
    }

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
        if (column - runStart >= 3) {
          for (let cursor = runStart; cursor < column; cursor += 1) {
            matches.add(row * BOARD_SIZE + cursor);
          }
        }
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
        if (row - runStart >= 3) {
          for (let cursor = runStart; cursor < row; cursor += 1) {
            matches.add(cursor * BOARD_SIZE + column);
          }
        }
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
  return (
    <span
      className={`tile-sprite tile-sprite-${type}${small ? " tile-sprite-small" : ""}`}
      aria-hidden="true"
    />
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="meter-row">
      <div className="meter-copy">
        <span>{label}</span>
        <strong>{Math.round(value)}%</strong>
      </div>
      <div className="meter-track" aria-label={`${label}: ${Math.round(value)}%`}>
        <span className={`meter-fill meter-${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function Game() {
  const [board, setBoard] = useState<Board>(() => makeBoard());
  const [selected, setSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(STARTING_MOVES);
  const [coins, setCoins] = useState(36);
  const [orderIndex, setOrderIndex] = useState(0);
  const [orderProgress, setOrderProgress] = useState(0);
  const [orderReady, setOrderReady] = useState(false);
  const [hunger, setHunger] = useState(76);
  const [energy, setEnergy] = useState(83);
  const [boredom, setBoredom] = useState(28);
  const [toast, setToast] = useState("Соберите материалы для заказа");

  const order = ORDERS[orderIndex % ORDERS.length];
  const levelProgress = Math.min(100, (score / 1600) * 100);
  const averageCare = Math.round((hunger + energy + (100 - boredom)) / 3);

  const annaState = useMemo(() => {
    if (orderReady) return "Анна закончила заказ и ждёт клиента";
    if (energy <= 45) return "Анна устала — устройте небольшой отдых";
    if (hunger <= 45) return "Анна проголодалась — пора перекусить";
    if (boredom >= 68) return "Анна заскучала — пора сшить что-нибудь";
    if (boredom >= 45) return "Анна ждёт новый творческий заказ";
    if (averageCare >= 75) return "Анна полна вдохновения";
    if (averageCare >= 48) return "Анне не помешает забота";
    return "Анна устала — устройте перерыв";
  }, [averageCare, boredom, energy, hunger, orderReady]);

  const annaVisual = useMemo(() => {
    if (orderReady) return { id: "celebrates", src: "/assets/states/anna-celebrates-day.png", status: "Заказ готов", icon: "✦", alt: "Анна радуется готовому заказу" };
    if (energy <= 45) return { id: "tired", src: "/assets/states/anna-tired-day.png", status: "Устала", icon: "z", alt: "Уставшая Анна прикрывает зевок" };
    if (hunger <= 45) return { id: "hungry", src: "/assets/states/anna-hungry-day.png", status: "Проголодалась", icon: "⌁", alt: "Проголодавшаяся Анна сделала перерыв" };
    if (boredom >= 55) return { id: "bored", src: "/assets/states/anna-bored-day.png", status: "Скучает", icon: "…", alt: "Анна скучает у швейной машинки" };
    return { id: "sewing", src: "/assets/states/anna-sewing-day.png", status: "Шьёт заказ", icon: "♡", alt: "Анна шьёт заказ в дневном ателье" };
  }, [boredom, energy, hunger, orderReady]);

  useEffect(() => {
    STATE_IMAGES.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHunger((value) => Math.max(24, value - 1.5));
      setEnergy((value) => Math.max(20, value - 1));
      setBoredom((value) => Math.min(100, value + 2));
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  function finishCascade(points: number, collected: number[], combo: number) {
    const earnedCoins = Math.max(2, Math.floor(points / 32));
    const newProgress = Math.min(order.goal, orderProgress + collected[order.tile]);

    setScore((value) => value + points);
    setCoins((value) => value + earnedCoins);
    setMoves((value) => Math.max(0, value - 1));
    setOrderProgress(newProgress);
    setOrderReady(newProgress >= order.goal);
    setBoredom((value) => Math.max(0, value - Math.min(14, 4 + combo * 2)));
    setBusy(false);
    setToast(
      newProgress >= order.goal
        ? "Заказ готов — можно отдавать клиенту!"
        : combo > 1
          ? `Каскад ×${combo}! +${points} очков`
          : `Отличный шов! +${points} очков`,
    );
  }

  function runCascade(current: Board, combo: number, points: number, collected: number[]) {
    const matches = findMatches(current);
    if (matches.size === 0) {
      finishCascade(points, collected, combo - 1);
      return;
    }

    const nextCollected = [...collected];
    matches.forEach((index) => {
      nextCollected[current[index]] += 1;
    });
    setMatched(matches);

    window.setTimeout(() => {
      const collapsed = collapseBoard(current, matches);
      setBoard(collapsed);
      setMatched(new Set());
      window.setTimeout(
        () => runCascade(collapsed, combo + 1, points + matches.size * 12 * combo, nextCollected),
        180,
      );
    }, 260);
  }

  function selectTile(index: number) {
    if (busy || orderReady) return;
    if (moves <= 0) {
      setToast("Ходы закончились — начните новый день");
      return;
    }

    if (selected === null) {
      setSelected(index);
      return;
    }

    if (selected === index) {
      setSelected(null);
      return;
    }

    if (!areNeighbours(selected, index)) {
      setSelected(index);
      setToast("Выберите соседнюю фишку");
      return;
    }

    const swapped = [...board];
    [swapped[selected], swapped[index]] = [swapped[index], swapped[selected]];
    setSelected(null);

    if (findMatches(swapped).size === 0) {
      setBoard(swapped);
      setBusy(true);
      setToast("Здесь ряд не складывается");
      window.setTimeout(() => {
        setBoard(board);
        setBusy(false);
      }, 280);
      return;
    }

    setBoard(swapped);
    setBusy(true);
    setToast("Материалы собраны!");
    window.setTimeout(
      () => runCascade(swapped, 1, 0, Array(TILE_TYPES.length).fill(0)),
      180,
    );
  }

  function careForAnna(kind: "food" | "rest" | "sew") {
    if (kind === "sew") {
      document.getElementById("match-board")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setToast(boredom >= 55 ? "Анна соскучилась по шитью — соберите ряд" : "Пора заняться новым заказом");
      return;
    }

    const cost = kind === "food" ? 8 : 6;
    if (coins < cost) {
      setToast("Нужно ещё немного монет");
      return;
    }
    setCoins((value) => value - cost);
    if (kind === "food") setHunger((value) => Math.min(100, value + 22));
    if (kind === "rest") setEnergy((value) => Math.min(100, value + 20));
    setToast(kind === "food" ? "Чай и круассан готовы" : "Небольшая передышка");
  }

  function deliverOrder() {
    if (!orderReady) return;
    setCoins((value) => value + order.reward);
    setScore((value) => value + order.reward * 3);
    setOrderIndex((value) => value + 1);
    setOrderProgress(0);
    setOrderReady(false);
    setMoves((value) => Math.min(STARTING_MOVES, value + 6));
    setBoredom((value) => Math.max(0, value - 28));
    setToast(`Заказ «${order.title}» сдан! +${order.reward} монет`);
  }

  function startNewDay() {
    setBoard(makeBoard(Date.now() % 100000));
    setSelected(null);
    setMatched(new Set());
    setMoves(STARTING_MOVES);
    setToast("Новый день в ателье начался");
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">А</div>
          <div>
            <p className="eyebrow">уютная история мастерской</p>
            <h1>Ателье Анны</h1>
          </div>
        </div>
        <div className="topbar-stats" aria-label="Игровые показатели">
          <div className="stat-chip"><span aria-hidden="true">✦</span><strong>{score.toLocaleString("ru-RU")}</strong><small>очки</small></div>
          <div className="stat-chip stat-coin"><span aria-hidden="true">●</span><strong>{coins}</strong><small>монеты</small></div>
          <div className="level-chip">
            <div><strong>Уровень 1</strong><span>{Math.round(levelProgress)}%</span></div>
            <div className="level-track"><span style={{ width: `${levelProgress}%` }} /></div>
          </div>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="anna-card panel">
          <div className="character-stage">
            <img key={annaVisual.src} className="scene-image" src={annaVisual.src} alt={annaVisual.alt} />
            <div className="stage-glow" />
            <div className="status-pill"><span aria-hidden="true">{annaVisual.id === "sewing" ? "✂" : annaVisual.icon}</span><strong>{annaVisual.status}</strong></div>
            <span className={`mood-bubble${annaVisual.id !== "sewing" ? " boredom-alert" : ""}`} aria-label={`Состояние Анны: ${annaVisual.status}`}>{annaVisual.icon}</span>
          </div>
          <div className="anna-copy">
            <div className="section-heading compact-heading">
              <div><p className="eyebrow">хозяйка ателье</p><h2>Анна</h2></div>
              <span className="care-score">{averageCare}%</span>
            </div>
            <p className="anna-state">{annaState}</p>
            <div className="meters">
              <Meter label="Сытость" value={hunger} tone="coral" />
              <Meter label="Энергия" value={energy} tone="gold" />
              <Meter label="Скука" value={boredom} tone="boredom" />
            </div>
            <div className="care-actions">
              <button type="button" onClick={() => careForAnna("food")}><span>☕</span><strong>Перекус</strong><small>8 ●</small></button>
              <button type="button" onClick={() => careForAnna("rest")}><span>☁</span><strong>Отдых</strong><small>6 ●</small></button>
              <button type="button" className={boredom >= 55 ? "sew-highlight" : ""} onClick={() => careForAnna("sew")}><span>✂</span><strong>Шить</strong><small>− скука</small></button>
            </div>
          </div>
        </aside>

        <section id="match-board" className="board-panel panel" aria-label="Поле три в ряд">
          <div className="section-heading board-heading">
            <div>
              <p className="eyebrow">мастерская · день 1</p>
              <h2>Соберите материалы</h2>
            </div>
            <div className={`moves-badge${moves <= 5 ? " moves-low" : ""}`}>
              <strong>{moves}</strong><span>ходов</span>
            </div>
          </div>

          <div className="task-strip">
            <TileSprite type={order.tile} small />
            <div><span>Нужно для заказа</span><strong>{TILE_TYPES[order.tile].short}</strong></div>
            <div className="mini-progress"><span style={{ width: `${(orderProgress / order.goal) * 100}%` }} /></div>
            <b>{orderProgress}/{order.goal}</b>
          </div>

          <div className={`match-board${busy ? " board-busy" : ""}`} role="grid" aria-label="Игровое поле 7 на 7">
            {board.map((type, index) => (
              <button
                className={`tile tile-type-${type}${selected === index ? " tile-selected" : ""}${matched.has(index) ? " tile-matched" : ""}`}
                key={index}
                type="button"
                role="gridcell"
                aria-label={`${TILE_TYPES[type].name}, ряд ${Math.floor(index / BOARD_SIZE) + 1}, столбец ${(index % BOARD_SIZE) + 1}`}
                aria-pressed={selected === index}
                onClick={() => selectTile(index)}
                disabled={busy || orderReady}
              >
                <TileSprite type={type} />
              </button>
            ))}
          </div>

          <div className="board-footer">
            <p aria-live="polite"><span aria-hidden="true">✦</span>{toast}</p>
            <button type="button" className="text-button" onClick={startNewDay}>Новый день</button>
          </div>
        </section>

        <aside className="order-column">
          <section className={`order-card panel${orderReady ? " order-ready" : ""}`}>
            <div className="order-topline"><span>Текущий заказ</span><b>{order.time}</b></div>
            <div className="client-row">
              <div className="client-avatar" aria-hidden="true">{order.client.slice(0, 1)}</div>
              <div><small>Клиент</small><strong>{order.client}</strong></div>
            </div>
            <div className="dress-sketch" aria-hidden="true">
              <div className="dress-hanger" />
              <div className="dress-bodice" />
              <div className="dress-skirt" />
              <span>✿</span>
            </div>
            <h2>{order.title}</h2>
            <p>{order.note}</p>
            <div className="order-material">
              <TileSprite type={order.tile} small />
              <div><span>Материал собран</span><strong>{orderProgress} из {order.goal}</strong></div>
              <div className="ring-progress">{Math.round((orderProgress / order.goal) * 100)}%</div>
            </div>
            <button type="button" className="primary-button" disabled={!orderReady} onClick={deliverOrder}>
              {orderReady ? `Сдать заказ · +${order.reward} ●` : `Награда · ${order.reward} ●`}
            </button>
          </section>

          <section className="next-card panel">
            <div><p className="eyebrow">следующий заказ</p><strong>{ORDERS[(orderIndex + 1) % ORDERS.length].title}</strong></div>
            <span aria-hidden="true">→</span>
          </section>

          <div className="tip-card">
            <span aria-hidden="true">⌁</span>
            <p><strong>Совет Анны</strong>Меняйте соседние фишки местами и собирайте ряды от трёх.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
