import type { Color } from '../core/types';
import type { GameState } from '../game/gameManager';
import { t } from './i18n';

export type HudAction = 'undo' | 'flip' | 'view' | 'resign' | 'fen' | 'pgn' | 'settings' | 'menu';

export interface HudOptions {
  onAction(action: HudAction): void;
  can3d: boolean;
}

const ACTIONS: HudAction[] = ['undo', 'flip', 'view', 'resign', 'fen', 'pgn', 'settings', 'menu'];

function sideName(color: Color): string {
  return t(color === 'w' ? 'color.white' : 'color.black');
}

/** Yan panel: durum satırı, hamle listesi ve düğmeler. */
export class Hud {
  readonly root = document.createElement('aside');
  private status = document.createElement('div');
  private movesTitle = document.createElement('h2');
  private moves = document.createElement('ol');
  private toast = document.createElement('div');
  private buttons = new Map<HudAction, HTMLButtonElement>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private last: GameState | null = null;
  private view: '2d' | '3d' = '2d';

  constructor(private opts: HudOptions) {
    this.root.className = 'panel';
    this.status.className = 'status';
    this.status.setAttribute('aria-live', 'polite');
    this.movesTitle.className = 'moves-title';
    this.moves.className = 'moves';
    this.toast.className = 'toast';
    this.toast.setAttribute('aria-live', 'polite');

    const actions = document.createElement('div');
    actions.className = 'actions';
    for (const action of ACTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.dataset.action = action;
      btn.addEventListener('click', () => opts.onAction(action));
      this.buttons.set(action, btn);
      actions.append(btn);
    }
    this.buttons.get('view')!.disabled = !opts.can3d;
    this.root.append(this.status, this.movesTitle, this.moves, actions, this.toast);
    this.refreshLabels();
  }

  setView(view: '2d' | '3d'): void {
    this.view = view;
    this.refreshLabels();
  }

  /** Dil değişince çağrılır. */
  refreshLabels(): void {
    const label: Record<HudAction, string> = {
      undo: t('action.undo'),
      flip: t('action.flip'),
      view: t(this.view === '3d' ? 'action.view2d' : 'action.view3d'),
      resign: t('action.resign'),
      fen: t('action.fen'),
      pgn: t('action.pgn'),
      settings: t('action.settings'),
      menu: t('action.menu'),
    };
    for (const [action, btn] of this.buttons) btn.textContent = label[action];
    this.movesTitle.textContent = t('moves.title');
    if (this.last) this.update(this.last);
  }

  update(s: GameState): void {
    this.last = s;
    this.status.textContent = this.statusText(s);
    this.status.classList.toggle('over', s.result.kind !== 'ongoing');

    this.moves.replaceChildren();
    if (s.history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'moves-empty';
      empty.textContent = t('moves.empty');
      this.moves.append(empty);
    }
    for (let i = 0; i < s.history.length; i += 2) {
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'move-no';
      num.textContent = `${i / 2 + 1}.`;
      const white = document.createElement('span');
      white.className = 'move';
      white.textContent = s.history[i];
      li.append(num, white);
      if (s.history[i + 1]) {
        const black = document.createElement('span');
        black.className = 'move';
        black.textContent = s.history[i + 1];
        li.append(black);
      }
      this.moves.append(li);
    }
    this.moves.scrollTop = this.moves.scrollHeight;

    const ongoing = s.result.kind === 'ongoing';
    const canUndo =
      s.history.length > 0 &&
      (s.config.mode === 'local' || s.thinking || s.turn !== s.config.playerColor || s.history.length >= 2);
    this.buttons.get('undo')!.disabled = !canUndo;
    this.buttons.get('resign')!.disabled = !ongoing;
  }

  showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('visible'), 2200);
  }

  private statusText(s: GameState): string {
    const r = s.result;
    switch (r.kind) {
      case 'checkmate':
        return t('status.checkmate', { side: sideName(r.winner) });
      case 'resigned':
        return t('status.resigned', { side: sideName(r.winner) });
      case 'draw':
        return t(`status.draw.${r.reason}`);
      case 'ongoing': {
        if (s.opponentFailed) return t('status.opponentFailed');
        if (s.thinking) return t('status.thinking');
        const turn = t('status.turn', { side: sideName(s.turn) });
        return r.check ? `${t('status.check')} ${turn}` : turn;
      }
    }
  }
}
