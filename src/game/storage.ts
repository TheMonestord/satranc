import type { Color, GameResult } from '../core/types';
import { LEVEL_IDS, type LevelId } from '../engine/levels';

export interface Settings {
  language: 'tr' | 'en';
  quality: 'low' | 'medium' | 'high';
  animation: 'normal' | 'fast' | 'off';
  view: '3d' | '2d';
  /** Hareket modu: taşları el oynatır veya taşlar kendi yürür. */
  motion: 'hands' | 'walk';
  sound: boolean;
  music: boolean;
  themes: { ortam: string; masa: string; taslar: string; eller: string };
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'tr',
  quality: 'medium',
  animation: 'normal',
  view: '3d',
  motion: 'hands',
  sound: true,
  music: false,
  themes: { ortam: 'klasik-oda', masa: 'ahsap', taslar: 'klasik', eller: 'sade' },
};

const SETTINGS_KEY = 'satranc.ayarlar';

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Kayıt yoksa, bozuksa veya alanları geçersizse varsayılanlarla tamamlar. */
export function loadSettings(defaults: Settings = DEFAULT_SETTINGS): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
  } catch {
    return structuredClone(defaults);
  }
  if (!raw || typeof raw !== 'object') return structuredClone(defaults);
  const r = raw as Record<string, unknown>;
  const t = (r.themes && typeof r.themes === 'object' ? r.themes : {}) as Record<string, unknown>;
  return {
    language: oneOf(r.language, ['tr', 'en'] as const, defaults.language),
    quality: oneOf(r.quality, ['low', 'medium', 'high'] as const, defaults.quality),
    animation: oneOf(r.animation, ['normal', 'fast', 'off'] as const, defaults.animation),
    view: oneOf(r.view, ['3d', '2d'] as const, defaults.view),
    motion: oneOf(r.motion, ['hands', 'walk'] as const, defaults.motion),
    sound: typeof r.sound === 'boolean' ? r.sound : defaults.sound,
    music: typeof r.music === 'boolean' ? r.music : defaults.music,
    themes: {
      ortam: str(t.ortam, defaults.themes.ortam),
      masa: str(t.masa, defaults.themes.masa),
      taslar: str(t.taslar, defaults.themes.taslar),
      eller: str(t.eller, defaults.themes.eller),
    },
  };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Saklama alanı kapalı veya dolu olabilir; ayarlar bu oturumda geçerli kalır.
  }
}

export interface SavedClock {
  initialMs: number;
  incrementMs: number;
  w: number;
  b: number;
}

export interface SavedGame {
  pgn: string;
  mode: 'ai' | 'local';
  level: LevelId;
  playerColor: Color;
  /** Saatli oyunda kalan süreler. */
  clock?: SavedClock;
}

/** Bitmiş bir oyunun geçmiş kaydı. */
export interface HistoryEntry {
  id?: number;
  /** ISO tarih-saat. */
  date: string;
  mode: 'ai' | 'local';
  level: LevelId;
  playerColor: Color;
  result: GameResult;
  moves: number;
  pgn: string;
}

export const HISTORY_LIMIT = 100;

export const DB_NAME = 'satranc';
export const DB_VERSION = 2;
export const GAME_STORE = 'oyun';
export const GAME_KEY = 'aktif';
export const HISTORY_STORE = 'gecmis';

/** Eksik depoları oluşturur; eski sürümden gelen veriler korunur. */
export function upgradeDb(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(GAME_STORE)) db.createObjectStore(GAME_STORE);
  if (!db.objectStoreNames.contains(HISTORY_STORE)) {
    db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => upgradeDb(open.result);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = GAME_STORE,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = run(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function isSavedClock(v: unknown): v is SavedClock {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return ['initialMs', 'incrementMs', 'w', 'b'].every((k) => typeof c[k] === 'number' && Number.isFinite(c[k]) && (c[k] as number) >= 0);
}

function isSavedGame(v: unknown): v is SavedGame {
  if (!v || typeof v !== 'object') return false;
  const g = v as Record<string, unknown>;
  return (
    typeof g.pgn === 'string' &&
    (g.mode === 'ai' || g.mode === 'local') &&
    LEVEL_IDS.includes(g.level as LevelId) &&
    (g.playerColor === 'w' || g.playerColor === 'b') &&
    (g.clock === undefined || isSavedClock(g.clock))
  );
}

export async function saveGame(g: SavedGame): Promise<void> {
  await withStore('readwrite', (s) => s.put(g, GAME_KEY));
}

/** Kayıt yoksa, biçimi bozuksa veya saklama alanına erişilemiyorsa null döner. */
export async function loadGame(): Promise<SavedGame | null> {
  try {
    const v = await withStore<unknown>('readonly', (s) => s.get(GAME_KEY));
    return isSavedGame(v) ? v : null;
  } catch {
    return null;
  }
}

export async function clearGame(): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete(GAME_KEY));
  } catch {
    // Silinemeyen kayıt bir sonraki açılışta yeniden doğrulanır.
  }
}

function isHistoryEntry(v: unknown): v is HistoryEntry {
  if (!v || typeof v !== 'object') return false;
  const h = v as Record<string, unknown>;
  const r = h.result as { kind?: unknown } | undefined;
  return (
    typeof h.date === 'string' &&
    typeof h.pgn === 'string' &&
    typeof h.moves === 'number' &&
    (h.mode === 'ai' || h.mode === 'local') &&
    LEVEL_IDS.includes(h.level as LevelId) &&
    (h.playerColor === 'w' || h.playerColor === 'b') &&
    !!r &&
    typeof r.kind === 'string'
  );
}

/** Bitmiş oyunu geçmişe ekler; en eski kayıtlar `HISTORY_LIMIT` aşılınca silinir. */
export async function addHistory(entry: HistoryEntry): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.add(entry), HISTORY_STORE);
    const keys = await withStore<IDBValidKey[]>('readonly', (s) => s.getAllKeys(), HISTORY_STORE);
    for (const key of keys.slice(0, Math.max(0, keys.length - HISTORY_LIMIT))) {
      await withStore('readwrite', (s) => s.delete(key), HISTORY_STORE);
    }
  } catch {
    // Geçmiş kaydedilemese de oyun etkilenmez.
  }
}

/** En yeni oyun başta. Bozuk kayıtlar atlanır. */
export async function listHistory(): Promise<HistoryEntry[]> {
  try {
    const all = await withStore<unknown[]>('readonly', (s) => s.getAll(), HISTORY_STORE);
    return all.filter(isHistoryEntry).reverse();
  } catch {
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.clear(), HISTORY_STORE);
  } catch {
    // Silinemeyen geçmiş yerinde kalır.
  }
}
