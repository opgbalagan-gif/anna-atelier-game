export const RELEASE_VERSION = "1.0.0";
export const GAME_SAVE_KEY = "atelier_anna_save_v1";
export const GAME_SAVE_SCHEMA_VERSION = 1;
export const PHYSICAL_ATELIER_UNLOCK_LEVEL = 5;
const MAX_SAVED_MOVES = 40;
const ORDER_COUNT = 10;

export type GameSaveState = {
  board: number[];
  score: number;
  moves: number;
  coins: number;
  orderIndex: number;
  activeOrder: boolean;
  orderProgress: number;
  orderReady: boolean;
  hunger: number;
  energy: number;
  boredom: number;
  drawingSketchIndex: number;
  completedSketches: number[];
  soundEnabled: boolean;
  physicalAtelierUnlocked: boolean;
  physicalAtelierIntroSeen: boolean;
};

type SaveEnvelope = {
  schemaVersion: typeof GAME_SAVE_SCHEMA_VERSION;
  releaseVersion: string;
  savedAt: string;
  state: GameSaveState;
};

type SafeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function safeNumber(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, value));
}

export function parseGameSave(serialized: string | null): GameSaveState | null {
  if (!serialized) return null;
  try {
    const envelope: unknown = JSON.parse(serialized);
    if (!isRecord(envelope) || envelope.schemaVersion !== GAME_SAVE_SCHEMA_VERSION || !isRecord(envelope.state)) return null;
    const state = envelope.state;
    const board = Array.isArray(state.board) ? state.board : [];
    if (board.length !== 49 || board.some((tile) => !Number.isInteger(tile) || tile < 0 || tile > 5)) return null;

    const score = safeInteger(state.score, 0, 99_999_999);
    const moves = safeInteger(state.moves, 0, MAX_SAVED_MOVES);
    const coins = safeInteger(state.coins, 0, 99_999_999);
    const orderIndex = safeInteger(state.orderIndex, 0, ORDER_COUNT);
    const orderProgress = safeInteger(state.orderProgress, 0, 999);
    const hunger = safeNumber(state.hunger, 0, 100);
    const energy = safeNumber(state.energy, 0, 100);
    const boredom = safeNumber(state.boredom, 0, 100);
    const drawingSketchIndex = safeInteger(state.drawingSketchIndex, 0, 2);
    if ([score, moves, coins, orderIndex, orderProgress, hunger, energy, boredom, drawingSketchIndex].some((value) => value === null)) return null;

    const completedSketches = Array.isArray(state.completedSketches)
      ? [...new Set(state.completedSketches.filter((index): index is number => Number.isInteger(index) && index >= 0 && index <= 2))]
      : [];
    const activeOrder = state.activeOrder === true && orderIndex! < ORDER_COUNT;
    const physicalAtelierUnlocked = state.physicalAtelierUnlocked === true || orderIndex! >= PHYSICAL_ATELIER_UNLOCK_LEVEL;

    return {
      board: [...board],
      score: score!,
      moves: moves!,
      coins: coins!,
      orderIndex: orderIndex!,
      activeOrder,
      orderProgress: activeOrder ? orderProgress! : 0,
      orderReady: activeOrder && state.orderReady === true,
      hunger: hunger!,
      energy: energy!,
      boredom: boredom!,
      drawingSketchIndex: drawingSketchIndex!,
      completedSketches,
      soundEnabled: state.soundEnabled === true,
      physicalAtelierUnlocked,
      physicalAtelierIntroSeen: physicalAtelierUnlocked && state.physicalAtelierIntroSeen === true,
    };
  } catch {
    return null;
  }
}

export function readGameSave(storage: SafeStorage): GameSaveState | null {
  try {
    const serialized = storage.getItem(GAME_SAVE_KEY);
    const parsed = parseGameSave(serialized);
    if (serialized && !parsed) storage.removeItem(GAME_SAVE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function writeGameSave(storage: SafeStorage, state: GameSaveState) {
  const envelope: SaveEnvelope = {
    schemaVersion: GAME_SAVE_SCHEMA_VERSION,
    releaseVersion: RELEASE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  try {
    storage.setItem(GAME_SAVE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearGameSave(storage: SafeStorage) {
  try {
    storage.removeItem(GAME_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
