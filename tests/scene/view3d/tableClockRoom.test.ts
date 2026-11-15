import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { TableClock } from '../../../src/scene/view3d/tableClock';
import { FLOOR_Y, buildRoom } from '../../../src/scene/view3d/room';
import { buildEnvironment } from '../../../src/scene/view3d/environment';
import { validateManifest } from '../../../src/themes/validate';
import type { OrtamTheme } from '../../../src/themes/types';

const sorgu: OrtamTheme = {
  id: 'sorgu-odasi',
  tur: 'ortam',
  ad: { tr: 'Sorgu Odası', en: 'Interrogation Room' },
  baseUrl: '',
  arkaPlan: '#07080a',
  zemin: '#2a2b2c',
  isikRengi: '#ffd9a0',
  isikSiddeti: 2.4,
  oda: 'sorgu',
};

function noNaN(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    for (const v of o.matrixWorld.elements) expect(Number.isFinite(v)).toBe(true);
  });
}

describe('TableClock', () => {
  const minuteAngle = (clock: TableClock, side: 'near' | 'far') =>
    (clock as unknown as { dials: Record<string, { minute: THREE.Object3D }> }).dials[side].minute.rotation.z;
  const plungerY = (clock: TableClock, side: 'near' | 'far') =>
    (clock as unknown as { dials: Record<string, { plunger: THREE.Object3D }> }).dials[side].plunger.position.y;

  test('süresiz oyunda yelkovan 12de durur', () => {
    const c = new TableClock();
    c.setSnapshot(null);
    expect(minuteAngle(c, 'near')).toBeCloseTo(0, 5);
  });

  test('5 dakika kalan taraf 11:55i gösterir (yelkovan 55. dakikada)', () => {
    const c = new TableClock();
    c.setSnapshot({ w: 5 * 60_000, b: 10 * 60_000, running: 'w' });
    expect(minuteAngle(c, 'near')).toBeCloseTo(-(55 / 60) * Math.PI * 2, 5);
    expect(minuteAngle(c, 'far')).toBeCloseTo(-(50 / 60) * Math.PI * 2, 5);
  });

  test('çevrilince yakın kadran siyahın olur ve saat masanın öbür yanına geçer', () => {
    const c = new TableClock();
    const before = c.group.position.clone();
    c.setFlipped(true);
    c.setSnapshot({ w: 5 * 60_000, b: 10 * 60_000, running: 'w' });
    expect(minuteAngle(c, 'near')).toBeCloseTo(-(50 / 60) * Math.PI * 2, 5);
    expect(c.group.position.x).toBeCloseTo(-before.x, 5);
    expect(c.group.position.z).toBeCloseTo(-before.z, 5);
  });

  test('saati akmayan tarafın düğmesi basılı iner; hareket bitince update false döner', () => {
    const c = new TableClock();
    const up = plungerY(c, 'near');
    c.setSnapshot({ w: 60_000, b: 60_000, running: 'b' });
    let moving = true;
    for (let i = 0; i < 200 && moving; i++) moving = c.update(1 / 30);
    expect(moving).toBe(false);
    expect(plungerY(c, 'near')).toBeLessThan(up - 0.2);
    expect(plungerY(c, 'far')).toBeCloseTo(up, 3);
    noNaN(c.group);
    c.dispose();
  });
});

describe('Sorgu Odası', () => {
  test('oda kurulur, zemini y=FLOOR_Y, tick ile lamba sallanır ve titrer', () => {
    const room = buildRoom('sorgu', sorgu, 'medium');
    const tick = room.userData.tick as (now: number) => void;
    expect(typeof tick).toBe('function');
    for (let t = 0; t < 60_000; t += 137) tick(t);
    noNaN(room);
    const lamp = room.getObjectsByProperty('type', 'SpotLight')[0] as THREE.SpotLight;
    expect(lamp).toBeTruthy();
    expect(lamp.castShadow).toBe(true);
    const box = new THREE.Box3().setFromObject(room);
    expect(box.min.y).toBeCloseTo(FLOOR_Y, 1);
  });

  test('düşük kalitede lamba gölge düşürmez', () => {
    const room = buildRoom('sorgu', sorgu, 'low');
    const lamp = room.getObjectsByProperty('type', 'SpotLight')[0] as THREE.SpotLight;
    expect(lamp.castShadow).toBe(false);
  });

  test('ortam temasında oda varsa buildEnvironment odayı kurar', () => {
    const env = buildEnvironment(sorgu, 'low');
    expect(env.name).toBe('ortam');
    expect(typeof env.userData.tick).toBe('function');
    const open = buildEnvironment({ ...sorgu, oda: undefined }, 'low');
    expect(open.userData.tick).toBeUndefined();
  });

  test('tema denetimi oda alanını kabul eder, bilinmeyeni reddeder', () => {
    const json = { ...sorgu, baseUrl: undefined };
    const ok = validateManifest(json, 'x/');
    expect(ok.ok && ok.theme.tur === 'ortam' && ok.theme.oda).toBe('sorgu');
    const bad = validateManifest({ ...json, oda: 'mahzen' }, 'x/');
    expect(bad.ok).toBe(false);
  });
});
