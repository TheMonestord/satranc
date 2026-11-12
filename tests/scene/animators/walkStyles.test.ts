import { describe, expect, test } from 'vitest';
import type { PieceType } from '../../../src/core/types';
import { PIECE_HEIGHTS } from '../../../src/scene/view3d/pieces';
import { settleSquash, squareDistance, travelEase, walkDuration, walkPose } from '../../../src/scene/animators/walkStyles';

const TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const samples = Array.from({ length: 101 }, (_, i) => i / 100);

describe('yürüyüş biçimleri', () => {
  test('kare uzaklığı', () => {
    expect(squareDistance('e2', 'e4')).toBe(2);
    expect(squareDistance('a1', 'h8')).toBe(7);
    expect(squareDistance('g1', 'f3')).toBe(2);
  });

  test.each(TYPES)('%s: yolun başında ve sonunda duruş nötrdür', (type) => {
    for (const k of [0, 1]) {
      const pose = walkPose(type, k, 3);
      expect(pose.lift).toBeCloseTo(0, 5);
      expect(pose.pitch).toBeCloseTo(0, 5);
      expect(pose.roll).toBeCloseTo(0, 5);
      expect(Math.sin(pose.yaw)).toBeCloseTo(0, 5);
      expect(Math.cos(pose.yaw)).toBeCloseTo(1, 5);
      expect(travelEase(type, k)).toBeCloseTo(k, 5);
      expect(settleSquash(type, k)).toBeCloseTo(1, 5);
    }
  });

  test('at diğer taşların üzerinden atlar', () => {
    const peak = Math.max(...samples.map((k) => walkPose('n', k, 2).lift));
    expect(peak).toBeGreaterThan(PIECE_HEIGHTS.k);
  });

  test('kale yerden kalkmaz, piyon küçük adımlar atar', () => {
    expect(Math.max(...samples.map((k) => walkPose('r', k, 4).lift))).toBe(0);
    const pawnPeak = Math.max(...samples.map((k) => walkPose('p', k, 2).lift));
    expect(pawnPeak).toBeGreaterThan(0.05);
    expect(pawnPeak).toBeLessThan(0.3);
  });

  test('vezir yolda bir tam tur döner', () => {
    expect(walkPose('q', 1, 4).yaw).toBeCloseTo(2 * Math.PI, 5);
  });

  test('tempo: aynı yolda vezir filden, fil kaleden hızlıdır', () => {
    expect(walkDuration('q', 5)).toBeLessThan(walkDuration('b', 5));
    expect(walkDuration('b', 5)).toBeLessThan(walkDuration('r', 5));
  });

  test('ilerleme hiç geri gitmez', () => {
    for (const type of TYPES) {
      let last = 0;
      for (const k of samples) {
        const e = travelEase(type, k);
        expect(e).toBeGreaterThanOrEqual(last - 1e-9);
        last = e;
      }
    }
  });

  test('at ve kale varışta yere oturur', () => {
    expect(settleSquash('n', 0.5)).toBeLessThan(0.9);
    expect(settleSquash('r', 0.5)).toBeLessThan(1);
    expect(settleSquash('q', 0.5)).toBe(1);
  });
});
