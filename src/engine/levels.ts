import type { MoveRequest } from '../core/types';

export type LevelId = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export interface LevelConfig {
  /** Stockfish "Skill Level" (0-20) */
  skill: number;
  /** Motorun düşünme süresi */
  moveTimeMs: number;
  /** En iyi hamle yerine rastgele bir hamle oynama olasılığı */
  blunderRate: number;
  /** Hamle çok hızlı gelse bile beklenecek en kısa süre */
  minDelayMs: number;
}

export const LEVEL_IDS: LevelId[] = ['beginner', 'easy', 'medium', 'hard', 'expert', 'master'];

export const LEVELS: Record<LevelId, LevelConfig> = {
  beginner: { skill: 0, moveTimeMs: 100, blunderRate: 0.35, minDelayMs: 600 },
  easy: { skill: 3, moveTimeMs: 200, blunderRate: 0.15, minDelayMs: 600 },
  medium: { skill: 8, moveTimeMs: 400, blunderRate: 0.05, minDelayMs: 600 },
  hard: { skill: 13, moveTimeMs: 800, blunderRate: 0, minDelayMs: 600 },
  expert: { skill: 17, moveTimeMs: 1500, blunderRate: 0, minDelayMs: 600 },
  master: { skill: 20, moveTimeMs: 2500, blunderRate: 0, minDelayMs: 600 },
};

function same(a: MoveRequest, b: MoveRequest): boolean {
  return a.from === b.from && a.to === b.to && (a.promotion ?? '') === (b.promotion ?? '');
}

/** Alt seviyelerde bilinçli hata: zar hata oranının altında gelirse en iyi olmayan bir hamle seçilir. */
export function pickMove(
  best: MoveRequest,
  legal: MoveRequest[],
  cfg: LevelConfig,
  rng: () => number,
): MoveRequest {
  if (cfg.blunderRate <= 0 || rng() >= cfg.blunderRate) return best;
  const others = legal.filter((m) => !same(m, best));
  if (others.length === 0) return best;
  return others[Math.min(others.length - 1, Math.floor(rng() * others.length))];
}
