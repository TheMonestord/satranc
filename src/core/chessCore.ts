import { Chess, type Move, type Square as ChessSquare } from 'chess.js';
import type { Color, GameResult, MoveEvent, MoveRequest, PieceOnBoard, Square } from './types';
import { opposite } from './types';

/** chess.js üzerine ince sarmalayıcı. Görselden habersizdir; dışarıya yalnızca kendi türlerini verir. */
export class ChessCore {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
  }

  legalTargets(from: Square): Square[] {
    try {
      const moves = this.chess.moves({ square: from as ChessSquare, verbose: true });
      return [...new Set(moves.map((m) => m.to as Square))];
    } catch {
      return [];
    }
  }

  needsPromotion(from: Square, to: Square): boolean {
    try {
      const moves = this.chess.moves({ square: from as ChessSquare, verbose: true });
      return moves.some((m) => m.to === to && m.isPromotion());
    } catch {
      return false;
    }
  }

  move(req: MoveRequest): MoveEvent | null {
    let m: Move;
    try {
      m = this.chess.move({ from: req.from, to: req.to, promotion: req.promotion });
    } catch {
      return null;
    }
    return this.toEvent(m);
  }

  undo(): boolean {
    return this.chess.undo() !== null;
  }

  turn(): Color {
    return this.chess.turn();
  }

  result(): GameResult {
    const c = this.chess;
    if (c.isCheckmate()) return { kind: 'checkmate', winner: opposite(c.turn()) };
    if (c.isStalemate()) return { kind: 'draw', reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient' };
    if (c.isThreefoldRepetition()) return { kind: 'draw', reason: 'threefold' };
    if (c.isDrawByFiftyMoves()) return { kind: 'draw', reason: 'fiftyMove' };
    return { kind: 'ongoing', check: c.isCheck() };
  }

  pieces(): PieceOnBoard[] {
    const out: PieceOnBoard[] = [];
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) out.push({ square: cell.square, piece: cell.type, color: cell.color });
      }
    }
    return out;
  }

  fen(): string {
    return this.chess.fen();
  }

  pgn(): string {
    return this.chess.pgn();
  }

  /** Bozuk PGN'de false döner ve mevcut oyuna dokunmaz. */
  loadPgn(pgn: string): boolean {
    const next = new Chess();
    try {
      next.loadPgn(pgn);
    } catch {
      return false;
    }
    this.chess = next;
    return true;
  }

  history(): string[] {
    return this.chess.history();
  }

  private toEvent(m: Move): MoveEvent {
    const ev: MoveEvent = {
      piece: m.piece,
      color: m.color,
      from: m.from,
      to: m.to,
      special: 'none',
      san: m.san,
      fenAfter: m.after,
      result: this.result(),
    };
    if (m.captured) {
      // Geçerken almada alınan piyon hedef karede değil, hedefin sütununda ve başlangıcın sırasındadır.
      const square = m.isEnPassant() ? `${m.to[0]}${m.from[1]}` : m.to;
      ev.captured = { piece: m.captured, square };
    }
    if (m.isKingsideCastle() || m.isQueensideCastle()) {
      const rank = m.from[1];
      const kingside = m.isKingsideCastle();
      ev.special = kingside ? 'castleK' : 'castleQ';
      ev.rookMove = kingside
        ? { from: `h${rank}`, to: `f${rank}` }
        : { from: `a${rank}`, to: `d${rank}` };
    } else if (m.isEnPassant()) {
      ev.special = 'enPassant';
    } else if (m.isPromotion()) {
      ev.special = 'promotion';
      ev.promotion = m.promotion;
    }
    return ev;
  }
}
