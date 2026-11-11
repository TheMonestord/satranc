import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { GameScreen } from '../../src/ui/gameScreen';
import { GameManager } from '../../src/game/gameManager';
import { View2D } from '../../src/scene/view2d';
import { clearGame, saveGame } from '../../src/game/storage';
import { setLang } from '../../src/ui/i18n';
import type { MasaTheme } from '../../src/themes/types';

const masa: MasaTheme = {
  id: 'ahsap', tur: 'masa', ad: { tr: 'a', en: 'b' }, baseUrl: '',
  acikKare: '#e8d2a6', koyuKare: '#8a5a3c', cerceve: '#4a2f1e', masaRengi: '#3a261a',
};

const tick = () => new Promise((r) => setTimeout(r, 0));
const sq = (name: string) => document.querySelector<HTMLElement>(`[data-square="${name}"]`)!;

async function clickSquares(...names: string[]) {
  for (const n of names) {
    sq(n).click();
    await tick();
    await tick();
  }
}

async function setup(pgn?: string) {
  await clearGame();
  document.body.innerHTML = '<div id="app"></div>';
  setLang('tr');
  const gm = new GameManager({ opponent: null });
  if (pgn) {
    await saveGame({ pgn, mode: 'local', level: 'easy', playerColor: 'w' });
    await gm.resume();
  } else {
    await gm.start({ mode: 'local', level: 'easy', playerColor: 'w' });
  }
  const onExit = vi.fn();
  const screen = new GameScreen(document.getElementById('app')!, {
    gm,
    createView: () => new View2D(masa),
    initialView: '2d',
    can3d: false,
    onExit,
    onSettings: () => {},
    onViewChange: () => {},
  });
  return { gm, screen, onExit };
}

describe('GameScreen', () => {
  beforeEach(() => vi.restoreAllMocks());

  test('taşa tıklayınca gidebileceği kareler işaretlenir', async () => {
    await setup();
    await clickSquares('e2');
    expect(sq('e2').classList.contains('selected')).toBe(true);
    expect(sq('e3').classList.contains('target')).toBe(true);
    expect(sq('e4').classList.contains('target')).toBe(true);
  });

  test('iki tıklamayla hamle yapılır ve hamle listesine yazılır', async () => {
    const { gm } = await setup();
    await clickSquares('e2', 'e4');
    expect(gm.state().history).toEqual(['e4']);
    expect(sq('e4').textContent).toBe('♙');
    expect(document.querySelector('.moves')!.textContent).toContain('e4');
    expect(sq('e2').classList.contains('last')).toBe(true);
  });

  test('rakibin taşına veya boş kareye tıklamak seçim yapmaz', async () => {
    await setup();
    await clickSquares('e7');
    expect(document.querySelectorAll('.selected')).toHaveLength(0);
    await clickSquares('e4');
    expect(document.querySelectorAll('.selected')).toHaveLength(0);
  });

  test('seçiliyken kendi başka taşına tıklamak seçimi değiştirir', async () => {
    await setup();
    await clickSquares('e2', 'd2');
    expect(sq('d2').classList.contains('selected')).toBe(true);
    expect(sq('e2').classList.contains('selected')).toBe(false);
  });

  test('terfi: seçim yapılınca hamle uygulanır', async () => {
    const { gm } = await setup();
    // Beyaz piyon a7'de, a8 boş.
    await gm.start({ mode: 'local', level: 'easy', playerColor: 'w' });
    for (const m of ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6a7', 'b7c6']) {
      await gm.tryMove({ from: m.slice(0, 2), to: m.slice(2, 4) });
    }
    await tick();
    await clickSquares('a7', 'b8');
    expect(document.querySelector('.overlay')).not.toBeNull();
    document.querySelector<HTMLElement>('[data-piece="r"]')!.click();
    await tick();
    await tick();
    expect(gm.state().history.at(-1)).toBe('axb8=R');
    expect(sq('b8').textContent).toBe('♖');
  });

  test('terfi penceresi kapatılırsa hamle uygulanmaz ve sıra değişmez', async () => {
    const { gm } = await setup();
    for (const m of ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6a7', 'b7c6']) {
      await gm.tryMove({ from: m.slice(0, 2), to: m.slice(2, 4) });
    }
    await tick();
    const before = gm.state().history.length;
    await clickSquares('a7', 'b8');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick();
    await tick();
    expect(gm.state().history).toHaveLength(before);
    expect(gm.state().turn).toBe('w');
    expect(sq('a7').textContent).toBe('♙');
  });

  test('şah çekilince şahın karesi işaretlenir', async () => {
    await setup();
    await clickSquares('e2', 'e4', 'f7', 'f6', 'd1', 'h5');
    expect(sq('e8').classList.contains('check')).toBe(true);
  });

  test('oyun bitince sonuç yazılır', async () => {
    await setup();
    await clickSquares('f2', 'f3', 'e7', 'e5', 'g2', 'g4', 'd8', 'h4');
    expect(document.querySelector('.status')!.textContent).toContain('Şah mat');
    expect(document.querySelector('.status')!.textContent).toContain('Siyah');
  });

  test('geri al düğmesi son hamleyi geri alır', async () => {
    const { gm } = await setup();
    await clickSquares('e2', 'e4');
    document.querySelector<HTMLElement>('[data-action="undo"]')!.click();
    await tick();
    expect(gm.state().history).toEqual([]);
    expect(sq('e2').textContent).toBe('♙');
    expect(sq('e4').textContent).toBe('');
  });

  test('çevir düğmesi tahtayı çevirir', async () => {
    await setup();
    document.querySelector<HTMLElement>('[data-action="flip"]')!.click();
    expect(document.querySelectorAll<HTMLElement>('[data-square]')[0].dataset.square).toBe('h1');
  });

  test('pes et onay ister; onaylanınca oyun biter', async () => {
    const { gm } = await setup();
    await clickSquares('e2', 'e4');
    document.querySelector<HTMLElement>('[data-action="resign"]')!.click();
    await tick();
    expect(gm.state().result.kind).toBe('ongoing');
    document.querySelector<HTMLElement>('[data-confirm="yes"]')!.click();
    await tick();
    expect(gm.state().result).toEqual({ kind: 'resigned', winner: 'w' });
  });

  test('PGN düğmesi oyunu panoya kopyalar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await setup();
    await clickSquares('e2', 'e4');
    document.querySelector<HTMLElement>('[data-action="pgn"]')!.click();
    await tick();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('1. e4'));
  });

  test('menü düğmesi çıkış dinleyicisini çağırır', async () => {
    const { onExit } = await setup();
    document.querySelector<HTMLElement>('[data-action="menu"]')!.click();
    expect(onExit).toHaveBeenCalled();
  });

  test('geri yüklenen oyun tahtada ve listede görünür', async () => {
    await setup('1. e4 e5 2. Nf3');
    expect(sq('f3').textContent).toBe('♘');
    expect(document.querySelector('.moves')!.textContent).toContain('Nf3');
  });

  test('3D yokken görünüm düğmesi devre dışıdır', async () => {
    await setup();
    expect(document.querySelector<HTMLButtonElement>('[data-action="view"]')!.disabled).toBe(true);
  });
});
