import type { MoveEvent } from '../core/types';

/** Oyundaki ses anları. Görünümler ve hareket modları bunları bildirir; ses motoru çalar. */
export type Cue = 'place' | 'capture' | 'step' | 'jump' | 'slide' | 'glide' | 'promote' | 'check' | 'mate' | 'draw';

/** Canlandırma yokken (2D görünüm, animasyon kapalı) hamlenin kendisi için çalınacak ses. */
export function moveCue(ev: MoveEvent): Cue {
  return ev.captured ? 'capture' : 'place';
}

/** Hamlenin sonucu için ek ses: şah, mat veya beraberlik. */
export function resultCue(ev: MoveEvent): Cue | null {
  switch (ev.result.kind) {
    case 'checkmate':
      return 'mate';
    case 'draw':
      return 'draw';
    case 'ongoing':
      return ev.result.check ? 'check' : null;
    default:
      return null;
  }
}
