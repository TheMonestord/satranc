import type { MoveEvent, PieceOnBoard, Square } from '../core/types';
import type { GameManager, GameState } from '../game/gameManager';
import type { BoardView } from '../scene/view';
import { confirmDialog } from './dialog';
import { Hud, type HudAction } from './hud';
import { t } from './i18n';
import { askPromotion } from './promotionDialog';

export type ViewKind = '2d' | '3d';

export interface GameScreenDeps {
  gm: GameManager;
  createView(kind: ViewKind): BoardView;
  initialView: ViewKind;
  can3d: boolean;
  onExit(): void;
  onSettings(): void;
  onViewChange(kind: ViewKind): void;
}

/** Oyun ekranı: tahta görünümü ile yan paneli oyun yöneticisine bağlar ve seçim akışını yürütür. */
export class GameScreen {
  private root = document.createElement('div');
  private boardHost = document.createElement('div');
  private hud: Hud;
  private view: BoardView;
  private kind: ViewKind;
  private selected: Square | null = null;
  private lastMove: [Square, Square] | undefined;
  private flipped: boolean;
  /** Görünümün şu an gösterdiği konum; hamle olayı dışındaki değişiklikleri (geri alma, yeni oyun) yakalar. */
  private shownFen = '';
  private disposed = false;
  private busy = false;

  constructor(
    private host: HTMLElement,
    private deps: GameScreenDeps,
  ) {
    this.root.className = 'game';
    this.boardHost.className = 'board-host';
    const wrap = document.createElement('div');
    wrap.className = 'board-wrap';
    wrap.append(this.boardHost);

    this.hud = new Hud({ onAction: (a) => void this.onAction(a), can3d: deps.can3d });
    this.root.append(wrap, this.hud.root);
    host.replaceChildren(this.root);

    const state = deps.gm.state();
    this.flipped = state.config.mode === 'ai' && state.config.playerColor === 'b';
    this.kind = deps.initialView;
    this.view = this.mountView(this.kind);
    this.hud.setView(this.kind);

    deps.gm.on('move', (ev) => this.onMove(ev));
    deps.gm.on('state', (s) => this.onState(s));
    this.onState(state);
  }

  /** Görünümü değiştirir (2D ↔ 3D) veya tema değişince aynı türü yeniden kurar. */
  setView(kind: ViewKind): void {
    this.view.dispose();
    this.kind = kind;
    this.view = this.mountView(kind);
    this.hud.setView(kind);
    this.shownFen = '';
    this.onState(this.deps.gm.state());
  }

  currentView(): ViewKind {
    return this.kind;
  }

  refreshLabels(): void {
    this.hud.refreshLabels();
  }

  showToast(message: string): void {
    this.hud.showToast(message);
  }

  dispose(): void {
    this.disposed = true;
    this.view.dispose();
    this.root.remove();
  }

  private mountView(kind: ViewKind): BoardView {
    const view = this.deps.createView(kind);
    this.boardHost.dataset.view = kind;
    view.mount(this.boardHost);
    view.setFlipped(this.flipped);
    view.onSquareClick((sq) => void this.onSquareClick(sq));
    return view;
  }

  private onMove(ev: MoveEvent): void {
    if (this.disposed) return;
    this.selected = null;
    this.lastMove = [ev.from, ev.to];
    this.shownFen = ev.fenAfter;
    void this.view.applyMove(ev, this.deps.gm.pieces());
  }

  private onState(s: GameState): void {
    if (this.disposed) return;
    const pieces = this.deps.gm.pieces();
    if (s.fen !== this.shownFen) {
      // Hamle olayı olmadan değişen konum: geri alma, yeni oyun, geri yükleme veya görünüm değişimi.
      this.view.setPosition(pieces);
      this.shownFen = s.fen;
      this.selected = null;
      if (s.history.length === 0) this.lastMove = undefined;
    }
    this.hud.update(s);
    this.renderHighlights(s, pieces);
  }

  private renderHighlights(s: GameState, pieces: PieceOnBoard[]): void {
    const inCheck = s.result.kind === 'checkmate' || (s.result.kind === 'ongoing' && s.result.check);
    const king = inCheck ? pieces.find((p) => p.piece === 'k' && p.color === s.turn) : undefined;
    this.view.setHighlights({
      selected: this.selected ?? undefined,
      targets: this.selected ? this.deps.gm.legalTargets(this.selected) : [],
      lastMove: this.lastMove,
      check: king?.square,
    });
  }

  private async onSquareClick(sq: Square): Promise<void> {
    if (this.disposed || this.busy) return;
    const gm = this.deps.gm;
    const s = gm.state();

    if (this.selected && gm.legalTargets(this.selected).includes(sq)) {
      const from = this.selected;
      let promotion;
      if (gm.needsPromotion(from, sq)) {
        this.busy = true;
        promotion = await askPromotion(s.turn, this.host);
        this.busy = false;
        if (!promotion) {
          // Pencere kapatıldı: hamle yapılmaz, seçim korunur.
          this.renderHighlights(gm.state(), gm.pieces());
          return;
        }
      }
      this.selected = null;
      const ev = await gm.tryMove({ from, to: sq, promotion });
      if (!ev) this.renderHighlights(gm.state(), gm.pieces());
      return;
    }

    const own = gm.pieces().find((p) => p.square === sq && p.color === s.turn);
    this.selected = own && gm.legalTargets(sq).length > 0 ? sq : null;
    this.renderHighlights(s, gm.pieces());
  }

  private async onAction(action: HudAction): Promise<void> {
    const gm = this.deps.gm;
    switch (action) {
      case 'undo':
        this.lastMove = undefined;
        gm.undo();
        break;
      case 'flip':
        this.flipped = !this.flipped;
        this.view.setFlipped(this.flipped);
        break;
      case 'view': {
        const next: ViewKind = this.kind === '3d' ? '2d' : '3d';
        this.setView(next);
        this.deps.onViewChange(next);
        break;
      }
      case 'resign':
        if (await confirmDialog(this.host, t('confirm.resign'))) gm.resign();
        break;
      case 'fen':
        await this.copy(gm.state().fen);
        break;
      case 'pgn':
        await this.copy(gm.pgn());
        break;
      case 'settings':
        this.deps.onSettings();
        break;
      case 'menu':
        this.deps.onExit();
        break;
    }
  }

  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.hud.showToast(t('toast.copied'));
    } catch {
      this.hud.showToast(t('toast.copyFailed'));
    }
  }
}
