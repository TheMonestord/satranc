import type { Color } from '../core/types';
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

export interface SavedGame {
  pgn: string;
  mode: 'ai' | 'local';
  level: LevelId;
  playerColor: Color;
}

export const DB_NAME = 'satranc';
export const GAME_STORE = 'oyun';
export const GAME_KEY = 'aktif';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(GAME_STORE)) open.result.createObjectStore(GAME_STORE);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(GAME_STORE, mode);
      const req = run(tx.objectStore(GAME_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function isSavedGame(v: unknown): v is SavedGame {
  if (!v || typeof v !== 'object') return false;
  const g = v as Record<string, unknown>;
  return (
    typeof g.pgn === 'string' &&
    (g.mode === 'ai' || g.mode === 'local') &&
    LEVEL_IDS.includes(g.level as LevelId) &&
    (g.playerColor === 'w' || g.playerColor === 'b')
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
