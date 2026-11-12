import type { Color, GameResult } from '../core/types';
import { t } from './i18n';

export function sideName(color: Color): string {
  return t(color === 'w' ? 'color.white' : 'color.black');
}

/** Bitmiş bir oyunun sonucunu etkin dilde anlatır; süren oyun için boş döner. */
export function resultText(r: GameResult): string {
  switch (r.kind) {
    case 'checkmate':
      return t('status.checkmate', { side: sideName(r.winner) });
    case 'resigned':
      return t('status.resigned', { side: sideName(r.winner) });
    case 'timeout':
      return t('status.timeout', { side: sideName(r.winner) });
    case 'draw':
      return t(`status.draw.${r.reason}`);
    case 'ongoing':
      return '';
  }
}
