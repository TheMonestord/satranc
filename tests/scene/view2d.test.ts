import { beforeEach, describe, expect, test, vi } from 'vitest';
import { View2D } from '../../src/scene/view2d';
import { ChessCore } from '../../src/core/chessCore';
import type { MasaTheme } from '../../src/themes/types';

const masa: MasaTheme = {
  id: 'ahsap', tur: 'masa', ad: { tr: 'a', en: 'b' }, baseUrl: '',
  acikKare: '#e8d2a6', koyuKare: '#8a5a3c', cerceve: '#4a2f1e', masaRengi: '#3a261a',
};

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new View2D(masa);
  view.mount(host);
  return { host, view };
}

const squares = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[data-square]')];
const sq = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`[data-square="${name}"]`)!;

describe('View2D', () => {
  beforeEach(() => (document.body.innerHTML = ''));

  test('64 kare ve başlangıçta 32 taş çizer', () => {
    const { host, view } = mount();
    view.setPosition(new ChessCore().pieces());
    expect(squares(host)).toHaveLength(64);
    expect(host.querySelectorAll('.piece')).toHaveLength(32);
    expect(sq(host, 'e1').textContent).toBe('♔');
    expect(sq(host, 'd8').textContent).toBe('♛');
  });

  test('beyaz alttayken ilk kare a8, çevrilince h1', () => {
    const { host, view } = mount();
    expect(squares(host)[0].dataset.square).toBe('a8');
    expect(squares(host)[63].dataset.square).toBe('h1');
    view.setFlipped(true);
    expect(squares(host)[0].dataset.square).toBe('h1');
  });

  test('çevirme taşları korur', () => {
    const { host, view } = mount();
    view.setPosition(new ChessCore().pieces());
    view.setFlipped(true);
    expect(host.querySelectorAll('.piece')).toHaveLength(32);
    expect(sq(host, 'e1').textContent).toBe('♔');
  });

  test('kareye tıklama dinleyiciye kare adını verir', () => {
    const { host, view } = mount();
    const cb = vi.fn();
    view.onSquareClick(cb);
    sq(host, 'e4').click();
    expect(cb).toHaveBeenCalledWith('e4');
  });

  test('vurgular ilgili karelere sınıf ekler ve yenisi eskisini siler', () => {
    const { host, view } = mount();
    view.setHighlights({ selected: 'e2', targets: ['e3', 'e4'], lastMove: ['d7', 'd5'], check: 'e8' });
    expect(sq(host, 'e2').classList.contains('selected')).toBe(true);
    expect(sq(host, 'e3').classList.contains('target')).toBe(true);
    expect(sq(host, 'e4').classList.contains('target')).toBe(true);
    expect(sq(host, 'd7').classList.contains('last')).toBe(true);
    expect(sq(host, 'e8').classList.contains('check')).toBe(true);
    view.setHighlights({ targets: [] });
    expect(host.querySelectorAll('.selected, .target, .last, .check')).toHaveLength(0);
  });

  test('applyMove sonrası tahta yeni konumu gösterir', async () => {
    const { host, view } = mount();
    const core = new ChessCore();
    view.setPosition(core.pieces());
    const ev = core.move({ from: 'e2', to: 'e4' })!;
    await view.applyMove(ev, core.pieces());
    expect(sq(host, 'e2').textContent).toBe('');
    expect(sq(host, 'e4').textContent).toBe('♙');
  });

  test('kare renkleri temadan gelir', () => {
    const { host } = mount();
    const board = host.querySelector<HTMLElement>('.board2d')!;
    expect(board.style.getPropertyValue('--acik-kare')).toBe('#e8d2a6');
    expect(board.style.getPropertyValue('--koyu-kare')).toBe('#8a5a3c');
  });

  test('tahta sabit piksel genişliği dayatmaz', () => {
    const { host } = mount();
    const board = host.querySelector<HTMLElement>('.board2d')!;
    expect(board.style.width).toBe('');
  });

  test('dispose tahtayı kaldırır', () => {
    const { host, view } = mount();
    view.dispose();
    expect(host.children).toHaveLength(0);
  });
});
