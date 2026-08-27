"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clearGameSave, readGameSave, RELEASE_VERSION, writeGameSave } from "./game-save";
import type { GameSaveState } from "./game-save";

const BOARD_SIZE = 7;
const STARTING_MOVES = 24;
const DRAWING_UNLOCK_AT = 50;

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

const DRAWING_SKETCHES = [
  { name: "Цветок", instruction: "Проведите пальцем по лепесткам, листьям и стеблю", asset: "assets/drawing/sketch-flower.png" },
  { name: "Платье", instruction: "Обведите воротник, рукава и пышную юбку", asset: "assets/drawing/sketch-dress.png" },
  { name: "Котёнок", instruction: "Обведите ушки, лапки и пушистый хвост", asset: "assets/drawing/sketch-kitten.png" },
] as const;

const DRAWING_COLORS = [
  { id: "rose", name: "Роза", value: "#b85f69" },
  { id: "teal", name: "Мята", value: "#3f817c" },
  { id: "gold", name: "Мёд", value: "#d29a3c" },
  { id: "violet", name: "Слива", value: "#796383" },
] as const;

const DRAWING_STAMPS = [
  { symbol: "✿", name: "Цветы" },
  { symbol: "♡", name: "Сердца" },
  { symbol: "✦", name: "Искры" },
] as const;

type DrawingPhase = "trace" | "color" | "stamp" | "done";
type DrawingColor = (typeof DRAWING_COLORS)[number]["id"];
type SoundEffect = "tap" | "coin" | "success" | "rest" | "alert" | "fail" | "welcome";
type AnnaVisual = { id: string; video: string; status: string; icon: string; alt: string };
type ColoringRegionMap = { labels: Int32Array; sizes: number[]; width: number; height: number };

type Board = number[];
type Screen = "home" | "match3" | "drawing";

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

function createColoringRegionMap(source: ImageData): ColoringRegionMap {
  const { width, height, data } = source;
  const total = width * height;
  const labels = new Int32Array(total);
  const paintable = new Uint8Array(total);
  const queue = new Int32Array(total);
  const sizes = [0];

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const luminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    paintable[index] = data[offset + 3] > 0 && luminance > 176 ? 1 : 0;
  }

  let nextLabel = 0;
  for (let start = 0; start < total; start += 1) {
    if (!paintable[start] || labels[start]) continue;
    nextLabel += 1;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail] = start;
    tail += 1;
    labels[start] = nextLabel;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      size += 1;
      const x = index % width;
      const candidates = [index - width, index + width];
      if (x > 0) candidates.push(index - 1);
      if (x < width - 1) candidates.push(index + 1);
      candidates.forEach((candidate) => {
        if (candidate < 0 || candidate >= total || !paintable[candidate] || labels[candidate]) return;
        labels[candidate] = nextLabel;
        queue[tail] = candidate;
        tail += 1;
      });
    }
    sizes[nextLabel] = size;
  }

  return { labels, sizes, width, height };
}

function TileSprite({ type, small = false }: { type: number; small?: boolean }) {
  return <span className={`tile-sprite tile-sprite-${type}${small ? " tile-sprite-small" : ""}`} style={{ backgroundImage: `url("${assetPath("assets/sewing-tiles.png")}")` }} aria-hidden="true" />;
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="meter-row"><div className="meter-copy"><span>{label}</span><strong>{Math.round(value)}%</strong></div><div className="meter-track" aria-label={`${label}: ${Math.round(value)}%`}><span className={`meter-fill meter-${tone}`} style={{ width: `${value}%` }} /></div></div>;
}

export default function Game() {
  const [saveReady, setSaveReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [board, setBoard] = useState<Board>(() => makeBoard());
  const [selected, setSelected] = useState<number | null>(null);
  const swipeStart = useRef<{ index: number; x: number; y: number; pointerId: number } | null>(null);
  const suppressNextClick = useRef(false);
  const [matched, setMatched] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(STARTING_MOVES);
  const [coins, setCoins] = useState(36);
  const [orderIndex, setOrderIndex] = useState(0);
  const [activeOrder, setActiveOrder] = useState(false);
  const [orderProgress, setOrderProgress] = useState(0);
  const [orderReady, setOrderReady] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showOrderReadyMessage, setShowOrderReadyMessage] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [hunger, setHunger] = useState(76);
  const [energy, setEnergy] = useState(83);
  const [boredom, setBoredom] = useState(28);
  const [temporaryState, setTemporaryState] = useState<"eating" | null>(null);
  const [restCutsceneOpen, setRestCutsceneOpen] = useState(false);
  const [toast, setToast] = useState("В ателье пришёл новый заказ");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundtrackRef = useRef<HTMLAudioElement | null>(null);
  const temporaryStateTimer = useRef<number | null>(null);
  const restCutsceneActiveRef = useRef(false);
  const restCutsceneCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const saveSnapshotRef = useRef<GameSaveState | null>(null);
  const resetInProgressRef = useRef(false);
  const gameSessionRef = useRef(0);
  const drawingCanvas = useRef<HTMLCanvasElement | null>(null);
  const coloringCanvas = useRef<HTMLCanvasElement | null>(null);
  const coloringSource = useRef<ImageData | null>(null);
  const coloringRegions = useRef<ColoringRegionMap | null>(null);
  const drawingPointer = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const drawingDistance = useRef(0);
  const [drawingSketchIndex, setDrawingSketchIndex] = useState(0);
  const [drawingPhase, setDrawingPhase] = useState<DrawingPhase>("trace");
  const [drawingProgress, setDrawingProgress] = useState(0);
  const [drawingColor, setDrawingColor] = useState<DrawingColor>("rose");
  const [paintedZones, setPaintedZones] = useState<string[]>([]);
  const [drawingStamp, setDrawingStamp] = useState<string | null>(null);
  const [drawingFeedback, setDrawingFeedback] = useState("Начните вести карандаш по контуру");
  const [completedSketches, setCompletedSketches] = useState<number[]>([]);

  const hasAvailableOrder = orderIndex < ORDERS.length;
  const order = ORDERS[Math.min(orderIndex, ORDERS.length - 1)];
  const drawingUnlocked = boredom >= DRAWING_UNLOCK_AT;
  const level = Math.floor(score / 1600) + 1;
  const averageCare = Math.round((hunger + energy + (100 - boredom)) / 3);

  const currentSave = useMemo<GameSaveState>(() => ({
    board,
    score,
    moves,
    coins,
    orderIndex,
    activeOrder,
    orderProgress,
    orderReady,
    hunger,
    energy,
    boredom,
    drawingSketchIndex,
    completedSketches,
    soundEnabled,
  }), [activeOrder, board, boredom, coins, completedSketches, drawingSketchIndex, energy, hunger, moves, orderIndex, orderProgress, orderReady, score, soundEnabled]);

  useEffect(() => {
    saveSnapshotRef.current = currentSave;
  }, [currentSave]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const saved = readGameSave(window.localStorage);
      if (saved) {
        const savedOrder = ORDERS[Math.min(saved.orderIndex, ORDERS.length - 1)];
        const restoredProgress = Math.min(saved.orderProgress, savedOrder.goal);
        setBoard(saved.board);
        setScore(saved.score);
        setMoves(saved.moves);
        setCoins(saved.coins);
        setOrderIndex(saved.orderIndex);
        setActiveOrder(saved.activeOrder);
        setOrderProgress(restoredProgress);
        setOrderReady(saved.activeOrder && saved.orderReady && restoredProgress >= savedOrder.goal);
        setHunger(saved.hunger);
        setEnergy(saved.energy);
        setBoredom(saved.boredom);
        setDrawingSketchIndex(saved.drawingSketchIndex);
        setCompletedSketches(saved.completedSketches);
        setSoundEnabled(saved.soundEnabled);
        soundEnabledRef.current = saved.soundEnabled;
        setToast("Сохранённый прогресс восстановлен");
      }
      setSaveReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!saveReady || resetInProgressRef.current) return;
    const timer = window.setTimeout(() => writeGameSave(window.localStorage, currentSave), 180);
    return () => window.clearTimeout(timer);
  }, [currentSave, saveReady]);

  useEffect(() => {
    if (!saveReady) return;
    const persist = () => {
      if (!resetInProgressRef.current && saveSnapshotRef.current) writeGameSave(window.localStorage, saveSnapshotRef.current);
    };
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
    };
  }, [saveReady]);

  const playSound = useCallback((effect: SoundEffect, force = false) => {
    if (!force && !soundEnabledRef.current) return;
    const AudioContextConstructor = window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;
    const presets: Record<SoundEffect, Array<[frequency: number, delay: number, duration: number]>> = {
      tap: [[520, 0, 0.06]],
      coin: [[740, 0, 0.08], [988, 0.07, 0.14]],
      success: [[523, 0, 0.12], [659, 0.11, 0.12], [784, 0.22, 0.2]],
      rest: [[392, 0, 0.16], [330, 0.13, 0.2]],
      alert: [[659, 0, 0.07], [880, 0.08, 0.13]],
      fail: [[220, 0, 0.12], [164, 0.09, 0.18]],
      welcome: [[523, 0, 0.08], [784, 0.09, 0.16]],
    };
    const schedule = () => {
      const now = context.currentTime;
      presets[effect].forEach(([frequency, delay, duration]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + delay;
        oscillator.type = effect === "fail" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(effect === "tap" ? 0.025 : 0.045, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
        oscillator.addEventListener("ended", () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
      });
    };
    if (context.state === "suspended") void context.resume().then(schedule).catch(() => undefined);
    else schedule();
  }, []);

  function toggleSound() {
    const next = !soundEnabled;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    if (next) {
      playSound("welcome", true);
      if (soundtrackRef.current) void soundtrackRef.current.play().catch(() => undefined);
    } else {
      soundtrackRef.current?.pause();
      if (audioContextRef.current?.state === "running") void audioContextRef.current.suspend();
    }
  }

  const finishCelebration = useCallback(() => {
    if (!celebrating) return;
    setCelebrating(false);
    if (!activeOrder || !orderReady) return;
    const finishedTitle = order.title, reward = order.reward;
    setCoins((value) => value + reward); setScore((value) => value + reward * 3);
    setActiveOrder(false); setOrderReady(false); setOrderProgress(0); setOrderIndex((value) => value + 1);
    setBoredom((value) => Math.max(0, value - 28)); setScreen("home");
    setToast(`Заказ «${finishedTitle}» готов! +${reward} монет`);
    playSound("coin");
  }, [activeOrder, celebrating, order.reward, order.title, orderReady, playSound]);

  const annaState = useMemo(() => {
    if (temporaryState === "eating") return "Анна устроила уютный перекус";
    if (restCutsceneOpen) return "Анна отдыхает и набирается сил";
    if (celebrating) return "Анна очень довольна проделанной работой!";
    if (energy <= 45) return "Анна устала — устройте небольшой отдых";
    if (hunger <= 45) return "Анна проголодалась — пора перекусить";
    if (drawingUnlocked) return "Анне срочно нужно творческое вдохновение";
    if (activeOrder) return "Анна работает над новым заказом";
    if (averageCare >= 75) return "Анна полна вдохновения";
    return "Анне не помешает немного заботы";
  }, [activeOrder, averageCare, celebrating, drawingUnlocked, energy, hunger, restCutsceneOpen, temporaryState]);

  const annaVisual = useMemo<AnnaVisual>(() => {
    if (temporaryState === "eating") return { id: "eating", video: assetPath("assets/videos/anna-eating.mp4"), status: "Перекусывает", icon: "☕", alt: "Анна ест круассан и пьёт чай" };
    if (celebrating) return { id: "celebrates", video: assetPath("assets/videos/anna-celebrates.mp4"), status: "Радуется", icon: "✦", alt: "Анна радуется готовому заказу" };
    if (energy <= 45) return { id: "tired", video: assetPath("assets/videos/anna-tired.mp4"), status: "Устала", icon: "z", alt: "Уставшая Анна прикрывает зевок" };
    if (hunger <= 45) return { id: "hungry", video: assetPath("assets/videos/anna-hungry.mp4"), status: "Проголодалась", icon: "⌁", alt: "Проголодавшаяся Анна сделала перерыв" };
    if (boredom >= DRAWING_UNLOCK_AT) return { id: "bored", video: assetPath("assets/videos/anna-bored.mp4"), status: "Скучает", icon: "…", alt: "Анна скучает у швейной машинки" };
    return { id: "sewing", video: assetPath("assets/videos/anna-sewing.mp4"), status: activeOrder ? "Шьёт заказ" : "В ателье", icon: "♡", alt: "Анна в дневном ателье" };
  }, [activeOrder, boredom, celebrating, energy, hunger, temporaryState]);

  const [displayedVisual, setDisplayedVisual] = useState<AnnaVisual>(annaVisual);
  const [incomingVisual, setIncomingVisual] = useState<AnnaVisual | null>(null);
  const [incomingReady, setIncomingReady] = useState(false);
  const videoTransitionTimer = useRef<number | null>(null);

  useEffect(() => {
    if (annaVisual.video === displayedVisual.video) return;
    if (videoTransitionTimer.current !== null) window.clearTimeout(videoTransitionTimer.current);
    const frame = window.requestAnimationFrame(() => {
      setIncomingReady(false);
      setIncomingVisual(annaVisual);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [annaVisual, displayedVisual.video]);

  useEffect(() => () => {
    if (videoTransitionTimer.current !== null) window.clearTimeout(videoTransitionTimer.current);
  }, []);

  function revealIncomingVideo() {
    if (!incomingVisual || incomingReady) return;
    const readyVisual = incomingVisual;
    setIncomingReady(true);
    videoTransitionTimer.current = window.setTimeout(() => {
      setDisplayedVisual(readyVisual);
      setIncomingVisual((current) => current?.video === readyVisual.video ? null : current);
      setIncomingReady(false);
      videoTransitionTimer.current = null;
    }, 280);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHunger((value) => Math.max(24, value - 1.5));
      setEnergy((value) => Math.max(20, value - 1));
      setBoredom((value) => Math.min(100, value + 2));
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const soundtrack = new Audio(assetPath("assets/audio/anna-atelier-theme.mp3"));
    soundtrack.loop = true;
    soundtrack.preload = "auto";
    soundtrack.volume = 0.24;
    soundtrackRef.current = soundtrack;
    return () => {
      soundtrack.pause();
      soundtrack.removeAttribute("src");
      soundtrackRef.current = null;
      restCutsceneActiveRef.current = false;
      const context = audioContextRef.current;
      if (context && context.state !== "closed") void context.close();
      if (temporaryStateTimer.current !== null) window.clearTimeout(temporaryStateTimer.current);
    };
  }, []);

  useEffect(() => {
    const soundtrack = soundtrackRef.current;
    if (!soundtrack) return;
    if (!soundEnabled) {
      soundtrack.pause();
      return;
    }
    const resumeSoundtrack = () => { void soundtrack.play().catch(() => undefined); };
    resumeSoundtrack();
    window.addEventListener("pointerdown", resumeSoundtrack, { once: true });
    return () => window.removeEventListener("pointerdown", resumeSoundtrack);
  }, [soundEnabled]);

  useEffect(() => {
    if (!restCutsceneOpen) return;
    const focusFrame = window.requestAnimationFrame(() => restCutsceneCloseButtonRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        restCutsceneActiveRef.current = false;
        setRestCutsceneOpen(false);
        setToast("Анна вернулась отдохнувшей");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [restCutsceneOpen]);

  useEffect(() => {
    if (!celebrating) return;
    const fallback = window.setTimeout(finishCelebration, 6500);
    return () => window.clearTimeout(fallback);
  }, [celebrating, finishCelebration]);

  useEffect(() => {
    if (!showOrderReadyMessage) return;
    const transition = window.setTimeout(() => {
      setShowOrderReadyMessage(false); setCelebrating(true); setScreen("home");
      setToast("Анна радуется готовой работе");
      playSound("success");
    }, 1500);
    return () => window.clearTimeout(transition);
  }, [playSound, showOrderReadyMessage]);

  useEffect(() => {
    if (screen !== "drawing" || drawingPhase !== "color") return;
    const canvas = coloringCanvas.current;
    if (!canvas) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const size = 640;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.clearRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);
      const source = context.getImageData(0, 0, size, size);
      coloringSource.current = source;
      coloringRegions.current = createColoringRegionMap(source);
    };
    image.src = assetPath(DRAWING_SKETCHES[drawingSketchIndex].asset);
    return () => { image.onload = null; };
  }, [drawingPhase, drawingSketchIndex, screen]);

  function acceptOrder() {
    if (!hasAvailableOrder) return;
    playSound("tap");
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
      playSound("success");
      setSelected(null); setMatched(new Set()); setShowOrderReadyMessage(true);
      setToast("Заказ готов!");
      return;
    }
    playSound("coin");
    setToast(combo > 1 ? `Каскад ×${combo}! +${points} очков` : `Отличный шов! +${points} очков`);
  }

  function runCascade(current: Board, combo: number, points: number, collected: number[], session = gameSessionRef.current) {
    if (session !== gameSessionRef.current) return;
    const matches = findMatches(current);
    if (matches.size === 0) return finishCascade(points, collected, combo - 1);
    const nextCollected = [...collected];
    matches.forEach((index) => { nextCollected[current[index]] += 1; });
    setMatched(matches);
    window.setTimeout(() => {
      if (session !== gameSessionRef.current) return;
      const collapsed = collapseBoard(current, matches); setBoard(collapsed); setMatched(new Set());
      window.setTimeout(() => runCascade(collapsed, combo + 1, points + matches.size * 12 * combo, nextCollected, session), 180);
    }, 260);
  }

  function trySwap(first: number, second: number) {
    if (busy || orderReady || !activeOrder) return;
    if (moves <= 0) return setToast("Ходы закончились — начните новый день");
    const swapped = [...board]; [swapped[first], swapped[second]] = [swapped[second], swapped[first]]; setSelected(null);
    if (findMatches(swapped).size === 0) {
      playSound("fail");
      setBoard(swapped); setBusy(true); setToast("Здесь ряд не складывается");
      const session = gameSessionRef.current;
      window.setTimeout(() => { if (session === gameSessionRef.current) { setBoard(board); setBusy(false); } }, 280); return;
    }
    setBoard(swapped); setBusy(true); setToast("Материалы собраны!");
    const session = gameSessionRef.current;
    window.setTimeout(() => runCascade(swapped, 1, 0, Array(TILE_TYPES.length).fill(0), session), 180);
  }

  function selectTile(index: number) {
    if (suppressNextClick.current) { suppressNextClick.current = false; return; }
    if (busy || orderReady || !activeOrder) return;
    if (moves <= 0) return setToast("Ходы закончились — начните новый день");
    if (selected === null) return setSelected(index);
    if (selected === index) return setSelected(null);
    if (!areNeighbours(selected, index)) { setSelected(index); setToast("Выберите соседнюю фишку"); return; }
    trySwap(selected, index);
  }

  function beginSwipe(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || busy || orderReady || !activeOrder || moves <= 0) return;
    suppressNextClick.current = false;
    swipeStart.current = { index, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function endSwipe(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = swipeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    swipeStart.current = null;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;

    suppressNextClick.current = true;
    window.setTimeout(() => { suppressNextClick.current = false; }, 0);
    setSelected(null);
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const target = horizontal
      ? start.index + (deltaX > 0 ? 1 : -1)
      : start.index + (deltaY > 0 ? BOARD_SIZE : -BOARD_SIZE);
    if (target < 0 || target >= board.length || !areNeighbours(start.index, target)) {
      setToast("Смахните фишку к соседней клетке");
      return;
    }
    trySwap(start.index, target);
  }

  function cancelSwipe() {
    swipeStart.current = null;
  }

  function finishRestCutscene(failed = false) {
    restCutsceneActiveRef.current = false;
    setRestCutsceneOpen(false);
    setToast(failed ? "Отдых завершён — ролик не удалось воспроизвести" : "Анна вернулась отдохнувшей");
  }

  function resetGame() {
    resetInProgressRef.current = true;
    gameSessionRef.current += 1;
    if (temporaryStateTimer.current !== null) window.clearTimeout(temporaryStateTimer.current);
    temporaryStateTimer.current = null;
    if (videoTransitionTimer.current !== null) window.clearTimeout(videoTransitionTimer.current);
    videoTransitionTimer.current = null;
    restCutsceneActiveRef.current = false;
    clearGameSave(window.localStorage);
    soundtrackRef.current?.pause();
    if (soundtrackRef.current) soundtrackRef.current.currentTime = 0;
    if (audioContextRef.current?.state === "running") void audioContextRef.current.suspend();

    setScreen("home");
    setBoard(makeBoard());
    setSelected(null);
    setMatched(new Set());
    setBusy(false);
    setScore(0);
    setMoves(STARTING_MOVES);
    setCoins(36);
    setOrderIndex(0);
    setActiveOrder(false);
    setOrderProgress(0);
    setOrderReady(false);
    setShowOrderModal(false);
    setShowOrderReadyMessage(false);
    setCelebrating(false);
    setHunger(76);
    setEnergy(83);
    setBoredom(28);
    setTemporaryState(null);
    setRestCutsceneOpen(false);
    setToast("Новая игра началась");
    setSoundEnabled(false);
    soundEnabledRef.current = false;
    setIncomingVisual(null);
    setIncomingReady(false);
    setDrawingSketchIndex(0);
    setDrawingPhase("trace");
    setDrawingProgress(0);
    setDrawingColor("rose");
    setPaintedZones([]);
    setDrawingStamp(null);
    setDrawingFeedback("Начните вести карандаш по контуру");
    setCompletedSketches([]);
    drawingPointer.current = null;
    drawingDistance.current = 0;
    coloringSource.current = null;
    coloringRegions.current = null;
    window.setTimeout(() => { resetInProgressRef.current = false; }, 0);
  }

  function requestNewGame() {
    if (window.confirm("Начать новую игру? Текущий прогресс будет удалён.")) resetGame();
  }

  function careForAnna(kind: "food" | "rest" | "sew") {
    if (kind === "sew") {
      playSound("tap");
      if (activeOrder && !orderReady) setScreen("match3"); else if (!activeOrder && hasAvailableOrder) setShowOrderModal(true); else if (!activeOrder) setToast("Все заказы на сегодня выполнены");
      return;
    }
    if (kind === "rest" && restCutsceneActiveRef.current) return;
    const cost = kind === "food" ? 8 : 6;
    if (coins < cost) { playSound("fail"); return setToast("Нужно ещё немного монет"); }
    playSound(kind === "food" ? "coin" : "rest");
    setCoins((value) => value - cost);
    if (temporaryStateTimer.current !== null) window.clearTimeout(temporaryStateTimer.current);
    if (kind === "food") {
      setHunger((value) => Math.min(100, value + 22));
      setTemporaryState("eating");
      temporaryStateTimer.current = window.setTimeout(() => {
        setTemporaryState(null);
        temporaryStateTimer.current = null;
      }, 4200);
    } else {
      setEnergy((value) => Math.min(100, value + 20));
      setTemporaryState(null);
      restCutsceneActiveRef.current = true;
      setRestCutsceneOpen(true);
    }
    setToast(kind === "food" ? "Чай и круассан готовы" : "Небольшая передышка");
  }

  function startNewDay() {
    playSound("welcome");
    setBoard(makeBoard(Date.now() % 100000)); setSelected(null); setMatched(new Set()); setMoves(STARTING_MOVES); setToast("Новый день в мастерской начался");
  }

  function prepareDrawingCanvas(canvas: HTMLCanvasElement) {
    const bounds = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(5, bounds.width / 65);
    context.strokeStyle = "#8f444c";
    return { bounds, context };
  }

  function beginSketchLine(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary || drawingPhase !== "trace") return;
    const prepared = prepareDrawingCanvas(event.currentTarget);
    if (!prepared) return;
    const x = event.clientX - prepared.bounds.left;
    const y = event.clientY - prepared.bounds.top;
    drawingPointer.current = { pointerId: event.pointerId, x, y };
    event.currentTarget.setPointerCapture(event.pointerId);
    prepared.context.beginPath();
    prepared.context.moveTo(x, y);
    prepared.context.lineTo(x + 0.01, y + 0.01);
    prepared.context.stroke();
  }

  function continueSketchLine(event: ReactPointerEvent<HTMLCanvasElement>) {
    const previous = drawingPointer.current;
    if (!previous || previous.pointerId !== event.pointerId || drawingPhase !== "trace") return;
    event.preventDefault();
    const prepared = prepareDrawingCanvas(event.currentTarget);
    if (!prepared) return;
    const x = event.clientX - prepared.bounds.left;
    const y = event.clientY - prepared.bounds.top;
    prepared.context.lineTo(x, y);
    prepared.context.stroke();
    drawingDistance.current += Math.hypot(x - previous.x, y - previous.y);
    drawingPointer.current = { pointerId: event.pointerId, x, y };
    const targetDistance = Math.max(460, prepared.bounds.width * 2.35);
    const progress = Math.min(100, Math.round((drawingDistance.current / targetDistance) * 100));
    setDrawingProgress(progress);
    if (progress >= 70) setDrawingFeedback("Контур готов — теперь добавим цвет");
    else if (progress >= 35) setDrawingFeedback("Красиво получается, продолжайте обводить");
  }

  function endSketchLine(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (drawingPointer.current?.pointerId !== event.pointerId) return;
    drawingPointer.current = null;
  }

  function clearDrawingCanvas() {
    const canvas = drawingCanvas.current;
    if (canvas) {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
    }
    drawingPointer.current = null;
    drawingDistance.current = 0;
    coloringSource.current = null;
    coloringRegions.current = null;
    setPaintedZones([]);
    setDrawingProgress(0);
    setDrawingFeedback("Начните вести карандаш по контуру");
  }

  function startColoring() {
    playSound("tap");
    setPaintedZones([]);
    setDrawingPhase("color");
    setDrawingFeedback("Выберите цвет и нажмите на часть рисунка");
  }

  function selectDrawingColor(color: DrawingColor, name: string) {
    playSound("tap");
    setDrawingColor(color);
    setDrawingFeedback(`Цвет «${name}» выбран — нажмите на элемент`);
  }

  function paintDrawingZone(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (drawingPhase !== "color") return;
    const canvas = event.currentTarget;
    const source = coloringSource.current;
    const regionMap = coloringRegions.current;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!source || !regionMap || !context || !canvas.width || !canvas.height) return;

    const bounds = canvas.getBoundingClientRect();
    const rawX = Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width);
    const rawY = Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height);
    const startX = Math.max(0, Math.min(canvas.width - 1, rawX));
    const startY = Math.max(0, Math.min(canvas.height - 1, rawY));
    const total = canvas.width * canvas.height;
    const sourcePixels = source.data;
    const directRegion = regionMap.labels[startY * canvas.width + startX];
    const directRegionSize = regionMap.sizes[directRegion] ?? 0;
    let selectedRegion = directRegionSize >= 8 && directRegionSize <= total * 0.45 ? directRegion : 0;
    const searchRadius = 26;
    const nearbyRegions = new Map<number, number>();
    if (!selectedRegion) {
      for (let offsetY = -searchRadius; offsetY <= searchRadius; offsetY += 1) {
        for (let offsetX = -searchRadius; offsetX <= searchRadius; offsetX += 1) {
          const distanceSquared = offsetX * offsetX + offsetY * offsetY;
          if (distanceSquared > searchRadius * searchRadius) continue;
          const x = startX + offsetX;
          const y = startY + offsetY;
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
          const label = regionMap.labels[y * canvas.width + x];
          const regionSize = regionMap.sizes[label] ?? 0;
          if (!label || regionSize < 8 || regionSize > total * 0.45) continue;
          const distance = Math.sqrt(distanceSquared);
          const score = distance + Math.sqrt(regionSize) * 0.07;
          const currentScore = nearbyRegions.get(label);
          if (currentScore === undefined || score < currentScore) nearbyRegions.set(label, score);
        }
      }

      let selectedScore = Number.POSITIVE_INFINITY;
      nearbyRegions.forEach((score, label) => {
        if (score < selectedScore) {
          selectedRegion = label;
          selectedScore = score;
        }
      });
    }

    if (!selectedRegion) {
      playSound("fail");
      setDrawingFeedback("Нажмите внутри детали рисунка");
      return;
    }

    const palette = DRAWING_COLORS.find((color) => color.id === drawingColor) ?? DRAWING_COLORS[0];
    const red = Number.parseInt(palette.value.slice(1, 3), 16);
    const green = Number.parseInt(palette.value.slice(3, 5), 16);
    const blue = Number.parseInt(palette.value.slice(5, 7), 16);
    const painted = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < total; index += 1) {
      if (regionMap.labels[index] !== selectedRegion) continue;
      const offset = index * 4;
      painted.data[offset] = Math.round(red * 0.68 + sourcePixels[offset] * 0.32);
      painted.data[offset + 1] = Math.round(green * 0.68 + sourcePixels[offset + 1] * 0.32);
      painted.data[offset + 2] = Math.round(blue * 0.68 + sourcePixels[offset + 2] * 0.32);
    }
    context.putImageData(painted, 0, 0);
    const zoneId = String(selectedRegion);
    const isNewZone = !paintedZones.includes(zoneId);
    setPaintedZones((zones) => zones.includes(zoneId) ? zones : [...zones, zoneId]);
    playSound("tap");
    setDrawingFeedback(isNewZone ? "Зона окрашена — выберите следующую или смените цвет" : "Зона перекрашена новым оттенком");
  }

  function finishDrawingGame() {
    if (!drawingStamp || drawingPhase !== "stamp") return;
    playSound("success");
    const finishedSketch = drawingSketchIndex;
    setDrawingPhase("done");
    setDrawingFeedback("Картина готова! Анна снова полна идей");
    setCompletedSketches((items) => items.includes(finishedSketch) ? items : [...items, finishedSketch]);
    setBoredom(5);
    setScore((value) => value + 140);
    setCoins((value) => value + 8);
    setToast("Новая картина готова · +140 очков · +8 монет");
    const session = gameSessionRef.current;
    window.setTimeout(() => {
      if (session !== gameSessionRef.current) return;
      setDrawingSketchIndex((value) => (value + 1) % DRAWING_SKETCHES.length);
      setDrawingPhase("trace");
      setDrawingColor("rose");
      setDrawingStamp(null);
      clearDrawingCanvas();
      setScreen("home");
    }, 1700);
  }

  if (!saveReady) return <main className="release-loader" role="status" aria-live="polite"><div className="release-loader-mark" aria-hidden="true">А</div><strong>Ателье Анны</strong><span>Загружаем мастерскую…</span><i aria-hidden="true" /></main>;

  const atelierHud = <div className="atelier-hud" aria-label={`Уровень ${level}, монет: ${coins}`}><span className="atelier-level"><small>Уровень</small><strong>{level}</strong></span><span className="atelier-hud-divider" aria-hidden="true" /><span className="atelier-coins"><b aria-hidden="true">●</b><strong>{coins}</strong><small>монет</small></span></div>;

  const header = <header className={screen === "home" ? "topbar" : "topbar topbar-match-hidden"}><div className="brand-lockup"><div className="brand-mark" aria-hidden="true">А</div><div><p className="eyebrow">уютная история мастерской</p><h1>Ателье Анны</h1></div></div><div className="release-controls"><span>v{RELEASE_VERSION}</span><button type="button" onClick={requestNewGame}>Новая игра</button></div></header>;

  const orderInboxCard = showOrderModal && !activeOrder && hasAvailableOrder ? <section className="order-modal order-inbox-card" role="dialog" aria-modal="false" aria-labelledby="new-order-title"><button type="button" className="modal-close" aria-label="Закрыть письмо" onClick={() => setShowOrderModal(false)}>×</button><div className="letter-stamp" aria-hidden="true">✿</div><p className="eyebrow">новый заказ</p><h2 id="new-order-title">{order.title}</h2><div className="modal-client"><span>{order.client.slice(0, 1)}</span><div><small>Пишет</small><strong>{order.client}</strong></div></div><p className="order-letter">«{order.note}. Очень надеюсь на ваше мастерство, Анна!»</p><div className="modal-order-details"><div><span>Материал</span><strong>{TILE_TYPES[order.tile].short} · {order.goal}</strong></div><div><span>Срок</span><strong>{order.time}</strong></div><div><span>Награда</span><strong>{order.reward} ●</strong></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowOrderModal(false)}>Не сейчас</button><button type="button" className="primary-button" onClick={acceptOrder}>Принять заказ</button></div></section> : null;

  const annaCard = <aside className="anna-card panel"><div className="character-stage" style={{ backgroundImage: `url("${assetPath("assets/anna-atelier-scene.png")}")` }}><video key={displayedVisual.video} className="scene-image scene-video-current" autoPlay loop={displayedVisual.id !== "celebrates"} muted playsInline preload="auto" aria-label={displayedVisual.alt} onEnded={displayedVisual.id === "celebrates" ? finishCelebration : undefined}><source src={displayedVisual.video} type="video/mp4" /></video>{incomingVisual && <video key={incomingVisual.video} className={`scene-image scene-video-incoming${incomingReady ? " scene-video-ready" : ""}`} autoPlay loop={incomingVisual.id !== "celebrates"} muted playsInline preload="auto" aria-label={incomingVisual.alt} onCanPlay={revealIncomingVideo} onEnded={incomingVisual.id === "celebrates" ? finishCelebration : undefined}><source src={incomingVisual.video} type="video/mp4" /></video>}<div className="stage-glow" />{atelierHud}<button type="button" className={`sound-toggle${soundEnabled ? " sound-on" : ""}`} aria-label={soundEnabled ? "Выключить звук" : "Включить звук"} aria-pressed={soundEnabled} onClick={toggleSound}><span aria-hidden="true">{soundEnabled ? "♫" : "♪"}</span></button>{!activeOrder && hasAvailableOrder ? <button type="button" className="mood-bubble order-alert-bubble" aria-label={`Новый заказ: ${order.title}`} aria-expanded={showOrderModal} onClick={() => { playSound("alert"); setShowOrderModal((value) => !value); }}><span>✉</span><b>!</b></button> : <span className={`mood-bubble${annaVisual.id !== "sewing" ? " boredom-alert" : ""}`} aria-label={`Состояние Анны: ${annaVisual.status}`}>{annaVisual.icon}</span>}</div>{orderInboxCard}<div className="anna-copy"><div className="section-heading compact-heading"><div><p className="eyebrow">хозяйка ателье</p><h2>Анна</h2></div>{completedSketches.length > 0 && <div className="atelier-gallery" aria-label="Готовые картины Анны">{completedSketches.map((index) => <span key={index} title={DRAWING_SKETCHES[index].name} style={{ backgroundImage: `url("${assetPath(DRAWING_SKETCHES[index].asset)}")` }} />)}</div>}<span className="care-score">{averageCare}%</span></div><p className="anna-state">{annaState}</p><div className="meters"><Meter label="Сытость" value={hunger} tone="coral" /><Meter label="Энергия" value={energy} tone="gold" /><Meter label="Скука" value={boredom} tone="boredom" /></div><div className={`care-actions${drawingUnlocked ? " has-drawing" : ""}`}><button type="button" disabled={celebrating} onClick={() => careForAnna("food")}><span>☕</span><strong>Перекус</strong><small>8 ●</small></button><button type="button" disabled={celebrating || restCutsceneOpen} onClick={() => careForAnna("rest")}><span>☁</span><strong>Отдых</strong><small>6 ●</small></button>{activeOrder && <button type="button" onClick={() => careForAnna("sew")} disabled={celebrating || orderReady}><span>✂</span><strong>{orderReady ? "Готово" : "Шить"}</strong><small>{orderProgress}/{order.goal}</small></button>}{drawingUnlocked && <button type="button" className="drawing-action" disabled={celebrating} onClick={() => { playSound("tap"); setScreen("drawing"); }}><span>✎</span><strong>Рисовать</strong><small>− скука</small></button>}</div></div></aside>;

  const homeScreen = <section className="home-layout home-layout-single screen-enter" aria-label="Главный экран ателье">{annaCard}</section>;

  const matchScreen = activeOrder ? <section className="screen-enter embedded-game" aria-label="Игра три в ряд"><div className="match-layout"><section id="match-board" className="board-panel panel" aria-label="Поле три в ряд"><div className="section-heading board-heading"><div className="mode-title-row"><button type="button" className="inline-back-button" aria-label="Вернуться к Анне" onClick={() => setScreen("home")}>←</button><div><p className="eyebrow">игра в основном окне</p><h2>Соберите материалы</h2></div></div><div className={`moves-badge${moves <= 5 ? " moves-low" : ""}`}><strong>{moves}</strong><span>ходов</span></div></div><div className={`match-board${busy ? " board-busy" : ""}`} role="grid" aria-label="Игровое поле 7 на 7">{board.map((type, index) => <button className={`tile tile-type-${type}${selected === index ? " tile-selected" : ""}${matched.has(index) ? " tile-matched" : ""}`} key={index} type="button" role="gridcell" aria-label={`${TILE_TYPES[type].name}, ряд ${Math.floor(index / BOARD_SIZE) + 1}, столбец ${(index % BOARD_SIZE) + 1}`} aria-selected={selected === index} onClick={() => selectTile(index)} onPointerDown={(event) => beginSwipe(index, event)} onPointerUp={endSwipe} onPointerCancel={cancelSwipe} disabled={busy || orderReady}><TileSprite type={type} /></button>)}</div>{showOrderReadyMessage && <div className="order-ready-overlay" role="status" aria-live="assertive"><span>✓</span><strong>Заказ готов!</strong><small>Сейчас Анна порадуется своей работе</small></div>}<div className="board-footer"><p aria-live="polite"><span>✦</span>{toast}</p><button type="button" className="text-button" onClick={startNewDay}>Новый день</button></div></section><aside className="order-brief-stack"><section className={`match-task-card panel${orderReady ? " order-ready" : ""}`}><div className="order-topline"><span>Задание заказа</span><b>{order.time}</b></div><div className="match-task-copy"><div className="client-row"><div className="client-avatar">{order.client.slice(0, 1)}</div><div><small>Клиент</small><strong>{order.client}</strong></div></div><div><h2>{order.title}</h2><p>{order.note}</p></div></div><div className="task-strip"><TileSprite type={order.tile} small /><div><span>Нужно собрать</span><strong>{TILE_TYPES[order.tile].short}</strong></div><div className="mini-progress"><span style={{ width: `${(orderProgress / order.goal) * 100}%` }} /></div><b>{orderProgress}/{order.goal}</b></div></section><div className="tip-card"><span>⌁</span><p><strong>Как играть</strong>Смахивайте фишки к соседним клеткам и собирайте ряды от трёх.</p></div></aside></div></section> : homeScreen;

  const activeSketch = DRAWING_SKETCHES[drawingSketchIndex];
  const drawingStepProgress = drawingPhase === "trace" ? Math.min(48, drawingProgress * 0.68) : drawingPhase === "color" ? 58 + Math.min(22, paintedZones.length * 6) : drawingPhase === "stamp" ? 88 : 100;
  const drawingScreen = (
    <section className="drawing-page screen-enter embedded-game" aria-label="Игра с рисованием">
      <div className="drawing-layout">
        <section className="sketchbook panel">
          <div className="mode-heading mode-heading-with-back">
            <button type="button" className="inline-back-button" aria-label="Вернуться к Анне" onClick={() => setScreen("home")}>←</button>
            <div><p className="eyebrow">альбом вдохновения</p><h2>Картина Анны</h2></div>
          </div>
          <div className="sketchbook-binding" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div>
          <div className="sketch-page">
            <div className="sketch-title-row">
              <div><p className="eyebrow">эскиз {drawingSketchIndex + 1} из {DRAWING_SKETCHES.length}</p><h3>{activeSketch.name}</h3></div>
              <div className="drawing-progress" aria-label={`Картина готова на ${Math.round(drawingStepProgress)}%`}><span style={{ width: `${drawingStepProgress}%` }} /></div>
            </div>
            <p>{drawingPhase === "trace" ? activeSketch.instruction : drawingPhase === "color" ? "Выберите цвет и нажимайте на отдельные части рисунка." : drawingPhase === "stamp" ? "Добавьте последний декоративный штамп." : "Картина отправляется в галерею Анны."}</p>
            <div className={`trace-board trace-color-${drawingColor}${drawingPhase === "done" ? " trace-complete" : ""}`}>
              <div className={`trace-reference${drawingPhase === "trace" ? "" : " trace-reference-hidden"}`} style={{ backgroundImage: `url("${assetPath(activeSketch.asset)}")` }} aria-hidden="true" />
              <canvas ref={coloringCanvas} className={`coloring-canvas${drawingPhase === "trace" ? "" : " coloring-canvas-active"}`} aria-label={`Раскрасьте отдельные элементы рисунка «${activeSketch.name}»`} onPointerUp={paintDrawingZone} />
              {drawingStamp && <div className="stamp-preview" aria-hidden="true"><span>{drawingStamp}</span><span>{drawingStamp}</span><span>{drawingStamp}</span></div>}
              <canvas ref={drawingCanvas} className={`trace-canvas${drawingPhase === "trace" ? "" : " trace-canvas-inactive"}`} aria-label={`Обведите рисунок «${activeSketch.name}» пальцем`} onPointerDown={beginSketchLine} onPointerMove={continueSketchLine} onPointerUp={endSketchLine} onPointerCancel={endSketchLine} />
            </div>
            <div className="drawing-feedback" aria-live="polite"><span>{drawingPhase === "done" ? "✓" : drawingPhase === "color" ? "●" : "✎"}</span><p>{drawingFeedback}</p></div>
          </div>
        </section>
        <aside className="drawing-tools panel">
          <div className="drawing-tools-heading"><p className="eyebrow">шаг {drawingPhase === "trace" ? 1 : drawingPhase === "color" ? 2 : 3} из 3</p><h3>{drawingPhase === "trace" ? "Обведите контур" : drawingPhase === "color" ? "Раскрасьте элементы" : drawingPhase === "stamp" ? "Украсьте картину" : "Готово!"}</h3></div>
          {drawingPhase === "trace" && <div className="drawing-step-controls"><p>Проведите линии по рисунку — попадать идеально не обязательно.</p><div><button type="button" className="secondary-button" onClick={clearDrawingCanvas}>Очистить</button><button type="button" className="primary-button" disabled={drawingProgress < 70} onClick={startColoring}>Контур готов</button></div></div>}
          {drawingPhase === "color" && <div className="color-palette" aria-label="Цвета картины">{DRAWING_COLORS.map((color) => <button type="button" className={drawingColor === color.id ? "color-selected" : ""} key={color.id} aria-label={`Выбрать цвет ${color.name}`} aria-pressed={drawingColor === color.id} onClick={() => selectDrawingColor(color.id, color.name)}><span style={{ background: color.value }} /><small>{color.name}</small></button>)}<button type="button" className="primary-button palette-next" disabled={paintedZones.length === 0} onClick={() => { playSound("tap"); setDrawingPhase("stamp"); setDrawingFeedback("Осталось выбрать украшение"); }}>К украшениям</button></div>}
          {drawingPhase === "stamp" && <div className="stamp-palette" aria-label="Декоративные штампы">{DRAWING_STAMPS.map((stamp) => <button type="button" className={drawingStamp === stamp.symbol ? "stamp-selected" : ""} key={stamp.name} onClick={() => { playSound("tap"); setDrawingStamp(stamp.symbol); setDrawingFeedback(`Украшение «${stamp.name}» добавлено`); }}><span>{stamp.symbol}</span><small>{stamp.name}</small></button>)}<button type="button" className="primary-button stamp-finish" disabled={!drawingStamp} onClick={finishDrawingGame}>Закончить картину</button></div>}
          <div className="drawing-reward"><span>✦</span><div><strong>Награда за картину</strong><small>140 очков · 8 монет · скука исчезнет</small></div></div>
        </aside>
      </div>
    </section>
  );

  return <main className={`game-shell game-shell-${screen}`}>{header}<section className={`studio-window studio-window-${screen}`} aria-label="Главное окно игры">{screen === "home" && homeScreen}{screen === "match3" && matchScreen}{screen === "drawing" && drawingScreen}</section>{restCutsceneOpen && <section className="rest-cutscene" role="dialog" aria-modal="true" aria-label="Отдых Анны у моря"><div className="rest-cutscene-frame"><video autoPlay muted playsInline preload="auto" onEnded={() => finishRestCutscene()} onError={() => finishRestCutscene(true)}><source src={assetPath("assets/videos/anna-resting.mp4")} type="video/mp4" /></video><button ref={restCutsceneCloseButtonRef} type="button" onClick={() => finishRestCutscene()} aria-label="Закрыть сцену отдыха">×</button><span>Отдых у моря</span></div></section>}</main>;
}
