import { ChessCore } from '../core/chessCore';
import type { Color, GameResult, MoveEvent, MoveRequest, PieceOnBoard, Square } from '../core/types';
import { opposite } from '../core/types';
import { LEVELS, pickMove, type LevelConfig, type LevelId } from '../engine/levels';
import { clearGame, loadGame, saveGame } from './storage';

export interface Opponent {
  bestMove(fen: string, cfg: LevelConfig): Promise<MoveRequest>;
}

export interface GameConfig {
  mode: 'ai' | 'local';
  level: LevelId;
  playerColor: Color;
}

export interface GameState {
  fen: string;
  turn: Color;
  result: GameResult;
  history: string[];
  config: GameConfig;
  thinking: boolean;
  /** Rakip hamle üretemedi; oyun bu hâliyle sürdürülemez. */
  opponentFailed: boolean;
}

type MoveListener = (ev: MoveEvent) => void;
type StateListener = (s: GameState) => void;

const DEFAULT_CONFIG: GameConfig = { mode: 'local', level: 'easy', playerColor: 'w' };

/** Sırayı, rakip çağrısını ve kaydı yönetir. Görünümler yalnızca olaylarını dinler. */
export class GameManager {
  private core = new ChessCore();
  private config: GameConfig = { ...DEFAULT_CONFIG };
  private resigned: Color | null = null;
  private thinking = false;
  private opponentFailed = false;
  /** Her yeni oyun veya geri almada artar; eski rakip yanıtlarını geçersiz kılar. */
  private generation = 0;
  private moveListeners: MoveListener[] = [];
  private stateListeners: StateListener[] = [];
  private opponent: Opponent | null;
  private rng: () => number;
  private delay: (ms: number) => Promise<void>;

  constructor(deps: {
    opponent: Opponent | null;
    rng?: () => number;
    delay?: (ms: number) => Promise<void>;
  }) {
    this.opponent = deps.opponent;
    this.rng = deps.rng ?? Math.random;
    this.delay = deps.delay ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async start(config: GameConfig): Promise<void> {
    if (config.mode === 'ai' && !this.opponent) {
      throw new Error('Bilgisayar rakibi kullanılamıyor');
    }
    this.reset(config, new ChessCore());
    await this.persist();
    this.emitState();
    this.maybeAskOpponent();
  }

  /** Kayıtlı oyunu geri yükler. Kayıt yoksa veya kullanılamıyorsa false döner. */
  async resume(): Promise<boolean> {
    const saved = await loadGame();
    if (!saved) return false;
    if (saved.mode === 'ai' && !this.opponent) return false;
    const core = new ChessCore();
    if (!core.loadPgn(saved.pgn)) {
      await clearGame();
      return false;
    }
    this.reset({ mode: saved.mode, level: saved.level, playerColor: saved.playerColor }, core);
    this.emitState();
    this.maybeAskOpponent();
    return true;
  }

  legalTargets(from: Square): Square[] {
    return this.canPlayerMove() ? this.core.legalTargets(from) : [];
  }

  needsPromotion(from: Square, to: Square): boolean {
    return this.core.needsPromotion(from, to);
  }

  pieces(): PieceOnBoard[] {
    return this.core.pieces();
  }

  async tryMove(req: MoveRequest): Promise<MoveEvent | null> {
    if (!this.canPlayerMove()) return null;
    const ev = this.core.move(req);
    if (!ev) return null;
    await this.afterMove(ev);
    this.maybeAskOpponent();
    return ev;
  }

  undo(): void {
    if (this.config.mode === 'ai') {
      if (this.thinking) {
        // Rakip düşünürken geri alma: bekleyen yanıt geçersiz olur, oyuncunun hamlesi geri alınır.
        this.generation++;
        this.thinking = false;
        this.core.undo();
      } else if (this.core.turn() === this.config.playerColor) {
        if (this.core.history().length < 2) return;
        this.core.undo();
        this.core.undo();
      } else {
        // Oyun rakibin hamle sırasında bitmiş (oyuncu mat etmiş veya rakip hata vermiş).
        if (!this.core.undo()) return;
      }
    } else if (!this.core.undo()) {
      return;
    }
    this.resigned = null;
    this.opponentFailed = false;
    void this.persist();
    this.emitState();
  }

  resign(): void {
    if (this.result().kind !== 'ongoing') return;
    this.generation++;
    this.thinking = false;
    this.resigned = this.config.mode === 'ai' ? this.config.playerColor : this.core.turn();
    void clearGame();
    this.emitState();
  }

  state(): GameState {
    return {
      fen: this.core.fen(),
      turn: this.core.turn(),
      result: this.result(),
      history: this.core.history(),
      config: { ...this.config },
      thinking: this.thinking,
      opponentFailed: this.opponentFailed,
    };
  }

  pgn(): string {
    return this.core.pgn();
  }

  on(event: 'move', cb: MoveListener): void;
  on(event: 'state', cb: StateListener): void;
  on(event: 'move' | 'state', cb: MoveListener | StateListener): void {
    if (event === 'move') this.moveListeners.push(cb as MoveListener);
    else this.stateListeners.push(cb as StateListener);
  }

  private reset(config: GameConfig, core: ChessCore): void {
    this.generation++;
    this.config = { ...config };
    this.core = core;
    this.resigned = null;
    this.thinking = false;
    this.opponentFailed = false;
  }

  private result(): GameResult {
    if (this.resigned) return { kind: 'resigned', winner: opposite(this.resigned) };
    return this.core.result();
  }

  private canPlayerMove(): boolean {
    if (this.result().kind !== 'ongoing' || this.thinking || this.opponentFailed) return false;
    return this.config.mode === 'local' || this.core.turn() === this.config.playerColor;
  }

  private async afterMove(ev: MoveEvent): Promise<void> {
    for (const cb of this.moveListeners) cb(ev);
    this.emitState();
    if (ev.result.kind === 'ongoing') await this.persist();
    else await clearGame();
  }

  private async persist(): Promise<void> {
    try {
      await saveGame({ pgn: this.core.pgn(), ...this.config });
    } catch {
      // Kayıt başarısız olsa da oyun sürer; yalnızca sayfa yenilenince devam edilemez.
    }
  }

  private maybeAskOpponent(): void {
    if (this.config.mode !== 'ai' || !this.opponent) return;
    if (this.result().kind !== 'ongoing' || this.core.turn() === this.config.playerColor) return;
    if (this.thinking) return;
    this.thinking = true;
    this.emitState();
    void this.runOpponent(this.generation);
  }

  private async runOpponent(generation: number): Promise<void> {
    const opponent = this.opponent!;
    const cfg = LEVELS[this.config.level];
    const fen = this.core.fen();
    let best: MoveRequest | null = null;
    for (let attempt = 0; attempt < 2 && !best; attempt++) {
      try {
        [best] = await Promise.all([opponent.bestMove(fen, cfg), this.delay(cfg.minDelayMs)]);
      } catch {
        best = null;
      }
      if (generation !== this.generation) return;
    }
    if (generation !== this.generation) return;

    const chosen = best ? pickMove(best, this.core.allLegalMoves(), cfg, this.rng) : null;
    const ev = chosen ? (this.core.move(chosen) ?? (best ? this.core.move(best) : null)) : null;
    this.thinking = false;
    if (!ev) {
      this.opponentFailed = true;
      this.emitState();
      return;
    }
    await this.afterMove(ev);
  }

  private emitState(): void {
    const s = this.state();
    for (const cb of this.stateListeners) cb(s);
  }
}
