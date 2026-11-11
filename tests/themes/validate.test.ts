import { describe, expect, test } from 'vitest';
import { validateManifest } from '../../src/themes/validate';

const ad = { tr: 'Ad', en: 'Name' };
const valid = {
  ortam: { id: 'o', tur: 'ortam', ad, arkaPlan: '#1b1a22', zemin: '#2b2622', isikRengi: '#fff1d6', isikSiddeti: 2.2 },
  masa: { id: 'm', tur: 'masa', ad, acikKare: '#e8d2a6', koyuKare: '#8a5a3c', cerceve: '#4a2f1e', masaRengi: '#3a261a' },
  taslar: { id: 't', tur: 'taslar', ad, beyaz: '#f2e9d8', siyah: '#2a2420', parlaklik: 0.45 },
  eller: { id: 'e', tur: 'eller', ad, renk: '#d9a47e' },
};

describe('validateManifest', () => {
  test.each(Object.entries(valid))('geçerli %s teması kabul edilir', (_slot, json) => {
    const r = validateManifest(json, 'temalar/x/');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.theme.id).toBe(json.id);
      expect(r.theme.baseUrl).toBe('temalar/x/');
    }
  });

  test('model alanı isteğe bağlıdır ve korunur', () => {
    const r = validateManifest({ ...valid.masa, model: 'masa.glb' }, 'b/');
    expect(r.ok && r.theme.model).toBe('masa.glb');
  });

  test('eller: kolRengi isteğe bağlıdır, verilirse renk olmalıdır', () => {
    const ok = validateManifest({ ...valid.eller, kolRengi: '#223344' }, 'b/');
    expect(ok.ok && ok.theme.tur === 'eller' && ok.theme.kolRengi).toBe('#223344');
    const none = validateManifest(valid.eller, 'b/');
    expect(none.ok && none.theme.tur === 'eller' && none.theme.kolRengi).toBeUndefined();
    expect(validateManifest({ ...valid.eller, kolRengi: 'mavi' }, 'b/').ok).toBe(false);
  });

  test('tur eksikse reddedilir', () => {
    const { tur: _tur, ...rest } = valid.masa;
    expect(validateManifest(rest, 'b/').ok).toBe(false);
  });

  test('bilinmeyen tur reddedilir', () => {
    expect(validateManifest({ ...valid.masa, tur: 'sandalye' }, 'b/').ok).toBe(false);
  });

  test('renk #rrggbb biçiminde değilse reddedilir', () => {
    const r = validateManifest({ ...valid.masa, acikKare: 'kirmizi' }, 'b/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('acikKare');
  });

  test('ad.en eksikse reddedilir', () => {
    expect(validateManifest({ ...valid.eller, ad: { tr: 'Ad' } }, 'b/').ok).toBe(false);
  });

  test('id boşsa veya güvensiz karakter içeriyorsa reddedilir', () => {
    expect(validateManifest({ ...valid.eller, id: '' }, 'b/').ok).toBe(false);
    expect(validateManifest({ ...valid.eller, id: '../x' }, 'b/').ok).toBe(false);
  });

  test('aralık dışı sayı reddedilir', () => {
    expect(validateManifest({ ...valid.taslar, parlaklik: 3 }, 'b/').ok).toBe(false);
    expect(validateManifest({ ...valid.ortam, isikSiddeti: -1 }, 'b/').ok).toBe(false);
    expect(validateManifest({ ...valid.ortam, isikSiddeti: 'çok' }, 'b/').ok).toBe(false);
  });

  test('nesne olmayan girdi reddedilir', () => {
    expect(validateManifest(null, 'b/').ok).toBe(false);
    expect(validateManifest('masa', 'b/').ok).toBe(false);
    expect(validateManifest([], 'b/').ok).toBe(false);
  });
});
