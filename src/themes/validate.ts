import type { Theme, ThemeSlot } from './types';

type Result = { ok: true; theme: Theme } | { ok: false; error: string };

const COLOR = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;

const COLOR_FIELDS: Record<ThemeSlot, string[]> = {
  ortam: ['arkaPlan', 'zemin', 'isikRengi'],
  masa: ['acikKare', 'koyuKare', 'cerceve', 'masaRengi'],
  taslar: ['beyaz', 'siyah'],
  eller: ['renk'],
};

const NUMBER_FIELDS: Record<ThemeSlot, Array<[field: string, min: number, max: number]>> = {
  ortam: [['isikSiddeti', 0, 5]],
  masa: [],
  taslar: [['parlaklik', 0, 1]],
  eller: [],
};

/** Bir tema.json içeriğini denetler. Yalnızca bilinen alanlar temaya aktarılır. */
export function validateManifest(json: unknown, baseUrl: string): Result {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, error: 'tema.json bir nesne olmalı' };
  }
  const j = json as Record<string, unknown>;
  if (typeof j.id !== 'string' || !ID.test(j.id)) {
    return { ok: false, error: 'id: küçük harf, rakam ve tire içeren bir ad olmalı' };
  }
  const tur = j.tur;
  if (tur !== 'ortam' && tur !== 'masa' && tur !== 'taslar' && tur !== 'eller') {
    return { ok: false, error: 'tur: ortam, masa, taslar veya eller olmalı' };
  }
  const ad = j.ad as Record<string, unknown> | undefined;
  if (!ad || typeof ad !== 'object' || typeof ad.tr !== 'string' || typeof ad.en !== 'string' || !ad.tr || !ad.en) {
    return { ok: false, error: 'ad: tr ve en metinleri gerekli' };
  }
  const out: Record<string, unknown> = { id: j.id, tur, ad: { tr: ad.tr, en: ad.en }, baseUrl };
  for (const field of COLOR_FIELDS[tur]) {
    const v = j[field];
    if (typeof v !== 'string' || !COLOR.test(v)) {
      return { ok: false, error: `${field}: #rrggbb biçiminde bir renk olmalı` };
    }
    out[field] = v.toLowerCase();
  }
  for (const [field, min, max] of NUMBER_FIELDS[tur]) {
    const v = j[field];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      return { ok: false, error: `${field}: ${min} ile ${max} arasında bir sayı olmalı` };
    }
    out[field] = v;
  }
  if (j.model !== undefined) {
    if (typeof j.model !== 'string' || !/^[\w.-]+\.(glb|gltf)$/.test(j.model)) {
      return { ok: false, error: 'model: tema klasöründeki bir .glb veya .gltf dosyasının adı olmalı' };
    }
    out.model = j.model;
  }
  return { ok: true, theme: out as unknown as Theme };
}
