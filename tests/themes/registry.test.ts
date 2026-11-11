import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_THEME_IDS, ThemeRegistry } from '../../src/themes/registry';

/** public/temalar klasörünü diskten sunan sahte fetch; overrides ile tek tek dosyalar bozulabilir. */
function diskFetch(overrides: Record<string, string | null> = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const rel = url.replace(/^temalar\//, '');
    if (rel in overrides) {
      const body = overrides[rel];
      if (body === null) return new Response('yok', { status: 404 });
      return new Response(body, { status: 200 });
    }
    try {
      return new Response(readFileSync(join(process.cwd(), 'public', 'temalar', rel), 'utf8'), { status: 200 });
    } catch {
      return new Response('yok', { status: 404 });
    }
  }) as typeof fetch;
}

describe('ThemeRegistry', () => {
  test('depodaki bütün temalar geçerlidir ve yüklenir', async () => {
    const reg = await ThemeRegistry.load('temalar/', diskFetch());
    const index = JSON.parse(readFileSync(join(process.cwd(), 'public/temalar/index.json'), 'utf8'));
    const loaded = (['ortam', 'masa', 'taslar', 'eller'] as const).flatMap((s) => reg.list(s));
    expect(loaded).toHaveLength(index.temalar.length);
  });

  test('varsayılan temalar her yuvada vardır', async () => {
    const reg = await ThemeRegistry.load('temalar/', diskFetch());
    expect(reg.get('ortam', 'klasik-oda').arkaPlan).toBe('#1b1a22');
    expect(reg.get('masa', 'ahsap').acikKare).toBe('#e8d2a6');
    expect(reg.get('taslar', 'klasik').beyaz).toBe('#f2e9d8');
    expect(reg.get('eller', 'sade').renk).toBe('#d9a47e');
    expect(DEFAULT_THEME_IDS).toEqual({ ortam: 'klasik-oda', masa: 'ahsap', taslar: 'klasik', eller: 'sade' });
  });

  test('bozuk tema.json atlanır, diğerleri yüklenir', async () => {
    const reg = await ThemeRegistry.load('temalar/', diskFetch({ 'taslar/klasik/tema.json': '{bozuk' }));
    expect(reg.list('masa').length).toBeGreaterThan(0);
    // Bozuk dosyanın yerine yerleşik varsayılan kullanılır.
    expect(reg.get('taslar', 'klasik').beyaz).toBe('#f2e9d8');
  });

  test('doğrulamadan geçmeyen tema listeye girmez', async () => {
    const bad = JSON.stringify({ id: 'kotu', tur: 'masa', ad: { tr: 'a', en: 'b' }, acikKare: 'x' });
    const reg = await ThemeRegistry.load(
      'temalar/',
      diskFetch({ 'index.json': JSON.stringify({ temalar: ['masalar/ahsap', 'masalar/kotu'] }), 'masalar/kotu/tema.json': bad }),
    );
    expect(reg.list('masa').map((t) => t.id)).toEqual(['ahsap']);
  });

  test('bilinmeyen kimlik varsayılana döner', async () => {
    const reg = await ThemeRegistry.load('temalar/', diskFetch());
    expect(reg.get('masa', 'yok').id).toBe('ahsap');
  });

  test('index.json bulunamazsa yerleşik varsayılanlarla çalışır', async () => {
    const reg = await ThemeRegistry.load('temalar/', diskFetch({ 'index.json': null }));
    expect(reg.get('masa', 'ahsap').koyuKare).toBe('#8a5a3c');
    expect(reg.list('eller').map((t) => t.id)).toEqual(['sade']);
  });

  test('ağ hatasında da reddetmez', async () => {
    const failing = (async () => {
      throw new Error('ağ yok');
    }) as unknown as typeof fetch;
    const reg = await ThemeRegistry.load('temalar/', failing);
    expect(reg.get('ortam', 'klasik-oda').id).toBe('klasik-oda');
  });

  test('temanın baseUrl değeri kendi klasörüdür', async () => {
    const reg = await ThemeRegistry.load('temalar/', diskFetch());
    expect(reg.get('masa', 'ahsap').baseUrl).toBe('temalar/masalar/ahsap/');
  });
});
