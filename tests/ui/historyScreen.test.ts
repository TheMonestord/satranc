import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { addHistory, clearHistory, listHistory } from '../../src/game/storage';
import { showHistory } from '../../src/ui/historyScreen';
import { setLang } from '../../src/ui/i18n';

const entry = (moves: number, pgn: string) => ({
  date: '2026-11-12T10:00:00.000Z', mode: 'ai' as const, level: 'hard' as const, playerColor: 'w' as const,
  result: { kind: 'checkmate' as const, winner: 'w' as const }, moves, pgn,
});
const flush = () => new Promise((r) => setTimeout(r, 20));

describe('showHistory', () => {
  beforeEach(async () => {
    document.body.replaceChildren();
    setLang('tr');
    await clearHistory();
  });

  test('geçmiş boşken bunu söyler', async () => {
    void showHistory(document.body, async () => true);
    await flush();
    expect(document.querySelector('.history-empty')!.textContent).toBe('Henüz bitmiş bir oyun yok.');
    expect(document.querySelector<HTMLButtonElement>('[data-history="clear"]')!.disabled).toBe(true);
  });

  test('oyunları sonuç, tür ve hamle sayısıyla listeler; PGN kopyalanır', async () => {
    await addHistory(entry(31, '1. e4 e5'));
    await addHistory(entry(12, '1. d4 d5'));
    const copied: string[] = [];
    void showHistory(document.body, async (text) => (copied.push(text), true));
    await flush();
    const items = [...document.querySelectorAll('.history-item')];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.history-result')!.textContent).toBe('Şah mat — Beyaz kazandı');
    expect(items[0].querySelector('.history-meta')!.textContent).toContain('Bilgisayara karşı (Zor)');
    expect(items[0].querySelector('.history-meta')!.textContent).toContain('12 hamle');
    items[0].querySelector<HTMLButtonElement>('[data-history="copy"]')!.click();
    await flush();
    expect(copied).toEqual(['1. d4 d5']);
  });

  test('temizleme onaydan sonra bütün kayıtları siler', async () => {
    await addHistory(entry(5, 'x'));
    void showHistory(document.body, async () => true);
    await flush();
    document.querySelector<HTMLButtonElement>('[data-history="clear"]')!.click();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-confirm="yes"]')!.click();
    await flush();
    expect(await listHistory()).toEqual([]);
    expect(document.querySelector('.history-empty')).not.toBeNull();
  });

  test('en çok 100 oyun saklanır', async () => {
    for (let i = 0; i < 103; i++) await addHistory(entry(i, ''));
    const all = await listHistory();
    expect(all).toHaveLength(100);
    expect(all[0].moves).toBe(102);
    expect(all[99].moves).toBe(3);
  });
});
