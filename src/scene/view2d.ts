import { moveCue, resultCue, type Cue } from '../audio/cues';
import type { Color, MoveEvent, PieceOnBoard, PieceType, Square } from '../core/types';
import { FILES } from '../core/types';
import type { MasaTheme } from '../themes/types';
import type { BoardView, Highlights } from './view';

export const GLYPHS: Record<Color, Record<PieceType, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const HIGHLIGHT_CLASSES = ['selected', 'target', 'last', 'check'];

/** Düz tahta. WebGL olmayan cihazlarda ve oyuncu istediğinde kullanılır. */
export class View2D implements BoardView {
  private cueCb: (cue: Cue) => void = () => {};
  private board = document.createElement('div');
  private squares = new Map<Square, HTMLButtonElement>();
  private pieces: PieceOnBoard[] = [];
  private highlights: Highlights = { targets: [] };
  private flipped = false;
  private clickCb: (sq: Square) => void = () => {};

  constructor(masa: MasaTheme) {
    this.board.className = 'board2d';
    this.applyTheme(masa);
    this.board.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-square]');
      if (el?.dataset.square) this.clickCb(el.dataset.square);
    });
    this.build();
  }

  applyTheme(masa: MasaTheme): void {
    this.board.style.setProperty('--acik-kare', masa.acikKare);
    this.board.style.setProperty('--koyu-kare', masa.koyuKare);
    this.board.style.setProperty('--cerceve', masa.cerceve);
  }

  mount(el: HTMLElement): void {
    el.append(this.board);
  }

  setPosition(pieces: PieceOnBoard[]): void {
    this.pieces = pieces;
    for (const el of this.squares.values()) el.replaceChildren();
    for (const p of pieces) {
      const span = document.createElement('span');
      span.className = `piece ${p.color}`;
      span.textContent = GLYPHS[p.color][p.piece];
      this.squares.get(p.square)?.append(span);
    }
  }

  applyMove(ev: MoveEvent, piecesAfter: PieceOnBoard[]): Promise<void> {
    this.setPosition(piecesAfter);
    this.cueCb(moveCue(ev));
    const after = resultCue(ev);
    if (after) this.cueCb(after);
    return Promise.resolve();
  }

  /** Ses anlarını dinler. */
  onCue(cb: (cue: Cue) => void): void {
    this.cueCb = cb;
  }

  setHighlights(h: Highlights): void {
    this.highlights = h;
    for (const el of this.squares.values()) el.classList.remove(...HIGHLIGHT_CLASSES);
    if (h.lastMove) for (const s of h.lastMove) this.squares.get(s)?.classList.add('last');
    if (h.check) this.squares.get(h.check)?.classList.add('check');
    if (h.selected) this.squares.get(h.selected)?.classList.add('selected');
    for (const s of h.targets) this.squares.get(s)?.classList.add('target');
  }

  setFlipped(flipped: boolean): void {
    if (flipped === this.flipped) return;
    this.flipped = flipped;
    this.build();
    this.setPosition(this.pieces);
    this.setHighlights(this.highlights);
  }

  onSquareClick(cb: (sq: Square) => void): void {
    this.clickCb = cb;
  }

  dispose(): void {
    this.board.remove();
  }

  private build(): void {
    this.board.replaceChildren();
    this.squares.clear();
    const ranks = this.flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const files = this.flipped ? [...FILES].reverse() : [...FILES];
    ranks.forEach((rank, row) => {
      files.forEach((file, col) => {
        const name = `${file}${rank}`;
        const el = document.createElement('button');
        el.type = 'button';
        const dark = (FILES.indexOf(file) + rank) % 2 === 1;
        el.className = `sq ${dark ? 'dark' : 'light'}`;
        el.dataset.square = name;
        el.setAttribute('aria-label', name);
        // Koordinatlar metin olarak değil, CSS ile çizilir.
        if (col === 0) el.dataset.rank = String(rank);
        if (row === 7) el.dataset.file = file;
        this.squares.set(name, el);
        this.board.append(el);
      });
    });
  }
}
