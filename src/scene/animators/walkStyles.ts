import type { PieceType, Square } from '../../core/types';

/** Yürüyen bir taşın, yolun `k` (0–1) noktasındaki duruşu. Yolun başında ve sonunda nötrdür. */
export interface WalkPose {
  /** Tahtadan yükseklik. */
  lift: number;
  /** Gidiş yönünde öne (+) veya arkaya (−) eğilme, radyan. */
  pitch: number;
  /** Gidiş yönüne göre yana yatma, radyan. */
  roll: number;
  /** Kendi ekseninde dönme, radyan. */
  yaw: number;
}

/** İki kare arasındaki uzaklık, kare cinsinden (çaprazlar tek adım sayılır). */
export function squareDistance(from: Square, to: Square): number {
  const dx = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
  const dy = Math.abs(from.charCodeAt(1) - to.charCodeAt(1));
  return Math.max(dx, dy);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Yolculuğun normal hızdaki süresi (ms). Her taşın kendi temposu vardır. */
export function walkDuration(type: PieceType, squares: number): number {
  switch (type) {
    case 'p':
      return clamp(520 * squares, 800, 1400); // küçük, hızlı adımlar
    case 'n':
      return 1150; // tek sıçrayış
    case 'r':
      return clamp(560 * squares, 1100, 2800); // ağır
    case 'b':
      return clamp(380 * squares, 950, 2200); // süzülür
    case 'q':
      return clamp(280 * squares, 900, 1700); // hızlı ve zarif
    case 'k':
      return 1300; // ağırbaşlı
  }
}

/** Yol üzerindeki ilerlemenin zamana göre eğrisi (0–1 → 0–1). */
export function travelEase(type: PieceType, k: number): number {
  const smooth = k * k * (3 - 2 * k);
  switch (type) {
    case 'r':
      // Ağır kalkar, ağır durur.
      return smooth * smooth * (3 - 2 * smooth);
    case 'n':
      return k; // sıçrayış boyunca sabit yatay hız
    default:
      return smooth;
  }
}

export function walkPose(type: PieceType, k: number, squares: number): WalkPose {
  const arc = Math.sin(Math.PI * k);
  switch (type) {
    case 'p': {
      const steps = Math.max(2, squares * 2);
      return { lift: Math.abs(Math.sin(Math.PI * steps * k)) * 0.14, pitch: 0.14 * arc, roll: 0, yaw: 0 };
    }
    case 'n':
      // Diğer taşların üzerinden atlar: kalkışta burun yukarı, inişte aşağı.
      return { lift: arc * 2.1, pitch: -0.45 * Math.sin(2 * Math.PI * k), roll: 0, yaw: 0 };
    case 'r':
      return { lift: 0, pitch: 0, roll: 0.035 * Math.sin(Math.PI * 2 * squares * k) * arc, yaw: 0 };
    case 'b':
      return { lift: 0.3 * arc, pitch: 0.1 * arc, roll: 0, yaw: 0 };
    case 'q':
      return { lift: 0.12 * arc, pitch: 0.08 * arc, roll: 0, yaw: 2 * Math.PI * (k * k * (3 - 2 * k)) };
    case 'k':
      return {
        lift: Math.abs(Math.sin(Math.PI * 2 * k)) * 0.06,
        pitch: 0,
        roll: 0.07 * Math.sin(Math.PI * 4 * k) * arc,
        yaw: 0,
      };
  }
}

/** Varışta yere oturma: gövdenin dikey ezilme oranı (1 = normal). Yalnızca ağır inen taşlarda belirgindir. */
export function settleSquash(type: PieceType, k: number): number {
  const depth = type === 'n' ? 0.14 : type === 'r' ? 0.07 : 0;
  return 1 - depth * Math.sin(Math.PI * k);
}

export const SETTLE_MS = 220;
