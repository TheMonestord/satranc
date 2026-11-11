import { afterEach, describe, expect, test, vi } from 'vitest';
import { DICTIONARIES, detectLang, setLang, t } from '../../src/ui/i18n';

describe('i18n', () => {
  afterEach(() => {
    setLang('tr');
    vi.unstubAllGlobals();
  });

  test('iki dilin anahtarları aynıdır', () => {
    expect(Object.keys(DICTIONARIES.en).sort()).toEqual(Object.keys(DICTIONARIES.tr).sort());
  });

  test('hiçbir çeviri boş değildir', () => {
    for (const lang of ['tr', 'en'] as const) {
      for (const [key, value] of Object.entries(DICTIONARIES[lang])) {
        expect(value, `${lang}:${key}`).not.toBe('');
      }
    }
  });

  test('dil değişince metin değişir', () => {
    setLang('tr');
    expect(t('menu.twoPlayers')).toBe('İki Kişi');
    setLang('en');
    expect(t('menu.twoPlayers')).toBe('Two Players');
  });

  test('bilinmeyen anahtar kendisini döner', () => {
    expect(t('yok.boyle.anahtar')).toBe('yok.boyle.anahtar');
  });

  test('yer tutucular doldurulur', () => {
    setLang('tr');
    expect(t('status.turn', { side: 'Beyaz' })).toContain('Beyaz');
  });

  test('tarayıcı dili İngilizce ise en, değilse tr', () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    expect(detectLang()).toBe('en');
    vi.stubGlobal('navigator', { language: 'de-DE' });
    expect(detectLang()).toBe('tr');
  });
});
