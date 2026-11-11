import { describe, expect, test } from 'vitest';
import { planHandSteps } from '../../../src/scene/animators/steps';
import { ChessCore } from '../../../src/core/chessCore';
import type { MoveEvent, PieceType } from '../../../src/core/types';

function last(fen: string | undefined, ...moves: string[]): MoveEvent {
  const core = new ChessCore(fen);
  let ev: MoveEvent | null = null;
  for (const m of moves) {
    ev = core.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: (m[4] as PieceType) || undefined });
    if (!ev) throw new Error(`geçersiz test hamlesi: ${m}`);
  }
  return ev!;
}

const CASTLE = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

describe('planHandSteps', () => {
  test('normal hamle', () => {
    expect(planHandSteps(last(undefined, 'e2e4'))).toEqual([{ kind: 'carry', from: 'e2', to: 'e4' }]);
  });

  test('taş alma: önce alınan taş kaldırılır', () => {
    expect(planHandSteps(last(undefined, 'e2e4', 'd7d5', 'e4d5'))).toEqual([
      { kind: 'remove', square: 'd5' },
      { kind: 'carry', from: 'e4', to: 'd5' },
    ]);
  });

  test('kısa rok: önce şah, sonra kale', () => {
    expect(planHandSteps(last(CASTLE, 'e1g1'))).toEqual([
      { kind: 'carry', from: 'e1', to: 'g1' },
      { kind: 'carry', from: 'h1', to: 'f1' },
    ]);
  });

  test('uzun rok', () => {
    expect(planHandSteps(last(CASTLE, 'e1c1'))).toEqual([
      { kind: 'carry', from: 'e1', to: 'c1' },
      { kind: 'carry', from: 'a1', to: 'd1' },
    ]);
  });

  test('geçerken alma: alınan piyon hedef karede değildir', () => {
    expect(planHandSteps(last(undefined, 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6'))).toEqual([
      { kind: 'remove', square: 'd5' },
      { kind: 'carry', from: 'e5', to: 'd6' },
    ]);
  });

  test('terfi: taşıdıktan sonra taş değişir', () => {
    expect(planHandSteps(last('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a7a8q'))).toEqual([
      { kind: 'carry', from: 'a7', to: 'a8' },
      { kind: 'swap', square: 'a8', to: 'q', color: 'w' },
    ]);
  });

  test('alarak terfi', () => {
    expect(planHandSteps(last('1n6/P7/8/8/8/8/8/k6K w - - 0 1', 'a7b8n'))).toEqual([
      { kind: 'remove', square: 'b8' },
      { kind: 'carry', from: 'a7', to: 'b8' },
      { kind: 'swap', square: 'b8', to: 'n', color: 'w' },
    ]);
  });
});
