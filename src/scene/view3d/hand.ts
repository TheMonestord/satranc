import * as THREE from 'three';
import type { EllerTheme } from '../../themes/types';

export interface Hand {
  /** Kökün başlangıç noktası parmakların taşı kavradığı noktadır; el -z yönüne uzanır. */
  root: THREE.Group;
  /** 0 açık, 1 kapalı */
  setGrip(amount: number): void;
}

const DEFAULT_SLEEVE = '#2a3147';
const SCALE = 1.3;
/** Kol sağdan ve yukarıdan gelir; böylece oyuncunun bakış açısından taşı kapatmaz. */
const YAW = 0.95;
const TILT = -0.35;

const FINGER_X = [-0.2, -0.07, 0.06, 0.19];
const FINGER_LEN: Array<[number, number]> = [
  [0.25, 0.2],
  [0.28, 0.22],
  [0.27, 0.21],
  [0.22, 0.17],
];

/** Kodla üretilen sade el: avuç, dört parmak, başparmak, bilek ve giysili ön kol. */
export function buildHand(eller: EllerTheme): Hand {
  const root = new THREE.Group();
  root.name = 'el';
  const skin = new THREE.MeshStandardMaterial({ color: eller.renk, roughness: 0.65, metalness: 0 });
  const cloth = new THREE.MeshStandardMaterial({
    color: eller.kolRengi ?? DEFAULT_SLEEVE,
    roughness: 0.9,
    metalness: 0,
  });
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material = skin) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };

  const turn = new THREE.Group();
  turn.rotation.y = YAW;
  turn.scale.setScalar(SCALE);
  root.add(turn);

  // Avuç, kavrama noktasının arkasında ve yukarısında durur; parmaklar taşın üstünden öne uzanır.
  const arm = new THREE.Group();
  arm.position.set(0, 0.289, 0.214);
  arm.rotation.x = TILT;
  turn.add(arm);

  const palm = mesh(new THREE.BoxGeometry(0.54, 0.15, 0.5));
  arm.add(palm);
  const knuckles = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.54, 12));
  knuckles.rotation.z = Math.PI / 2;
  knuckles.position.z = -0.25;
  arm.add(knuckles);

  const wrist = mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.8, 16));
  wrist.rotation.x = Math.PI / 2;
  wrist.position.z = 0.62;
  arm.add(wrist);
  const cuff = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 20), cloth);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = 1.0;
  arm.add(cuff);
  const sleeve = mesh(new THREE.CylinderGeometry(0.18, 0.27, 5, 20), cloth);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = 1.05 + 2.5;
  arm.add(sleeve);

  const pivots: Array<{ a: THREE.Group; b: THREE.Group }> = [];
  FINGER_X.forEach((x, i) => {
    const [l1, l2] = FINGER_LEN[i];
    const a = new THREE.Group();
    a.position.set(x, 0, -0.26);
    const seg1 = mesh(new THREE.CapsuleGeometry(0.055, l1, 4, 10));
    seg1.rotation.x = Math.PI / 2;
    seg1.position.z = -l1 / 2;
    const b = new THREE.Group();
    b.position.z = -l1;
    const seg2 = mesh(new THREE.CapsuleGeometry(0.05, l2, 4, 10));
    seg2.rotation.x = Math.PI / 2;
    seg2.position.z = -l2 / 2;
    b.add(seg2);
    a.add(seg1, b);
    arm.add(a);
    pivots.push({ a, b });
  });

  const thumb = new THREE.Group();
  thumb.position.set(-0.29, -0.04, 0.02);
  const thumbSeg = mesh(new THREE.CapsuleGeometry(0.06, 0.28, 4, 10));
  thumbSeg.rotation.x = Math.PI / 2;
  thumbSeg.position.z = -0.14;
  thumb.add(thumbSeg);
  arm.add(thumb);

  const setGrip = (amount: number) => {
    const g = THREE.MathUtils.clamp(amount, 0, 1);
    for (const { a, b } of pivots) {
      // Negatif x dönüşü parmağı aşağı kıvırır.
      a.rotation.x = -(0.25 + 0.35 * g);
      b.rotation.x = -(0.2 + 0.6 * g);
    }
    thumb.rotation.set(-(0.55 + 0.25 * g), -(0.1 + 0.5 * g), 0);
  };
  setGrip(0);

  return { root, setGrip };
}
