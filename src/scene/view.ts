import type { MoveEvent, PieceOnBoard, Square } from '../core/types';

export interface Highlights {
  selected?: Square;
  targets: Square[];
  lastMove?: [Square, Square];
  check?: Square;
}

/** 2D ve 3D görünümlerin ortak sözleşmesi. Görünümler oyun kurallarını bilmez. */
export interface BoardView {
  mount(el: HTMLElement): void;
  /** Konumu anında, animasyonsuz gösterir. */
  setPosition(pieces: PieceOnBoard[]): void;
  /** Hamleyi canlandırır; bittiğinde tahta piecesAfter konumunu gösterir. */
  applyMove(ev: MoveEvent, piecesAfter: PieceOnBoard[]): Promise<void>;
  setHighlights(h: Highlights): void;
  setFlipped(flipped: boolean): void;
  onSquareClick(cb: (sq: Square) => void): void;
  dispose(): void;
}
