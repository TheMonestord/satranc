import { describe, expect, test } from 'vitest';
import { ChessClock, formatClock } from '../../src/game/clock';

function setup(initialMs = 60_000, incrementMs = 0) {
  let now = 1000;
  const clock = new ChessClock({ initialMs, incrementMs }, () => now);
  return { clock, tick: (ms: number) => (now += ms) };
}

describe('ChessClock', () => {
  test('başlamadan önce iki tarafın süresi tamdır ve akmaz', () => {
    const { clock, tick } = setup();
    tick(5000);
    expect(clock.remaining('w')).toBe(60_000);
    expect(clock.remaining('b')).toBe(60_000);
    expect(clock.snapshot().running).toBeNull();
  });

  test('yalnızca sırası olan tarafın süresi akar', () => {
    const { clock, tick } = setup();
    clock.start('w');
    tick(10_000);
    expect(clock.remaining('w')).toBe(50_000);
    expect(clock.remaining('b')).toBe(60_000);
  });

  test('hamle yapınca saat rakibe geçer ve eklenen süre hamle yapana yazılır', () => {
    const { clock, tick } = setup(60_000, 2000);
    clock.start('w');
    tick(10_000);
    clock.press('w');
    expect(clock.remaining('w')).toBe(52_000);
    tick(4000);
    expect(clock.remaining('b')).toBe(56_000);
    expect(clock.snapshot().running).toBe('b');
  });

  test('süresi biten taraf bayrak düşürür ve süre eksiye inmez', () => {
    const { clock, tick } = setup(3000);
    clock.start('w');
    tick(2999);
    expect(clock.flagged()).toBeNull();
    tick(5000);
    expect(clock.flagged()).toBe('w');
    expect(clock.remaining('w')).toBe(0);
  });

  test('duraklatılınca süre akmaz', () => {
    const { clock, tick } = setup();
    clock.start('b');
    tick(1000);
    clock.pause();
    tick(60_000);
    expect(clock.remaining('b')).toBe(59_000);
    expect(clock.flagged()).toBeNull();
  });

  test('kayıttan kalan sürelerle kurulabilir', () => {
    let now = 0;
    const clock = new ChessClock({ initialMs: 60_000, incrementMs: 0 }, () => now, { w: 12_000, b: 34_000 });
    clock.start('b');
    now += 4000;
    expect(clock.snapshot()).toEqual({ w: 12_000, b: 30_000, running: 'b' });
  });

  test('süre biçimi', () => {
    expect(formatClock(600_000)).toBe('10:00');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(59_001)).toBe('1:00'); // yukarı yuvarlanır: 0:59 görünürken hâlâ 59 saniyeden fazla vardır
    expect(formatClock(9_400)).toBe('0:09.4');
    expect(formatClock(0)).toBe('0:00.0');
    expect(formatClock(3_600_000)).toBe('60:00');
  });
});
