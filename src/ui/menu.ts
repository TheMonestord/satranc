import type { Color } from '../core/types';
import { LEVEL_IDS, type LevelId } from '../engine/levels';
import type { GameConfig } from '../game/gameManager';
import { t } from './i18n';

export type MenuChoice = { action: 'resume' } | { action: 'new'; config: GameConfig };

export interface MenuOptions {
  canResume: boolean;
  aiAvailable: boolean;
  onSettings?: () => void;
  rng?: () => number;
}

function button(label: string, className = 'btn'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  return b;
}

/** Tek seçimli düğme grubu; seçili değeri döndüren bir okuyucu verir. */
function choiceGroup<T extends string>(
  label: string,
  name: string,
  options: Array<{ value: T; label: string }>,
  initial: T,
): { el: HTMLElement; value: () => T } {
  const group = document.createElement('fieldset');
  group.className = 'choice-group';
  const legend = document.createElement('legend');
  legend.textContent = label;
  const row = document.createElement('div');
  row.className = 'choice-row';
  let current = initial;
  const buttons: HTMLButtonElement[] = [];
  for (const o of options) {
    const b = button(o.label, 'chip');
    b.dataset[name] = o.value;
    b.setAttribute('aria-pressed', String(o.value === current));
    b.addEventListener('click', () => {
      current = o.value;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
    });
    buttons.push(b);
    row.append(b);
  }
  group.append(legend, row);
  return { el: group, value: () => current };
}

/** Ana menüyü gösterir ve oyuncunun seçimini döner. */
export function showMenu(host: HTMLElement, opts: MenuOptions): Promise<MenuChoice> {
  return new Promise<MenuChoice>((resolve) => {
    const root = document.createElement('main');
    root.className = 'menu';
    host.replaceChildren(root);
    const rng = opts.rng ?? Math.random;

    const header = () => {
      const h = document.createElement('h1');
      h.textContent = t('app.title');
      return h;
    };

    const showMain = () => {
      const sub = document.createElement('p');
      sub.className = 'menu-sub';
      sub.textContent = t('menu.subtitle');
      const list = document.createElement('div');
      list.className = 'menu-list';

      if (opts.canResume) {
        const resume = button(t('menu.resume'), 'btn primary big');
        resume.dataset.menu = 'resume';
        resume.addEventListener('click', () => resolve({ action: 'resume' }));
        list.append(resume);
      }

      const ai = button(t('menu.vsComputer'), opts.canResume ? 'btn big' : 'btn primary big');
      ai.dataset.menu = 'ai';
      ai.disabled = !opts.aiAvailable;
      ai.addEventListener('click', showAiSetup);
      list.append(ai);

      const local = button(t('menu.twoPlayers'), 'btn big');
      local.dataset.menu = 'local';
      local.title = t('menu.twoPlayersHint');
      local.addEventListener('click', () =>
        resolve({ action: 'new', config: { mode: 'local', level: 'easy', playerColor: 'w' } }),
      );
      list.append(local);

      if (opts.onSettings) {
        const settings = button(t('menu.settings'), 'btn ghost');
        settings.dataset.menu = 'settings';
        settings.addEventListener('click', () => opts.onSettings?.());
        list.append(settings);
      }

      root.replaceChildren(header(), sub, list);
      if (!opts.aiAvailable) {
        const note = document.createElement('p');
        note.className = 'menu-note';
        note.textContent = t('ai.unavailable');
        root.append(note);
      }
    };

    const showAiSetup = () => {
      const level = choiceGroup<LevelId>(
        t('menu.level'),
        'level',
        LEVEL_IDS.map((id) => ({ value: id, label: t(`level.${id}`) })),
        'easy',
      );
      const color = choiceGroup<Color | 'random'>(
        t('menu.color'),
        'color',
        [
          { value: 'w', label: t('color.white') },
          { value: 'b', label: t('color.black') },
          { value: 'random', label: t('color.random') },
        ],
        'w',
      );
      const row = document.createElement('div');
      row.className = 'dialog-row';
      const back = button(t('menu.back'));
      back.dataset.menu = 'back';
      back.addEventListener('click', showMain);
      const start = button(t('menu.start'), 'btn primary');
      start.dataset.menu = 'start';
      start.addEventListener('click', () => {
        const picked = color.value();
        const playerColor: Color = picked === 'random' ? (rng() < 0.5 ? 'w' : 'b') : picked;
        resolve({ action: 'new', config: { mode: 'ai', level: level.value(), playerColor } });
      });
      row.append(back, start);
      root.replaceChildren(header(), level.el, color.el, row);
    };

    showMain();
  });
}
