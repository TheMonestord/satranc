import type { MoveEvent, PieceOnBoard, Square } from '../core/types';
import type { ClockSnapshot } from '../game/clock';
import type { CharacterEvent } from './view3d/characters/types';

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
  /** İsteğe bağlı: sahnedeki saat (3D masa saati). null süresiz oyundur. */
  setClock?(clock: ClockSnapshot | null): void;
  /** İsteğe bağlı: karşıdaki karakterin tepkisi. */
  characterEvent?(ev: CharacterEvent): void;
  /** İsteğe bağlı: karşıdaki karakterin bakacağı kare (seçili taş); null serbest. */
  lookAtSquare?(sq: Square | null): void;
}
