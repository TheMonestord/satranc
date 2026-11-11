import { beforeEach, describe, expect, test } from 'vitest';
import { showMenu } from '../../src/ui/menu';
import { setLang } from '../../src/ui/i18n';

const q = (sel: string) => document.querySelector<HTMLButtonElement>(sel)!;

describe('showMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLang('tr');
  });

  test('kayıt yoksa Devam Et gösterilmez', () => {
    void showMenu(document.body, { canResume: false, aiAvailable: true });
    expect(q('[data-menu="resume"]')).toBeNull();
  });

  test('Devam Et seçimi', async () => {
    const p = showMenu(document.body, { canResume: true, aiAvailable: true });
    q('[data-menu="resume"]').click();
    await expect(p).resolves.toEqual({ action: 'resume' });
  });

  test('İki Kişi seçimi', async () => {
    const p = showMenu(document.body, { canResume: false, aiAvailable: true });
    q('[data-menu="local"]').click();
    await expect(p).resolves.toEqual({
      action: 'new',
      config: { mode: 'local', level: 'easy', playerColor: 'w' },
    });
  });

  test('bilgisayara karşı: seviye ve renk seçilir', async () => {
    const p = showMenu(document.body, { canResume: false, aiAvailable: true });
    q('[data-menu="ai"]').click();
    expect(document.querySelectorAll('[data-level]')).toHaveLength(6);
    q('[data-level="master"]').click();
    q('[data-color="b"]').click();
    q('[data-menu="start"]').click();
    await expect(p).resolves.toEqual({
      action: 'new',
      config: { mode: 'ai', level: 'master', playerColor: 'b' },
    });
  });

  test('rastgele renk zara göre belirlenir', async () => {
    const p = showMenu(document.body, { canResume: false, aiAvailable: true, rng: () => 0.9 });
    q('[data-menu="ai"]').click();
    q('[data-color="random"]').click();
    q('[data-menu="start"]').click();
    const choice = await p;
    expect(choice).toEqual({ action: 'new', config: { mode: 'ai', level: 'easy', playerColor: 'b' } });
  });

  test('Geri ana menüye döner', () => {
    void showMenu(document.body, { canResume: false, aiAvailable: true });
    q('[data-menu="ai"]').click();
    q('[data-menu="back"]').click();
    expect(q('[data-menu="local"]')).not.toBeNull();
  });

  test('rakip yokken bilgisayar seçeneği devre dışıdır ve neden yazılır', () => {
    void showMenu(document.body, { canResume: false, aiAvailable: false });
    expect(q('[data-menu="ai"]').disabled).toBe(true);
    expect(document.body.textContent).toContain('Bilgisayar rakibi bu cihazda yüklenemedi');
  });
});
