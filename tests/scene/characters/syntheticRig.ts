import * as THREE from 'three';
import type { GltfLike } from '../../../src/scene/view3d/characters/gltfRig';

/*
 * Testler için küçük, Mixamo adlarıyla kurulmuş, kemikli bir model: gerçek GLB olmadan
 * karakter kodunun bütün yollarını çalıştırır. Birimler santimetre; kök düğüm 0,01 ölçekle metreye çevirir.
 */

const P = 'mixamorig';

function bone(name: string, x: number, y: number, z: number, parent?: THREE.Bone, q?: THREE.Quaternion): THREE.Bone {
  const b = new THREE.Bone();
  b.name = P + name;
  b.position.set(x, y, z);
  if (q) b.quaternion.copy(q);
  parent?.add(b);
  return b;
}

const rotZ = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(deg));
const rotX = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(deg));

const CLIPS = [
  'bekleme-1',
  'bekleme-2',
  'bekleme-3',
  'oturus',
  'dusunme-1',
  'dusunme-2',
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

export function syntheticGltf(): GltfLike {
  const root = new THREE.Object3D();
  root.name = 'karakter';
  root.scale.setScalar(0.01);
  const hips = bone('Hips', 0, 50, 0);
  root.add(hips);
  const spine = bone('Spine', 0, 8, 0, hips);
  const spine1 = bone('Spine1', 0, 10, 0, spine);
  const spine2 = bone('Spine2', 0, 10, 0, spine1);
  const neck = bone('Neck', 0, 15, 0, spine2);
  const head = bone('Head', 0, 8, 2, neck);
  bone('HeadTop_End', 0, 20, 0, head);
  const bones: THREE.Bone[] = [hips, spine, spine1, spine2, neck, head];
  for (const side of ['Right', 'Left'] as const) {
    const s = side === 'Right' ? 1 : -1;
    // Sağ kol modelin -x yönüne uzanır (model +z'ye bakar).
    const sh = bone(`${side}Shoulder`, -4 * s, 12, 0, spine2, rotZ(90 * s));
    const arm = bone(`${side}Arm`, 0, 10, 0, sh);
    const fore = bone(`${side}ForeArm`, 0, 25, 0, arm);
    const hand = bone(`${side}Hand`, 0, 25, 0, fore);
    bones.push(sh, arm, fore, hand);
    const fingers: Array<[string, number, number, number]> = [
      ['Thumb', 3 * s, 4, 2],
      ['Index', 3 * s, 12, 0.5],
      ['Middle', 0, 12, 0],
      ['Ring', -2 * s, 11, 0],
      ['Pinky', -4 * s, 10, 0],
    ];
    for (const [f, x, y, z] of fingers) {
      let parent = bone(`${side}Hand${f}1`, x, y, z, hand);
      bones.push(parent);
      for (let i = 2; i <= 4; i++) {
        parent = bone(`${side}Hand${f}${i}`, 0, 3 - i * 0.3, 0, parent);
        bones.push(parent);
      }
    }
  }
  for (const side of ['Left', 'Right']) {
    const s = side === 'Right' ? -1 : 1;
    const up = bone(`${side}UpLeg`, 9 * s, -4, 0, hips, rotX(-90));
    const leg = bone(`${side}Leg`, 0, 40, 0, up, rotX(90));
    bones.push(up, leg, bone(`${side}Foot`, 0, 40, 0, leg));
  }

  // İki kutu: gövde (omurgaya bağlı) ve sağ ön kol (ön kola bağlı)
  const skeleton = new THREE.Skeleton(bones);
  const mkMesh = (name: string, boneName: string, size: [number, number, number], at: THREE.Vector3) => {
    const geo = new THREE.BoxGeometry(...size);
    geo.translate(at.x, at.y, at.z);
    const n = geo.attributes.position.count;
    const bi = bones.findIndex((b) => b.name === P + boneName);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? bi : 0)), 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ name }));
    mesh.name = name;
    return mesh;
  };
  const body = mkMesh('Govde', 'Spine2', [30, 40, 20], new THREE.Vector3(0, 80, 0));
  const forearm = mkMesh('Kol', 'RightForeArm', [6, 25, 6], new THREE.Vector3(-60, 120, 0));
  const group = new THREE.Group();
  group.add(root, body, forearm);
  root.updateMatrixWorld(true);
  body.bind(skeleton);
  forearm.bind(skeleton);

  const clips = CLIPS.map((name, k) => {
    const tracks: THREE.KeyframeTrack[] = [];
    if (name !== 'sasirma') tracks.push(new THREE.VectorKeyframeTrack(`${P}Hips.position`, [0, 1], [0, 50, 0, 0, 51, 0]));
    const a = rotX(10 + k).toArray();
    const b = rotX(-5).toArray();
    tracks.push(new THREE.QuaternionKeyframeTrack(`${P}Spine1.quaternion`, [0, 1, 2], [...a, ...b, ...a]));
    // Dirsek bükük: menteşe ölçümü için
    for (const side of ['Right', 'Left']) {
      const bend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, side === 'Right' ? -1 : 1), 0.9).toArray();
      tracks.push(new THREE.QuaternionKeyframeTrack(`${P}${side}ForeArm.quaternion`, [0, 2], [...bend, ...bend]));
    }
    if (name === 'yumruk') {
      for (const f of ['Index', 'Middle']) {
        for (let i = 1; i <= 3; i++) {
          const q = rotX(70).toArray();
          tracks.push(new THREE.QuaternionKeyframeTrack(`${P}RightHand${f}${i}.quaternion`, [0, 1], [...q, ...q]));
        }
      }
    }
    return new THREE.AnimationClip(name, name === 'konusma' ? 44 : 2 + (k % 3), tracks);
  });
  return { scene: group, animations: clips };
}
