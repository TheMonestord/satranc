import type { Color } from '../core/types';
import { opposite } from '../core/types';

export interface ClockConfig {
  /** Her oyuncunun başlangıç süresi (ms). */
  initialMs: number;
  /** Her hamleden sonra hamleyi yapana eklenen süre (ms). */
  incrementMs: number;
}

export interface ClockSnapshot {
  w: number;
  b: number;
  running: Color | null;
}

/** Menüde sunulan süre seçenekleri; `null` süresiz oyundur. */
export const TIME_CONTROLS: Array<{ id: string; clock: ClockConfig | null }> = [
  { id: 'none', clock: null },
  { id: '3+2', clock: { initialMs: 3 * 60_000, incrementMs: 2000 } },
  { id: '5+0', clock: { initialMs: 5 * 60_000, incrementMs: 0 } },
  { id: '10+0', clock: { initialMs: 10 * 60_000, incrementMs: 0 } },
  { id: '15+10', clock: { initialMs: 15 * 60_000, incrementMs: 10_000 } },
];

/** Satranç saati. Zamanı kendisi saymaz; her sorguda `now()` ile geçen süreyi hesaplar. */
export class ChessClock {
  private left: Record<Color, number>;
  private running: Color | null = null;
  private since = 0;

  constructor(
    private cfg: ClockConfig,
    private now: () => number = () => Date.now(),
    remaining?: { w: number; b: number },
  ) {
    this.left = remaining ? { w: remaining.w, b: remaining.b } : { w: cfg.initialMs, b: cfg.initialMs };
  }

  /** `color` tarafının süresini akıtmaya başlar. */
  start(color: Color): void {
    this.settle();
    this.running = color;
    this.since = this.now();
  }

  /** `mover` hamlesini yaptı: eklenen süresini alır, saat rakibe geçer. */
  press(mover: Color): void {
    this.settle();
    this.left[mover] += this.cfg.incrementMs;
    this.running = opposite(mover);
    this.since = this.now();
  }

  pause(): void {
    this.settle();
    this.running = null;
  }

  remaining(color: Color): number {
    const spent = this.running === color ? this.now() - this.since : 0;
    return Math.max(0, this.left[color] - spent);
  }

  /** Süresi biten taraf; yoksa null. */
  flagged(): Color | null {
    if (this.remaining('w') <= 0) return 'w';
    if (this.remaining('b') <= 0) return 'b';
    return null;
  }

  snapshot(): ClockSnapshot {
    return { w: this.remaining('w'), b: this.remaining('b'), running: this.running };
  }

  config(): ClockConfig {
    return { ...this.cfg };
  }

  private settle(): void {
    if (this.running) this.left[this.running] = this.remaining(this.running);
    this.since = this.now();
  }
}

/** 10 saniyenin altında onda birler de gösterilir. */
export function formatClock(ms: number): string {
  if (ms < 10_000) {
    const tenths = Math.floor(ms / 100);
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`;
  }
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}
