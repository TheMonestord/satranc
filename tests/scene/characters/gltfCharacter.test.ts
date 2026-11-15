// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { solveTwoBone } from '../../../src/scene/view3d/characters/ik';
import { createGltfCharacter, gltfCacheSize, setGltfCacheGraceMs } from '../../../src/scene/view3d/characters/gltfCharacter';
import { createPlayerBody } from '../../../src/scene/view3d/characters/playerBody';
import { CHARACTERS, DEFAULT_CHARACTER_ID, GLTF_TUNING, characterInfo } from '../../../src/scene/view3d/characters';
import type { Character, CharacterEvent } from '../../../src/scene/view3d/characters/types';
import { loadCharacterGlb } from './glbFixture';
import { syntheticGltf } from './syntheticRig';

const EVENTS: CharacterEvent[] = ['think-start', 'lost-piece', 'took-piece', 'gave-check', 'in-check', 'won', 'lost', 'draw', 'think-end'];
const FILES = 'abcdefgh';
/** HandAnimator'ın kavrama yüksekliği: taş boyunun %82'si (piyon 0,9, şah 1,8) */
const GRIP_LOW = 0.9 * 0.82;
const GRIP_HIGH = 1.8 * 0.82;

function finite(...roots: THREE.Object3D[]): boolean {
  let ok = true;
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      if (!o.matrixWorld.elements.every(Number.isFinite)) ok = false;
    });
  }
  return ok;
}

function rig(c: Character): { gripWorld(out?: THREE.Vector3): THREE.Vector3 } {
  return (c as unknown as { rig: { gripWorld(out?: THREE.Vector3): THREE.Vector3 } }).rig;
}

/** Eli hedefte tutar, birkaç kare günceller ve kavrama noktasının hedefe uzaklığını döner. */
function holdError(c: Character, p: THREE.Vector3, frames = 14): number {
  c.setHandBusy(true);
  c.hand.root.position.copy(p);
  for (let i = 0; i < frames; i++) c.update(1 / 30, i);
  return rig(c).gripWorld().distanceTo(p);
}

function squares(): Array<[string, THREE.Vector3]> {
  const out: Array<[string, THREE.Vector3]> = [];
  for (let f = 0; f < 8; f++) {
    for (let r = 1; r <= 8; r++) {
      const y = (f + r) % 2 ? GRIP_LOW : GRIP_HIGH;
      out.push([`${FILES[f]}${r}`, new THREE.Vector3(f - 3.5, y, 4.5 - r)]);
    }
  }
  return out;
}

describe('solveTwoBone', () => {
  test('erişilebilir hedefe 1e-3 içinde ulaşır, kemik boyları korunur', () => {
    const rnd = mulberry(7);
    const a = new THREE.Vector3();
    for (let i = 0; i < 500; i++) {
      const l1 = 0.5 + rnd() * 6;
      const l2 = 0.5 + rnd() * 6;
      a.set(rnd() * 10 - 5, rnd() * 10 - 5, rnd() * 10 - 5);
      const dir = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const d = Math.abs(l1 - l2) + 0.01 + rnd() * (l1 + l2 - Math.abs(l1 - l2) - 0.02);
      const target = a.clone().addScaledVector(dir, d);
      const pole = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
      const res = solveTwoBone(a, l1, l2, target, pole);
      expect(res.reached).toBe(true);
      expect(res.end.distanceTo(target)).toBeLessThan(1e-3);
      expect(Math.abs(res.elbow.distanceTo(a) - l1)).toBeLessThan(1e-6);
      expect(Math.abs(res.elbow.distanceTo(res.end) - l2)).toBeLessThan(1e-6);
    }
  });

  test('uç durumlarda NaN üretmez', () => {
    const a = new THREE.Vector3(1, 2, 3);
    const cases: Array<[number, number, THREE.Vector3, THREE.Vector3]> = [
      [2, 3, a.clone(), new THREE.Vector3(0, -1, 0)], // hedef omuzda
      [2, 3, new THREE.Vector3(100, 0, 0), new THREE.Vector3(1, 0, 0)], // çok uzak, kutup hedef doğrultusunda
      [2, 2, new THREE.Vector3(1, 2, 3.001), new THREE.Vector3(0, 0, 0)], // sıfır kutup
      [NaN, 2, new THREE.Vector3(NaN, 0, 0), new THREE.Vector3(NaN, 1, 0)],
      [0, 0, new THREE.Vector3(5, 5, 5), new THREE.Vector3(0, 1, 0)],
    ];
    for (const [l1, l2, t, pole] of cases) {
      const r = solveTwoBone(a, l1, l2, t, pole);
      expect([...r.elbow.toArray(), ...r.end.toArray()].every(Number.isFinite)).toBe(true);
    }
    // Uzak hedefte kol gerilir ama hedef doğrultusunda kalır
    const far = solveTwoBone(new THREE.Vector3(), 2, 3, new THREE.Vector3(10, 0, 0), new THREE.Vector3(0, -1, 0));
    expect(far.reached).toBe(false);
    expect(far.end.x).toBeCloseTo(5, 4);
  });
});

describe('createGltfCharacter (yapay model)', () => {
  const make = () => {
    const c = createGltfCharacter({ id: 'deneme', gltf: syntheticGltf(), scale: 20, hips: { y: -3, z: -1 }, random: mulberry(3) });
    c.root.position.set(0, 0, -11.2);
    c.root.updateMatrixWorld(true);
    return c;
  };

  test('hemen kurulur, el kökü ve sandalye vardır, dinlenme noktası sonludur', () => {
    const c = make();
    expect(c.ready).toBe(true);
    expect(c.hand.root).toBeInstanceOf(THREE.Group);
    expect(c.root.getObjectByName('sandalye')).toBeTruthy();
    expect(c.restPoint().toArray().every(Number.isFinite)).toBe(true);
    c.dispose();
  });

  test('erişilebilir hedeflerde kavrama noktası hedefe 1e-3 içinde oturur', () => {
    const c = make();
    for (let i = 0; i < 30; i++) c.update(1 / 30, i);
    for (const p of [new THREE.Vector3(-2, 1, -8), new THREE.Vector3(0, 0.8, -5), new THREE.Vector3(-3.5, 1.5, -3.5), new THREE.Vector3(2, 0.74, -6)]) {
      expect(holdError(c, p)).toBeLessThan(1e-3);
    }
    expect(finite(c.root, c.hand.root)).toBe(true);
    c.dispose();
  });

  test('bütün tepkiler, düşünme ve sıradaki tepkiler hata vermeden oynar', () => {
    const c = make();
    for (const ev of EVENTS) {
      c.react(ev);
      for (let i = 0; i < 20; i++) c.update(0.05, i);
    }
    // Hamle sırasında gelen tepki bekler, hamleden sonra oynar
    c.setHandBusy(true);
    c.react('took-piece');
    for (let i = 0; i < 10; i++) c.update(0.05, i);
    c.setHandBusy(false);
    for (let i = 0; i < 60; i++) c.update(0.05, i);
    expect(finite(c.root, c.hand.root)).toBe(true);
    c.dispose();
  });

  test('tuhaf dt değerleri (0, eksi, NaN, sonsuz, çok büyük) NaN üretmez', () => {
    const c = make();
    c.react('won');
    for (const dt of [0, -1, NaN, Infinity, 1e9, 1e-9, 0.5]) c.update(dt, dt);
    c.setHandBusy(true);
    c.hand.root.position.set(NaN, 1, 2);
    c.update(0.016, 0);
    c.hand.root.position.set(1e6, -1e6, 1e6);
    c.update(0.016, 0);
    c.hand.setGrip(NaN);
    c.lookAt(new THREE.Vector3(NaN, 0, 0));
    c.update(0.016, 0);
    c.lookAt(new THREE.Vector3(0, 12.5, 11.5));
    c.update(0.016, 0);
    c.hand.root.position.set(0, 1, -2);
    c.update(0.016, 0);
    expect(finite(c.root)).toBe(true);
    expect(c.restPoint().toArray().every(Number.isFinite)).toBe(true);
    c.dispose();
  });

  test('dispose kökü ve eli sahneden çıkarır, geometri ve malzemeleri atar', () => {
    const g = syntheticGltf();
    const geoSpies: Array<ReturnType<typeof vi.spyOn>> = [];
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) geoSpies.push(vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material as THREE.Material, 'dispose'));
    });
    const c = createGltfCharacter({ id: 'deneme', gltf: g });
    const scene = new THREE.Scene();
    scene.add(c.root, c.hand.root);
    c.update(0.016, 0);
    c.dispose();
    expect(c.root.parent).toBeNull();
    expect(c.hand.root.parent).toBeNull();
    for (const s of geoSpies) expect(s).toHaveBeenCalled();
    expect(() => c.update(0.016, 0)).not.toThrow();
    expect(() => c.dispose()).not.toThrow();
  });

  test('kullanılmayan model kısa süre önbellekte kalır; yeniden kullanılırsa tekrar yüklenmez', async () => {
    setGltfCacheGraceMs(60_000);
    const source = syntheticGltf();
    const loader = vi.fn(async () => source);
    const url = 'test://bekleyen.glb';
    const a = createGltfCharacter({ id: 'a', url, loader });
    await vi.waitFor(() => expect(a.ready).toBe(true));
    a.dispose();
    const b = createGltfCharacter({ id: 'b', url, loader });
    await vi.waitFor(() => expect(b.ready).toBe(true));
    expect(loader).toHaveBeenCalledTimes(1);
    setGltfCacheGraceMs(0);
    b.dispose();
    await vi.waitFor(() => expect(gltfCacheSize()).toBe(0));
  });

  test('yükleyiciyle eşzamansız yüklenir; önbellek paylaşılır ve son kullanıcıyla atılır', async () => {
    setGltfCacheGraceMs(0);
    const source = syntheticGltf();
    const loader = vi.fn(async () => source);
    const url = 'test://ortak.glb';
    const a = createGltfCharacter({ id: 'a', url, loader });
    const b = createGltfCharacter({ id: 'b', url, loader });
    // Yüklenmeden önce de çalışır
    expect(a.ready).toBe(false);
    a.update(0.016, 0);
    expect(a.restPoint().toArray().every(Number.isFinite)).toBe(true);
    expect(a.hand.root.position.toArray().every(Number.isFinite)).toBe(true);
    await vi.waitFor(() => expect(a.ready && b.ready).toBe(true));
    expect(loader).toHaveBeenCalledTimes(1);
    expect(gltfCacheSize()).toBe(1);
    // Kopyalar ayrı kemik ağaçlarıdır
    const boneA = a.root.getObjectByName('mixamorigHips');
    const boneB = b.root.getObjectByName('mixamorigHips');
    expect(boneA && boneB && boneA !== boneB).toBe(true);
    const spy = vi.spyOn((source.scene.getObjectByName('Govde') as THREE.Mesh).geometry, 'dispose');
    a.dispose();
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
    b.dispose();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    await vi.waitFor(() => expect(gltfCacheSize()).toBe(0));
  });

  test('yükleme bitmeden atılırsa model eklenmez ve önbellek boşalır', async () => {
    setGltfCacheGraceMs(0);
    let resolve!: (g: ReturnType<typeof syntheticGltf>) => void;
    const loader = () => new Promise<ReturnType<typeof syntheticGltf>>((r) => (resolve = r));
    const c = createGltfCharacter({ id: 'c', url: 'test://gec.glb', loader });
    c.dispose();
    resolve(syntheticGltf());
    await new Promise((r) => setTimeout(r, 10));
    expect(c.ready).toBe(false);
    expect(gltfCacheSize()).toBe(0);
  });
});

describe('kayıt', () => {
  test('ty, patron, şövalye ve deneyci kayıtlı; varsayılan ty', () => {
    for (const id of ['ty', 'patron', 'sovalye', 'deneyci']) expect(characterInfo(id)).toBeTruthy();
    expect(DEFAULT_CHARACTER_ID).toBe('ty');
    expect(characterInfo('sovalye')!.ad.tr).toBe('Şövalye');
    expect(CHARACTERS.find((c) => c.id === 'ty')!.onerilenSeviye).toBeLessThan(CHARACTERS.find((c) => c.id === 'sovalye')!.onerilenSeviye);
  });
});

// ---------- Gerçek modeller ----------

describe.each(['ty', 'patron', 'sovalye'] as const)('gerçek model: %s', (id) => {
  test('64 karenin hepsine ve alınan taşların bırakıldığı yere uzanır; her iki tarafta', async () => {
    const gltf = await loadCharacterGlb(id);
    const { url: _url, ...tuning } = GLTF_TUNING[id];
    const c = createGltfCharacter({ id, ...tuning, gltf, random: mulberry(11) });
    for (const side of [-1, 1]) {
      c.root.position.set(0, 0, side * 11.2);
      c.root.rotation.set(0, side < 0 ? 0 : Math.PI, 0);
      c.root.updateMatrixWorld(true);
      c.setHandBusy(false);
      for (let i = 0; i < 20; i++) c.update(1 / 30, i);
      const rest = c.restPoint();
      // Dinlenme noktası masanın üstünde, karakterin kendi yanında
      expect(Math.sign(rest.z)).toBe(side);
      let worst = 0;
      for (const [, p] of squares()) worst = Math.max(worst, holdError(c, p, 10));
      // HandAnimator alınan taşı hamleyi yapanın soluna bırakır: (−side·6, 0.9, side·2.5); burada side rakibin tarafı
      const drop = new THREE.Vector3(-(side < 0 ? -1 : 1) * 6, 0.9, (side < 0 ? -1 : 1) * 2.5);
      worst = Math.max(worst, holdError(c, drop, 10));
      expect(worst).toBeLessThan(1e-3);
    }
    expect(finite(c.root, c.hand.root)).toBe(true);
    c.dispose();
  }, 60_000);

  test('baş masanın üstünde, eller ve omuzlar masa hizasının üstünde', async () => {
    const gltf = await loadCharacterGlb(id);
    const { url: _url, ...tuning } = GLTF_TUNING[id];
    const c = createGltfCharacter({ id, ...tuning, gltf });
    c.root.position.set(0, 0, -11.2);
    c.root.updateMatrixWorld(true);
    for (let i = 0; i < 30; i++) c.update(1 / 30, i);
    const head = c.root.getObjectByName('mixamorigHead')!.getWorldPosition(new THREE.Vector3());
    const shoulder = c.root.getObjectByName('mixamorigRightArm')!.getWorldPosition(new THREE.Vector3());
    expect(head.y).toBeGreaterThan(4.5);
    expect(shoulder.y).toBeGreaterThan(2.5);
    // Göğüs masanın kenarının (yarıçap 10,6) hemen arkasında
    expect(shoulder.z).toBeLessThan(-10);
    expect(shoulder.z).toBeGreaterThan(-13);
    c.dispose();
  }, 30_000);
});

describe('oyuncunun gövdesi (patron)', () => {
  test('64 kareye ve alınan taşların yerine uzanır; dinlenme noktası sonlu; tepkiler ve dispose', async () => {
    const gltf = await loadCharacterGlb('patron');
    const body = createPlayerBody('patron', { gltf });
    expect(body.ready).toBe(true);
    body.configure(new THREE.Vector3(0, 12.5, 11.5), new THREE.Vector3(0, 1.6, -3), 50, 16 / 9);
    for (let i = 0; i < 20; i++) body.update(1 / 30, i);
    expect(body.restPoint().toArray().every(Number.isFinite)).toBe(true);
    let worst = 0;
    for (const [, p] of squares()) worst = Math.max(worst, holdError(body, p, 10));
    worst = Math.max(worst, holdError(body, new THREE.Vector3(-6, 0.9, 2.5), 10));
    expect(worst).toBeLessThan(1e-3);
    body.setHandBusy(false);
    for (const ev of EVENTS) body.react(ev);
    for (const dt of [0, NaN, -1, 1e9, 0.016]) body.update(dt, 0);
    expect(finite(body.root, body.hand.root)).toBe(true);
    // Siyah oynarken kök döner; uzanma yine çalışır
    body.root.rotation.y = Math.PI;
    body.root.updateMatrixWorld(true);
    expect(holdError(body, new THREE.Vector3(-0.5, 0.74, -2.5), 12)).toBeLessThan(1e-3);
    const scene = new THREE.Scene();
    scene.add(body.root, body.hand.root);
    body.dispose();
    expect(body.root.parent).toBeNull();
    expect(body.hand.root.parent).toBeNull();
  }, 60_000);

  test('yalnızca sağ kol çizilir (gövde ve baş kameraya girmez)', () => {
    const body = createPlayerBody('patron', { gltf: syntheticGltf() });
    const govde = body.root.getObjectByName('Govde') as THREE.Mesh;
    const kol = body.root.getObjectByName('Kol') as THREE.Mesh;
    expect(govde.visible).toBe(false);
    expect(kol.visible).toBe(true);
    body.dispose();
  });
});

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
