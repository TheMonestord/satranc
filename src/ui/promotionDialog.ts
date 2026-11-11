import type { Color, PieceType } from '../core/types';
import { GLYPHS } from '../scene/view2d';
import { openOverlay } from './dialog';
import { t } from './i18n';

const OPTIONS: PieceType[] = ['q', 'r', 'b', 'n'];

/** Terfi taşını sorar. Pencere kapatılırsa null döner ve hamle yapılmaz. */
export function askPromotion(color: Color, host: HTMLElement): Promise<PieceType | null> {
  return openOverlay<PieceType | null>(host, null, (box, close) => {
    const title = document.createElement('p');
    title.textContent = t('promotion.title');
    const row = document.createElement('div');
    row.className = 'promotion-row';
    for (const piece of OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `promotion-option ${color}`;
      btn.dataset.piece = piece;
      btn.textContent = GLYPHS[color][piece];
      btn.setAttribute('aria-label', t(`piece.${piece}`));
      btn.title = t(`piece.${piece}`);
      btn.addEventListener('click', () => close(piece));
      row.append(btn);
    }
    box.append(title, row);
  });
}
