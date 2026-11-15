import { describe, expect, test } from 'vitest';
import type { MoveEvent } from '../../src/core/types';
import { characterEventsForMove, characterEventsForState } from '../../src/game/characterEvents';
import type { GameState } from '../../src/game/gameManager';

const move = (over: Partial<MoveEvent>): MoveEvent => ({
  piece: 'p',
  color: 'w',
  from: 'e2',
  to: 'e4',
  special: 'none',
  san: 'e4',
  fenAfter: '',
  result: { kind: 'ongoing', check: false },
  ...over,
});

const state = (over: Partial<GameState>): GameState => ({
  fen: '',
  turn: 'w',
  result: { kind: 'ongoing', check: false },
  history: [],
  config: { mode: 'ai', level: 'easy', playerColor: 'w' },
  thinking: false,
  opponentFailed: false,
  clock: null,
  ...over,
});

describe('characterEventsForMove', () => {
  test('sessiz hamle tepki doğurmaz', () => {
    expect(characterEventsForMove(move({}), 'b')).toEqual([]);
  });
  test('karakterin taşı alınınca irkilir, kendisi alınca memnun olur', () => {
    const cap = { piece: 'n' as const, square: 'e4' };
    expect(characterEventsForMove(move({ color: 'w', captured: cap }), 'b')).toEqual(['lost-piece']);
    expect(characterEventsForMove(move({ color: 'b', captured: cap }), 'b')).toEqual(['took-piece']);
  });
  test('şah çeken ve şah yiyen ayrılır', () => {
    const check = { kind: 'ongoing' as const, check: true };
    expect(characterEventsForMove(move({ color: 'b', result: check }), 'b')).toEqual(['gave-check']);
    expect(characterEventsForMove(move({ color: 'w', result: check }), 'b')).toEqual(['in-check']);
  });
});

describe('characterEventsForState', () => {
  test('düşünmeye başlama ve bitirme', () => {
    const a = state({});
    const b = state({ thinking: true });
    expect(characterEventsForState(a, b, 'b')).toEqual(['think-start']);
    expect(characterEventsForState(b, a, 'b')).toEqual(['think-end']);
  });
  test('oyun sonu: kazanma, kaybetme, beraberlik', () => {
    const a = state({});
    expect(characterEventsForState(a, state({ result: { kind: 'checkmate', winner: 'b' } }), 'b')).toEqual(['won']);
    expect(characterEventsForState(a, state({ result: { kind: 'resigned', winner: 'w' } }), 'b')).toEqual(['lost']);
    expect(characterEventsForState(a, state({ result: { kind: 'draw', reason: 'stalemate' } }), 'b')).toEqual(['draw']);
  });
  test('zaten bitmiş olarak gelen oyun tepki doğurmaz', () => {
    const over = state({ result: { kind: 'checkmate', winner: 'b' } });
    expect(characterEventsForState(null, over, 'b')).toEqual([]);
    expect(characterEventsForState(over, over, 'b')).toEqual([]);
  });
});
