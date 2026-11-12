import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { moveCue, resultCue } from '../../src/audio/cues';
import { SoundEngine } from '../../src/audio/soundEngine';
import type { MoveEvent } from '../../src/core/types';

/** Yalnızca düğüm sayısını tutan sahte ses bağlamı. */
function fakeContext() {
  const counts = { osc: 0, noise: 0, gain: 0, closed: false };
  const param = () => ({
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  });
  const node = (extra: Record<string, unknown> = {}) => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), ...extra });
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'running',
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {
      counts.closed = true;
    }),
    createGain: () => (counts.gain++, node({ gain: param() })),
    createOscillator: () => (counts.osc++, node({ frequency: param(), detune: param(), type: 'sine' })),
    createBiquadFilter: () => node({ frequency: param(), type: 'lowpass' }),
    createBufferSource: () => (counts.noise++, node({ buffer: null })),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  return { ctx: ctx as unknown as AudioContext, counts };
}

const ev = (over: Partial<MoveEvent>): MoveEvent => ({
  piece: 'p', color: 'w', from: 'e2', to: 'e4', special: 'none', san: 'e4', fenAfter: '',
  result: { kind: 'ongoing', check: false }, ...over,
});

describe('ses anları', () => {
  test('hamle sesi: taş alma ayrı duyulur', () => {
    expect(moveCue(ev({}))).toBe('place');
    expect(moveCue(ev({ captured: { piece: 'p', square: 'd5' } }))).toBe('capture');
  });

  test('sonuç sesi: şah, mat, beraberlik', () => {
    expect(resultCue(ev({}))).toBeNull();
    expect(resultCue(ev({ result: { kind: 'ongoing', check: true } }))).toBe('check');
    expect(resultCue(ev({ result: { kind: 'checkmate', winner: 'w' } }))).toBe('mate');
    expect(resultCue(ev({ result: { kind: 'draw', reason: 'stalemate' } }))).toBe('draw');
  });
});

describe('SoundEngine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('kullanıcı sayfaya dokunmadan ses bağlamı açılmaz', () => {
    const f = fakeContext();
    const create = vi.fn(() => f.ctx);
    const engine = new SoundEngine(create);
    engine.play('place');
    expect(create).not.toHaveBeenCalled();
  });

  test('ses açıkken her an için ses üretilir', () => {
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    engine.unlock();
    for (const cue of ['place', 'capture', 'step', 'jump', 'slide', 'glide', 'promote', 'check', 'mate', 'draw'] as const) {
      const before = f.counts.osc + f.counts.noise;
      engine.play(cue);
      expect(f.counts.osc + f.counts.noise, cue).toBeGreaterThan(before);
    }
  });

  test('ses kapalıyken hiçbir şey çalınmaz', () => {
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    engine.unlock();
    engine.setEnabled(false, false);
    engine.play('capture');
    expect(f.counts.osc + f.counts.noise).toBe(0);
  });

  test('müzik açılınca akorlar sırayla çalar, kapatılınca durur', () => {
    const f = fakeContext();
    const engine = new SoundEngine(() => f.ctx);
    engine.setEnabled(false, true);
    expect(f.counts.osc).toBe(0); // dokunuş bekleniyor
    engine.unlock();
    const first = f.counts.osc;
    expect(first).toBeGreaterThan(0);
    vi.advanceTimersByTime(6000);
    expect(f.counts.osc).toBe(first * 2);
    engine.setEnabled(false, false);
    vi.advanceTimersByTime(30_000);
    expect(f.counts.osc).toBe(first * 2);
  });

  test('ses desteği yoksa oyun sessiz sürer', () => {
    const engine = new SoundEngine(() => {
      throw new Error('AudioContext yok');
    });
    engine.unlock();
    expect(() => engine.play('place')).not.toThrow();
    expect(() => engine.setEnabled(true, true)).not.toThrow();
  });
});
