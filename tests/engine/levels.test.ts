import { describe, expect, test } from 'vitest';
import { LEVELS, pickMove } from '../../src/engine/levels';
import type { MoveRequest } from '../../src/core/types';

const best: MoveRequest = { from: 'e2', to: 'e4' };
const legal: MoveRequest[] = [best, { from: 'd2', to: 'd4' }, { from: 'a2', to: 'a3' }];

describe('seviyeler', () => {
  test('altı seviyenin değerleri', () => {
    expect(LEVELS).toEqual({
      beginner: { skill: 0, moveTimeMs: 100, blunderRate: 0.35, minDelayMs: 600 },
      easy: { skill: 3, moveTimeMs: 200, blunderRate: 0.15, minDelayMs: 600 },
      medium: { skill: 8, moveTimeMs: 400, blunderRate: 0.05, minDelayMs: 600 },
      hard: { skill: 13, moveTimeMs: 800, blunderRate: 0, minDelayMs: 600 },
      expert: { skill: 17, moveTimeMs: 1500, blunderRate: 0, minDelayMs: 600 },
      master: { skill: 20, moveTimeMs: 2500, blunderRate: 0, minDelayMs: 600 },
    });
  });

  test('zar yüksek gelirse en iyi hamle oynanır', () => {
    expect(pickMove(best, legal, LEVELS.beginner, () => 0.99)).toEqual(best);
  });

  test('zar düşük gelirse en iyi olmayan bir hamle oynanır', () => {
    const picked = pickMove(best, legal, LEVELS.beginner, () => 0);
    expect(picked).not.toEqual(best);
    expect(legal).toContainEqual(picked);
  });

  test('hata oranı sıfırsa her zaman en iyi hamle', () => {
    expect(pickMove(best, legal, LEVELS.master, () => 0)).toEqual(best);
  });

  test('tek geçerli hamle varsa o oynanır', () => {
    expect(pickMove(best, [best], LEVELS.beginner, () => 0)).toEqual(best);
  });
});
