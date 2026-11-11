import { beforeEach, describe, expect, test } from 'vitest';
import { askPromotion } from '../../src/ui/promotionDialog';

describe('askPromotion', () => {
  beforeEach(() => (document.body.innerHTML = ''));

  test('dört seçenek gösterir: vezir, kale, fil, at', () => {
    void askPromotion('w', document.body);
    const options = [...document.querySelectorAll<HTMLElement>('[data-piece]')].map((b) => b.dataset.piece);
    expect(options).toEqual(['q', 'r', 'b', 'n']);
  });

  test('seçilen taşı döner ve pencereyi kapatır', async () => {
    const p = askPromotion('b', document.body);
    document.querySelector<HTMLElement>('[data-piece="n"]')!.click();
    await expect(p).resolves.toBe('n');
    expect(document.querySelector('.overlay')).toBeNull();
  });

  test('Escape null döner', async () => {
    const p = askPromotion('w', document.body);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(p).resolves.toBeNull();
    expect(document.querySelector('.overlay')).toBeNull();
  });

  test('pencerenin dışına tıklama null döner', async () => {
    const p = askPromotion('w', document.body);
    document.querySelector<HTMLElement>('.overlay')!.click();
    await expect(p).resolves.toBeNull();
  });
});
