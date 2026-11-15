// @vitest-environment node
// Varlık hattının (scripts/assets) ürettiği GLB dosyalarını WebGL olmadan, glTF JSON bölümünü
// doğrudan okuyarak denetler.
import { describe, expect, test } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateManifest } from '../../src/themes/validate';

interface Gltf {
  nodes: Array<{ name?: string; mesh?: number; skin?: number; children?: number[] }>;
  meshes: Array<{ name?: string; primitives: Array<{ attributes: Record<string, number>; indices?: number; material?: number }> }>;
  skins?: Array<{ joints: number[]; inverseBindMatrices?: number }>;
  animations?: Array<{ name: string; channels: Array<{ target: { node: number; path: string } }>; samplers: unknown[] }>;
  images?: Array<{ bufferView?: number; uri?: string; mimeType?: string }>;
  materials?: Array<{ name?: string; pbrMetallicRoughness?: { baseColorTexture?: unknown; baseColorFactor?: number[] }; extensions?: Record<string, unknown> }>;
  accessors: Array<{ count: number }>;
}

const PUBLIC = join(process.cwd(), 'public');

/** GLB başlığını ve ilk (JSON) bölümünü okur. */
function glbOku(dosya: string): Gltf {
  const b = readFileSync(dosya);
  expect(b.readUInt32LE(0), 'glTF imzası').toBe(0x46546c67);
  expect(b.readUInt32LE(4), 'glTF sürümü').toBe(2);
  const uzunluk = b.readUInt32LE(12);
  expect(b.readUInt32LE(16), 'ilk bölüm JSON').toBe(0x4e4f534a);
  return JSON.parse(b.subarray(20, 20 + uzunluk).toString('utf8')) as Gltf;
}

const KLIPLER = [
  'bekleme-1',
  'bekleme-2',
  'bekleme-3',
  'oturus',
  'dusunme-1',
  'dusunme-2',
  'oturma-1',
  'oturma-2',
  'alkis-1',
  'alkis-2',
  'begeni',
  'sevinc',
  'onaylamama',
  'kizgin',
  'yumruk',
  'konusma',
  'sasirma',
];

describe.each(['ty', 'patron', 'sovalye'])('karakter: %s', (id) => {
  const dosya = join(PUBLIC, 'karakterler', id, 'karakter.glb');
  const gltf = glbOku(dosya);
  const adlar = gltf.nodes.map((n) => n.name ?? '');

  test('dosya 8 MB sınırının altında', () => {
    expect(statSync(dosya).size).toBeLessThan(8 * 1024 * 1024);
  });

  test('deri (skin) ve deri bağlı örgüler var', () => {
    expect(gltf.skins?.length ?? 0).toBeGreaterThan(0);
    expect(gltf.nodes.some((n) => n.skin !== undefined && n.mesh !== undefined)).toBe(true);
    for (const skin of gltf.skins!) {
      expect(skin.inverseBindMatrices).toBeDefined();
      for (const j of skin.joints) expect(gltf.nodes[j]).toBeDefined();
    }
  });

  test('kemik adları tekil ve Mixamo iskeleti tam', () => {
    const kemikler = new Set(gltf.skins!.flatMap((s) => s.joints).map((j) => adlar[j]));
    for (const ad of kemikler) expect(adlar.filter((a) => a === ad).length, ad).toBe(1);
    for (const kemik of ['Hips', 'Spine', 'Neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftHand']) {
      expect(adlar.some((a) => new RegExp(`^mixamorig\\d*${kemik}$`).test(a)), kemik).toBe(true);
    }
  });

  test('parmak kemikleri var (işaret ve başparmak)', () => {
    expect(adlar.some((a) => /RightHandIndex1$/.test(a))).toBe(true);
    expect(adlar.some((a) => /RightHandThumb1$/.test(a))).toBe(true);
    expect(adlar.some((a) => /LeftHandIndex1$/.test(a))).toBe(true);
  });

  test('bütün klipler var ve izleri var olan düğümleri hedefliyor', () => {
    const klipler = (gltf.animations ?? []).map((a) => a.name);
    expect([...klipler].sort()).toEqual([...KLIPLER].sort());
    for (const a of gltf.animations!) {
      expect(a.channels.length, a.name).toBeGreaterThan(0);
      for (const c of a.channels) expect(adlar[c.target.node], a.name).toBeTruthy();
    }
  });

  test('oturma kliplerinde kalça konumu var, şaşırmada yalnızca gövde üstü', () => {
    const kalca = gltf.nodes.findIndex((n) => /Hips$/.test(n.name ?? ''));
    for (const a of gltf.animations!) {
      const konum = a.channels.some((c) => c.target.node === kalca && c.target.path === 'translation');
      expect(konum, a.name).toBe(a.name !== 'sasirma');
    }
    const sasirma = gltf.animations!.find((a) => a.name === 'sasirma')!;
    for (const c of sasirma.channels) expect(adlar[c.target.node]).not.toMatch(/Hips|UpLeg|Leg$|Foot|Toe/);
  });

  test('dokular gömülü', () => {
    expect(gltf.images?.length ?? 0).toBeGreaterThan(0);
    for (const img of gltf.images!) {
      expect(img.uri).toBeUndefined();
      expect(img.bufferView).toBeDefined();
    }
    for (const m of gltf.materials!) expect(m.pbrMetallicRoughness?.baseColorTexture, m.name).toBeDefined();
  });
});

describe('taş teması: cizgi-film', () => {
  const klasor = join(PUBLIC, 'temalar', 'taslar', 'cizgi-film');
  const dosya = join(klasor, 'taslar.glb');
  const gltf = glbOku(dosya);
  const adlar = gltf.nodes.map((n) => n.name ?? '');

  test('12 adlandırılmış taş düğümü var', () => {
    for (const tur of ['piyon', 'kale', 'at', 'fil', 'vezir', 'sah']) {
      for (const renk of ['beyaz', 'siyah']) {
        expect(adlar.filter((a) => a === `${tur}-${renk}`).length, `${tur}-${renk}`).toBe(1);
      }
    }
  });

  test('taşlar inceltilmiş ve dış hat kabukları yok', () => {
    for (const n of gltf.nodes) {
      if (n.mesh === undefined) continue;
      expect(n.name).not.toMatch(/outline/i);
      const ucgen = gltf.meshes[n.mesh].primitives.reduce((s, p) => s + gltf.accessors[p.indices!].count / 3, 0);
      expect(ucgen, n.name).toBeLessThanOrEqual(3500);
    }
    for (const m of gltf.materials ?? []) expect(m.extensions?.KHR_materials_unlit, m.name).toBeUndefined();
    expect(statSync(dosya).size).toBeLessThan(2 * 1024 * 1024);
  });

  test('tema.json geçerli, modeli gösteriyor ve dizinde kayıtlı', () => {
    const tema = JSON.parse(readFileSync(join(klasor, 'tema.json'), 'utf8'));
    const sonuc = validateManifest(tema, 'temalar/taslar/cizgi-film/');
    expect(sonuc.ok).toBe(true);
    expect(tema.model).toBe('taslar.glb');
    const dizin = JSON.parse(readFileSync(join(PUBLIC, 'temalar', 'index.json'), 'utf8'));
    expect(dizin.temalar).toContain('taslar/cizgi-film');
  });
});
