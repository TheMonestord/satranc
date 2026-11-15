import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  DEFAULT_SETTINGS,
  clearGame,
  loadGame,
  loadSettings,
  saveGame,
  saveSettings,
} from '../../src/game/storage';
import { writeRawGame } from './rawGame';

describe('ayarlar', () => {
  beforeEach(() => localStorage.clear());

  test('kayıt yoksa varsayılan döner', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('kaydedilen ayarlar okunur', () => {
    const s = { ...DEFAULT_SETTINGS, quality: 'high' as const, view: '2d' as const };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
  });

  test('bozuk JSON varsa varsayılan döner', () => {
    localStorage.setItem('satranc.ayarlar', '{bozuk');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('eksik veya geçersiz alanlar varsayılanla tamamlanır', () => {
    localStorage.setItem('satranc.ayarlar', JSON.stringify({ quality: 'ultra', language: 'en' }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, language: 'en' });
  });
});

describe('oyun kaydı', () => {
  beforeEach(async () => {
    await clearGame();
  });

  test('kayıt yoksa null', async () => {
    expect(await loadGame()).toBeNull();
  });

  test('kaydedilen oyun okunur', async () => {
    const g = { pgn: '1. e4 e5', mode: 'ai' as const, level: 'easy' as const, playerColor: 'w' as const };
    await saveGame(g);
    expect(await loadGame()).toEqual(g);
  });

  test('biçimi bozuk kayıt null döner', async () => {
    await writeRawGame({ mode: 'ai', level: 'easy' });
    expect(await loadGame()).toBeNull();
  });

  test('clearGame kaydı siler', async () => {
    await saveGame({ pgn: '', mode: 'local', level: 'easy', playerColor: 'w' });
    await clearGame();
    expect(await loadGame()).toBeNull();
  });
});

describe('tema kuşağı geçişi', () => {
  beforeEach(() => localStorage.clear());

  test('eski kuşaktan kayıt yeni varsayılan temalara bir kez geçer, diğer ayarlar korunur', () => {
    localStorage.setItem(
      'satranc.ayarlar',
      JSON.stringify({ ...DEFAULT_SETTINGS, quality: 'high', temaSurumu: 1, themes: { ortam: 'sorgu-odasi', masa: 'ahsap', taslar: 'klasik', eller: 'sade' } }),
    );
    const s = loadSettings();
    expect(s.themes).toEqual(DEFAULT_SETTINGS.themes);
    expect(s.quality).toBe('high');
    expect(s.temaSurumu).toBe(DEFAULT_SETTINGS.temaSurumu);
  });

  test('güncel kuşakta oyuncunun seçtiği tema korunur', () => {
    localStorage.setItem('satranc.ayarlar', JSON.stringify({ ...DEFAULT_SETTINGS, themes: { ...DEFAULT_SETTINGS.themes, ortam: 'sorgu-odasi' } }));
    expect(loadSettings().themes.ortam).toBe('sorgu-odasi');
  });
});
