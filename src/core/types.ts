export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
/** 'a1'..'h8' */
export type Square = string;

export interface MoveRequest {
  from: Square;
  to: Square;
  promotion?: PieceType;
}

export type GameResult =
  | { kind: 'ongoing'; check: boolean }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'draw'; reason: 'stalemate' | 'threefold' | 'fiftyMove' | 'insufficient' }
  | { kind: 'resigned'; winner: Color };

/** Yapılmış bir hamlenin, görünümlerin canlandırmak için ihtiyaç duyduğu tam tarifi. */
export interface MoveEvent {
  piece: PieceType;
  color: Color;
  from: Square;
  to: Square;
  captured?: { piece: PieceType; square: Square };
  special: 'none' | 'castleK' | 'castleQ' | 'enPassant' | 'promotion';
  promotion?: PieceType;
  rookMove?: { from: Square; to: Square };
  san: string;
  fenAfter: string;
  result: GameResult;
}

export interface PieceOnBoard {
  square: Square;
  piece: PieceType;
  color: Color;
}

export const FILES = 'abcdefgh';

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}
