import type { Color, MoveEvent } from '../core/types';
import type { CharacterEvent } from '../scene/view3d/characters/types';
import type { GameState } from './gameManager';

/** Bir hamlenin, `who` renginde oynayan karaktere göre tepkileri. */
export function characterEventsForMove(ev: MoveEvent, who: Color): CharacterEvent[] {
  const out: CharacterEvent[] = [];
  const mine = ev.color === who;
  if (ev.captured) out.push(mine ? 'took-piece' : 'lost-piece');
  if (ev.result.kind === 'ongoing' && ev.result.check) out.push(mine ? 'gave-check' : 'in-check');
  return out;
}

/** Durum değişiminden doğan tepkiler: düşünmeye başlama/bitirme ve oyun sonu. */
export function characterEventsForState(prev: GameState | null, next: GameState, who: Color): CharacterEvent[] {
  const out: CharacterEvent[] = [];
  const wasThinking = prev?.thinking ?? false;
  if (!wasThinking && next.thinking) out.push('think-start');
  if (wasThinking && !next.thinking) out.push('think-end');
  const wasOver = prev ? prev.result.kind !== 'ongoing' : false;
  const r = next.result;
  // Oyun geri yükleme veya görünüm değişimiyle zaten bitmiş gelirse tepki verilmez.
  if (!wasOver && prev && r.kind !== 'ongoing') {
    if (r.kind === 'draw') out.push('draw');
    else out.push(r.winner === who ? 'won' : 'lost');
  }
  return out;
}
