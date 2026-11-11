import { describe, expect, test } from 'vitest';
import { ChessCore } from '../../src/core/chessCore';
import type { PieceType } from '../../src/core/types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** 'e2e4' veya 'a7a8q' biçimindeki hamleleri sırayla oynar; son hamle olayını döner. */
function play(core: ChessCore, ...moves: string[]) {
  let last = null;
  for (const m of moves) {
    last = core.move({
      from: m.slice(0, 2),
      to: m.slice(2, 4),
      promotion: (m[4] as PieceType | undefined) || undefined,
    });
    if (!last) throw new Error(`geçersiz test hamlesi: ${m}`);
  }
  return last!;
}

describe('ChessCore', () => {
  test('geçersiz hamle null döner ve durumu değiştirmez', () => {
    const core = new ChessCore();
    expect(core.move({ from: 'e2', to: 'e5' })).toBeNull();
    expect(core.fen()).toBe(START);
  });

  test('normal hamle', () => {
    const core = new ChessCore();
    const ev = play(core, 'e2e4');
    expect(ev.special).toBe('none');
    expect(ev.san).toBe('e4');
    expect(ev.piece).toBe('p');
    expect(ev.color).toBe('w');
    expect(ev.result).toEqual({ kind: 'ongoing', check: false });
    expect(ev.fenAfter).toBe(core.fen());
    expect(core.turn()).toBe('b');
  });

  test('taş alma', () => {
    const core = new ChessCore();
    const ev = play(core, 'e2e4', 'd7d5', 'e4d5');
    expect(ev.captured).toEqual({ piece: 'p', square: 'd5' });
  });

  test('kısa rok', () => {
    const core = new ChessCore('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const ev = play(core, 'e1g1');
    expect(ev.special).toBe('castleK');
    expect(ev.rookMove).toEqual({ from: 'h1', to: 'f1' });
  });

  test('uzun rok', () => {
    const core = new ChessCore('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const ev = play(core, 'e1c1');
    expect(ev.special).toBe('castleQ');
    expect(ev.rookMove).toEqual({ from: 'a1', to: 'd1' });
  });

  test('siyahın kısa roku', () => {
    const core = new ChessCore('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    const ev = play(core, 'e8g8');
    expect(ev.special).toBe('castleK');
    expect(ev.rookMove).toEqual({ from: 'h8', to: 'f8' });
  });

  test('geçerken alma', () => {
    const core = new ChessCore();
    const ev = play(core, 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
    expect(ev.special).toBe('enPassant');
    expect(ev.captured).toEqual({ piece: 'p', square: 'd5' });
  });

  test('terfi', () => {
    const core = new ChessCore('8/P7/8/8/8/8/8/k6K w - - 0 1');
    expect(core.needsPromotion('a7', 'a8')).toBe(true);
    const ev = play(core, 'a7a8q');
    expect(ev.special).toBe('promotion');
    expect(ev.promotion).toBe('q');
  });

  test('terfi gerekmeyen hamle', () => {
    const core = new ChessCore();
    expect(core.needsPromotion('e2', 'e4')).toBe(false);
  });

  test('şah', () => {
    const core = new ChessCore();
    const ev = play(core, 'e2e4', 'f7f6', 'd1h5');
    expect(ev.result).toEqual({ kind: 'ongoing', check: true });
  });

  test('şah mat', () => {
    const core = new ChessCore();
    const ev = play(core, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(ev.result).toEqual({ kind: 'checkmate', winner: 'b' });
    expect(core.move({ from: 'a2', to: 'a3' })).toBeNull();
  });

  test('pat', () => {
    const core = new ChessCore('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(core.result()).toEqual({ kind: 'draw', reason: 'stalemate' });
  });

  test('yetersiz materyal', () => {
    const core = new ChessCore('8/8/8/8/8/8/8/k6K w - - 0 1');
    expect(core.result()).toEqual({ kind: 'draw', reason: 'insufficient' });
  });

  test('üç kez tekrar', () => {
    const core = new ChessCore();
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const ev = play(core, ...cycle, ...cycle);
    expect(ev.result).toEqual({ kind: 'draw', reason: 'threefold' });
  });

  test('50 hamle kuralı', () => {
    const core = new ChessCore('8/8/8/8/8/8/1R6/k6K w - - 99 60');
    const ev = play(core, 'b2b3');
    expect(ev.result).toEqual({ kind: 'draw', reason: 'fiftyMove' });
  });

  test('geri alma', () => {
    const core = new ChessCore();
    play(core, 'e2e4');
    expect(core.undo()).toBe(true);
    expect(core.fen()).toBe(START);
    expect(core.undo()).toBe(false);
  });

  test('geçerli hedef kareler', () => {
    const core = new ChessCore();
    expect(core.legalTargets('e2').sort()).toEqual(['e3', 'e4']);
    expect(core.legalTargets('e7')).toEqual([]);
    expect(core.legalTargets('e4')).toEqual([]);
  });

  test('bütün geçerli hamleler', () => {
    const core = new ChessCore();
    const all = core.allLegalMoves();
    expect(all).toHaveLength(20);
    expect(all).toContainEqual({ from: 'g1', to: 'f3' });
    const promo = new ChessCore('8/P7/8/8/8/8/8/k6K w - - 0 1').allLegalMoves();
    expect(promo).toContainEqual({ from: 'a7', to: 'a8', promotion: 'q' });
  });

  test('taş listesi', () => {
    const core = new ChessCore();
    const pieces = core.pieces();
    expect(pieces).toHaveLength(32);
    expect(pieces).toContainEqual({ square: 'e1', piece: 'k', color: 'w' });
    expect(pieces).toContainEqual({ square: 'd8', piece: 'q', color: 'b' });
  });

  test('PGN kaydedilir ve geri yüklenir', () => {
    const a = new ChessCore();
    play(a, 'e2e4', 'e7e5', 'g1f3');
    const b = new ChessCore();
    expect(b.loadPgn(a.pgn())).toBe(true);
    expect(b.fen()).toBe(a.fen());
    expect(b.history()).toEqual(['e4', 'e5', 'Nf3']);
  });

  test('bozuk PGN false döner ve durumu değiştirmez', () => {
    const core = new ChessCore();
    play(core, 'e2e4');
    const before = core.fen();
    expect(core.loadPgn('xx yy')).toBe(false);
    expect(core.fen()).toBe(before);
    expect(core.history()).toEqual(['e4']);
  });
});
