import { describe, expect, test } from 'vitest';
import type { GameState } from '../../src/game/gameManager';
import { Hud } from '../../src/ui/hud';
import { setLang } from '../../src/ui/i18n';

const state = (over: Partial<GameState>): GameState => ({
  fen: '', turn: 'w', result: { kind: 'ongoing', check: false }, history: ['e4'],
  config: { mode: 'local', level: 'easy', playerColor: 'w' }, thinking: false, opponentFailed: false, clock: null, ...over,
});

describe('Hud saat', () => {
  test('süresiz oyunda saat gizlidir ve geri alma açıktır', () => {
    setLang('tr');
    const hud = new Hud({ onAction: () => {}, can3d: true });
    hud.update(state({}));
    expect(hud.root.querySelector<HTMLElement>('.clocks')!.hidden).toBe(true);
    expect(hud.root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled).toBe(false);
  });

  test('saatli oyunda süreler görünür, sırası olan vurgulanır, geri alma kapalıdır', () => {
    setLang('tr');
    const hud = new Hud({ onAction: () => {}, can3d: true });
    hud.update(state({ clock: { w: 299_000, b: 15_000, running: 'b' } }));
    const w = hud.root.querySelector<HTMLElement>('[data-clock="w"]')!;
    const b = hud.root.querySelector<HTMLElement>('[data-clock="b"]')!;
    expect(hud.root.querySelector<HTMLElement>('.clocks')!.hidden).toBe(false);
    expect(w.textContent).toContain('4:59');
    expect(b.textContent).toContain('0:15');
    expect(b.classList.contains('active')).toBe(true);
    expect(b.classList.contains('low')).toBe(true);
    expect(w.classList.contains('active')).toBe(false);
    expect(hud.root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled).toBe(true);
  });

  test('süre bitince sonuç yazılır', () => {
    setLang('tr');
    const hud = new Hud({ onAction: () => {}, can3d: true });
    hud.update(state({ result: { kind: 'timeout', winner: 'w' }, clock: { w: 1000, b: 0, running: null } }));
    expect(hud.root.querySelector('.status')!.textContent).toBe('Süre bitti — Beyaz kazandı');
  });
});
