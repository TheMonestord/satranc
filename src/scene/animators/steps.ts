import type { Color, MoveEvent, PieceType, Square } from '../../core/types';

export type HandStep =
  | { kind: 'remove'; square: Square }
  | { kind: 'carry'; from: Square; to: Square }
  | { kind: 'swap'; square: Square; to: PieceType; color: Color };

/** Bir hamleyi elin sırayla yapacağı işlere çevirir: önce alınan taş kalkar, sonra taş taşınır. */
export function planHandSteps(ev: MoveEvent): HandStep[] {
  const steps: HandStep[] = [];
  if (ev.captured) steps.push({ kind: 'remove', square: ev.captured.square });
  steps.push({ kind: 'carry', from: ev.from, to: ev.to });
  if (ev.rookMove) steps.push({ kind: 'carry', from: ev.rookMove.from, to: ev.rookMove.to });
  if (ev.special === 'promotion' && ev.promotion) {
    steps.push({ kind: 'swap', square: ev.to, to: ev.promotion, color: ev.color });
  }
  return steps;
}
