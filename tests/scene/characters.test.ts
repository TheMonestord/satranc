import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { solveTwoBone, handBasis, pitchedForward, IKArm } from '../../src/scene/view3d/characters/rig';
import {
  CHARACTERS,
  DEFAULT_CHARACTER_ID,
  createCharacter,
  createPlayerArm,
  placeOpponent,
  placePlayerArm,
  OPPONENT_ROOT,
  type CharacterEvent,
} from '../../src/scene/view3d/characters';
import type { Character } from '../../src/scene/view3d/characters/types';
import { squareToWorld } from '../../src/scene/view3d/table';
import type { EllerTheme } from '../../src/themes/types';

const eller: EllerTheme = { id: 'sade', tur: 'eller', ad: { tr: 'a', en: 'b' }, baseUrl: '', renk: '#d9a47e' };
const EVENTS: CharacterEvent[] = [
  'think-start',
  'think-end',
  'lost-piece',
  'took-piece',
  'gave-check',
  'in-check',
  'won',
  'lost',
  'draw',
];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Ağaçtaki bütün nesnelerin dünya matrislerinde NaN/sonsuz var mı? */
function finiteTree(...roots: THREE.Object3D[]): boolean {
  let ok = true;
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      if (!o.matrixWorld.elements.every(Number.isFinite)) ok = false;
    });
  }
  return ok;
}

function staged(c: Character): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(c.root, c.hand.root);
  return scene;
}

describe('solveTwoBone', () => {
  const S = v(0, 5, 0);
  const elbow = new THREE.Vector3();
  const wrist = new THREE.Vector3();

  test('ulaşılabilen hedefte bilek tam hedefte, kemik boyları korunur', () => {
    const targets = [v(3, 1, 6), v(-4, 0, 5), v(0, 2, 9.9), v(1, 4, 1.2), v(6, 5, 0)];
    for (const t of targets) {
      const r = solveTwoBone(S, t, 5.5, 5, v(1, -1, 0), elbow, wrist);
      expect(r.clamped).toBe(false);
      expect(wrist.distanceTo(t)).toBeLessThan(1e-3);
      expect(elbow.distanceTo(S)).toBeCloseTo(5.5, 3);
      expect(elbow.distanceTo(wrist)).toBeCloseTo(5, 3);
    }
  });

  test('ulaşılamayan hedefte kol hedefe doğru dümdüz uzanır', () => {
    const t = v(20, -3, 14);
    const r = solveTwoBone(S, t, 5.5, 5, v(0, -1, 0), elbow, wrist);
    expect(r.clamped).toBe(true);
    expect(r.reach).toBeGreaterThan(1);
    const dir = t.clone().sub(S).normalize();
    expect(wrist.distanceTo(S.clone().addScaledVector(dir, 10.5))).toBeLessThan(1e-6);
    expect(elbow.distanceTo(S.clone().addScaledVector(dir, 5.5))).toBeLessThan(1e-6);
  });

  test('dirsek ipucu tarafına bükülür', () => {
    for (const pole of [v(1, 0, 0), v(-1, -1, 0), v(0, 1, 1)]) {
      const t = v(0, 0, 6);
      solveTwoBone(S, t, 5.5, 5, pole, elbow, wrist);
      const axis = t.clone().sub(S).normalize();
      const perp = pole.clone().addScaledVector(axis, -pole.dot(axis));
      expect(elbow.clone().sub(S).dot(perp)).toBeGreaterThan(0);
    }
  });

  test('uç durumlarda NaN üretmez', () => {
    const cases: Array<[THREE.Vector3, THREE.Vector3]> = [
      [S.clone(), v(1, 0, 0)], // hedef omuzda
      [v(0, 5, 0.0001), v(0, 0, 0)], // sıfır ipucu
      [v(0, 0, 8), v(0, -5, 8)], // ipucu kemik ekseninde
      [v(0, 5, 0.3), v(1, 0, 0)], // kolun katlanabileceğinden yakın
      [v(Number.NaN, 0, 0), v(1, 0, 0)],
    ];
    for (const [t, pole] of cases) {
      solveTwoBone(S, t, 5.5, 5, pole, elbow, wrist);
      if (Number.isFinite(t.x)) {
        expect([elbow.x, elbow.y, elbow.z, wrist.x, wrist.y, wrist.z].every(Number.isFinite)).toBe(true);
      }
    }
  });

  test('IKArm kemikleri omuz → dirsek → bilek boyunca yerleştirir', () => {
    const arm = new IKArm({
      upperLength: 5.5,
      lowerLength: 5,
      upperRadius: [1, 0.8],
      lowerRadius: [0.8, 0.6],
      sleeve: new THREE.MeshBasicMaterial(),
    });
    const t = v(2, 0, 7);
    arm.solve(S, t, v(1, -1, 0));
    arm.group.updateMatrixWorld(true);
    const tipUpper = arm.upper.localToWorld(v(0, 5.5, 0));
    const tipLower = arm.lower.localToWorld(v(0, 5, 0));
    expect(tipUpper.distanceTo(arm.elbow)).toBeLessThan(1e-4);
    expect(tipLower.distanceTo(t)).toBeLessThan(1e-4);
    arm.dispose();
  });

  test('handBasis parmakları istenen yöne çevirir', () => {
    const fwd = pitchedForward(v(1, 0, 1), 0.5, new THREE.Vector3());
    const q = handBasis(fwd, v(0, 1, 0), 0, new THREE.Quaternion());
    expect(v(0, 0, -1).applyQuaternion(q).distanceTo(fwd)).toBeLessThan(1e-6);
  });
});

describe('karakter kaydı', () => {
  test('her kaydın adı, açıklaması ve kurucusu var', () => {
    expect(CHARACTERS.length).toBeGreaterThan(0);
    for (const c of CHARACTERS) {
      expect(c.ad.tr && c.ad.en && c.aciklama.tr && c.aciklama.en).toBeTruthy();
      expect(c.onerilenSeviye).toBeGreaterThan(0);
      const ch = createCharacter(c.id);
      expect(ch.id).toBe(c.id);
      ch.dispose();
    }
  });

  test('bilinmeyen kimlik varsayılan rakibi verir', () => {
    const ch = createCharacter('yok-boyle-biri');
    expect(ch.id).toBe(DEFAULT_CHARACTER_ID);
    ch.dispose();
  });
});

describe.each(['deneyci', 'oyuncu'])('%s', (id) => {
  const make = (): Character => (id === 'oyuncu' ? createPlayerArm(eller) : createCharacter(id));

  test('WebGL olmadan kurulur ve sahneye eklenmeden güncellenebilir', () => {
    const c = make();
    expect(() => c.update(0.016, 16)).not.toThrow();
    expect(finiteTree(c.root, c.hand.root)).toBe(true);
    c.dispose();
  });

  test('farklı dt değerleriyle güncellemede NaN oluşmaz', () => {
    const c = make();
    staged(c);
    if (id !== 'oyuncu') placeOpponent(c);
    c.hand.root.position.copy(c.restPoint());
    const dts = [0, 1e-6, 0.004, 0.016, 0.033, 0.1, 0.5, 3, -1, Number.NaN, Number.POSITIVE_INFINITY];
    let now = 0;
    for (let i = 0; i < 400; i++) {
      const dt = dts[i % dts.length];
      now += 16;
      if (i === 50) c.lookAt(v(2, 1, 3));
      if (i === 120) c.lookAt(v(Number.NaN, 0, 0));
      if (i === 150) c.lookAt(null);
      c.update(dt, now);
    }
    expect(finiteTree(c.root, c.hand.root)).toBe(true);
    c.dispose();
  });

  test('bütün tepkiler çalışır ve süresi dolunca söner', () => {
    const c = make();
    staged(c);
    if (id !== 'oyuncu') placeOpponent(c);
    for (const ev of EVENTS) {
      c.react(ev);
      for (let i = 0; i < 30; i++) c.update(1 / 30, i * 33);
      expect(finiteTree(c.root, c.hand.root)).toBe(true);
    }
    c.react('think-end');
    for (let i = 0; i < 400; i++) c.update(1 / 30, i * 33);
    expect(finiteTree(c.root, c.hand.root)).toBe(true);
    c.dispose();
  });

  test('hamle sırasında el, animasyonun koyduğu noktada kalır; kavrama noktası hedefte', () => {
    const c = make();
    staged(c);
    if (id !== 'oyuncu') placeOpponent(c);
    c.setHandBusy(true);
    const targets = ['a1', 'h1', 'a8', 'h8', 'd4', 'e5'].map((sq) => squareToWorld(sq).setY(1.2));
    // Alınan taşların bırakıldığı yerler
    targets.push(v(6, 0.9, -2.5), v(-6, 0.9, 2.5));
    for (const t of targets) {
      for (let i = 0; i < 20; i++) {
        c.hand.root.position.copy(t);
        c.update(1 / 60, i * 16);
      }
      const g = c.hand.root.getWorldPosition(new THREE.Vector3());
      expect(g.distanceTo(t)).toBeLessThan(1e-3);
    }
    // Tepki sırasında da sağ el animasyona bırakılır.
    c.react('won');
    const t = squareToWorld('c3').setY(1);
    for (let i = 0; i < 60; i++) {
      c.hand.root.position.copy(t);
      c.update(1 / 60, i * 16);
    }
    expect(c.hand.root.position.distanceTo(t)).toBeLessThan(1e-3);
    c.setHandBusy(false);
    c.dispose();
  });

  test('dinlenmede el dinlenme noktasına yerleşir', () => {
    const c = make();
    staged(c);
    if (id !== 'oyuncu') placeOpponent(c);
    for (let i = 0; i < 120; i++) c.update(1 / 60, i * 16);
    expect(c.hand.root.position.distanceTo(c.restPoint())).toBeLessThan(0.3);
    c.dispose();
  });

  test('dispose bütün geometri ve malzemeleri atar ve sahneden çıkar', () => {
    const c = make();
    const scene = staged(c);
    const disposed = new Set<unknown>();
    const items = new Set<{ dispose(): void; addEventListener(t: string, f: () => void): void }>();
    for (const r of [c.root, c.hand.root]) {
      r.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        items.add(m.geometry);
        items.add(m.material as THREE.Material);
      });
    }
    for (const it of items) it.addEventListener('dispose', () => disposed.add(it));
    c.dispose();
    expect(disposed.size).toBe(items.size);
    expect(scene.children.length).toBe(0);
  });
});

describe('yerleşim', () => {
  test('rakip tahtaya bakar; önerilen yer masanın dışında', () => {
    const c = createCharacter('deneyci');
    staged(c);
    placeOpponent(c);
    expect(c.root.position.z).toBe(OPPONENT_ROOT.position.z);
    const rest = c.restPoint();
    // Dinlenme noktası rakibin tarafında, tahtanın yanında.
    expect(rest.z).toBeLessThan(0);
    expect(Math.abs(rest.x)).toBeGreaterThan(4.45);
    c.dispose();
  });

  test('oyuncu kolu kameraya göre yeniden yerleştirilebilir; görünüm çevrilince dinlenme noktası da döner', () => {
    const arm = createPlayerArm(eller);
    staged(arm);
    const r0 = arm.restPoint();
    expect(r0.x).toBeGreaterThan(0);
    expect(r0.z).toBeGreaterThan(4.45);
    placePlayerArm(arm, v(0, 10, 14), v(0, 0, 0), 45);
    expect(arm.shoulder.z).toBeGreaterThan(13);
    arm.root.rotation.y = Math.PI;
    const r1 = arm.restPoint();
    expect(r1.z).toBeLessThan(0);
    arm.dispose();
  });
});
