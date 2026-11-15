import * as THREE from 'three';
import type { Hand } from '../hand';

/*
 * Karakter iskeleti için ortak parçalar:
 *  - `solveTwoBone`: WebGL gerektirmeyen, saf iki kemikli ters kinematik çözücü.
 *  - `IKArm`: omuz → dirsek → bilek kolu (üst kol ve ön kol örgüleri).
 *  - `buildArticulatedHand`: parmakları eklemli el/eldiven; kökü kavrama noktasıdır.
 *  - `handBasis`: elin yönünü (parmak yönü, avuç aşağı) bir dördeye çevirir.
 */

export interface TwoBoneResult {
  /** Omuz–hedef uzaklığının kol boyuna oranı (1 ve üstü: kol tam açık). */
  reach: number;
  /** Hedefe ulaşılamadı ve kol hedefe doğru düz uzatıldı. */
  clamped: boolean;
}

const EPS = 1e-6;
const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/**
 * İki kemikli ters kinematik.
 * `shoulder` ile `target` arasında `upper` ve `lower` boylu iki kemik; dirsek `pole` (ipucu yönü)
 * tarafına bükülür. Sonuç `outElbow` ve `outWrist`e yazılır. Ulaşılamayan hedefte kol hedefe doğru
 * dümdüz uzanır; çok yakın hedefte kol olabildiğince katlanır. Hiçbir durumda NaN üretmez.
 */
export function solveTwoBone(
  shoulder: THREE.Vector3,
  target: THREE.Vector3,
  upper: number,
  lower: number,
  pole: THREE.Vector3,
  outElbow: THREE.Vector3,
  outWrist: THREE.Vector3,
): TwoBoneResult {
  const total = upper + lower;
  _dir.subVectors(target, shoulder);
  let d = _dir.length();
  if (!Number.isFinite(d) || d < EPS) {
    // Hedef omzun üstünde: yön belirsiz, ipucunun tersine katla.
    _dir.copy(pole).lengthSq() > EPS ? _dir.copy(pole).negate().normalize() : _dir.set(0, -1, 0);
    d = 0;
  } else {
    _dir.divideScalar(d);
  }

  // İpucunun kemik eksenine dik bileşeni dirseğin yönüdür.
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_perp.lengthSq() < EPS) {
    _perp.crossVectors(_dir, Math.abs(_dir.y) < 0.9 ? _tmp.set(0, 1, 0) : _tmp.set(1, 0, 0));
  }
  _perp.normalize();

  const reach = total > 0 ? d / total : 1;
  if (d >= total) {
    outElbow.copy(shoulder).addScaledVector(_dir, upper);
    outWrist.copy(shoulder).addScaledVector(_dir, total);
    return { reach, clamped: d > total + 1e-9 };
  }
  const dEff = Math.max(d, Math.abs(upper - lower) + 1e-4);
  const cosA = THREE.MathUtils.clamp((upper * upper + dEff * dEff - lower * lower) / (2 * upper * dEff), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  outElbow
    .copy(shoulder)
    .addScaledVector(_dir, upper * cosA)
    .addScaledVector(_perp, upper * sinA);
  outWrist.copy(shoulder).addScaledVector(_dir, dEff);
  return { reach, clamped: false };
}

const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Elin yönü: parmaklar `forward` yönüne (elin yerel -z ekseni), elin üstü `up`a yakın.
 * `roll` parmak ekseni çevresinde ek dönüştür (pozitif: başparmak yukarı kalkar, sağ el için).
 */
export function handBasis(
  forward: THREE.Vector3,
  up: THREE.Vector3,
  roll: number,
  out: THREE.Quaternion,
): THREE.Quaternion {
  _bz.copy(forward).negate();
  if (_bz.lengthSq() < EPS) _bz.set(0, 0, 1);
  _bz.normalize();
  _bx.crossVectors(up, _bz);
  if (_bx.lengthSq() < EPS) _bx.crossVectors(_tmp.set(0, 0, 1), _bz);
  if (_bx.lengthSq() < EPS) _bx.set(1, 0, 0);
  _bx.normalize();
  _by.crossVectors(_bz, _bx).normalize();
  _m.makeBasis(_bx, _by, _bz);
  out.setFromRotationMatrix(_m);
  if (roll !== 0) out.multiply(_rollQ.setFromAxisAngle(_axisZ, roll));
  return out;
}
const _rollQ = new THREE.Quaternion();
const _axisZ = new THREE.Vector3(0, 0, 1);

/**
 * Yatay `heading` yönünü `pitch` radyan aşağı eğip parmak yönünü verir.
 * (pitch > 0: parmaklar aşağı bakar)
 */
export function pitchedForward(heading: THREE.Vector3, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  out.set(heading.x, 0, heading.z);
  if (out.lengthSq() < EPS) out.set(0, 0, -1);
  out.normalize().multiplyScalar(Math.cos(pitch));
  out.y = -Math.sin(pitch);
  return out;
}

/** Aynı ölçülü geometriyi bir kez üretip paylaşan önbellek. */
export class GeoCache {
  private map = new Map<string, THREE.BufferGeometry>();
  get<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.map.get(key);
    if (!g) {
      g = make();
      this.map.set(key, g);
    }
    return g as T;
  }
  /** Önbelleğe dışarıda üretilmiş bir geometri ekler (dispose için). */
  track<T extends THREE.BufferGeometry>(g: T): T {
    this.map.set(`__${this.map.size}_${g.uuid}`, g);
    return g;
  }
  dispose(): void {
    for (const g of this.map.values()) g.dispose();
    this.map.clear();
  }
}

/** Bir nesneyi `from` noktasına koyar ve yerel +y eksenini `to` yönüne çevirir; +z ekseni `side`a yakın tutulur. */
export function orientBone(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, side: THREE.Vector3): void {
  obj.position.copy(from);
  _by.subVectors(to, from);
  if (_by.lengthSq() < EPS) _by.set(0, 1, 0);
  _by.normalize();
  _bz.copy(side).addScaledVector(_by, -side.dot(_by));
  if (_bz.lengthSq() < EPS) _bz.crossVectors(_by, Math.abs(_by.x) < 0.9 ? _tmp.set(1, 0, 0) : _tmp.set(0, 1, 0));
  _bz.normalize();
  _bx.crossVectors(_by, _bz).normalize();
  _m.makeBasis(_bx, _by, _bz);
  obj.quaternion.setFromRotationMatrix(_m);
}

export interface ArmStyle {
  upperLength: number;
  lowerLength: number;
  /** [omuz ucu, dirsek ucu] */
  upperRadius: [number, number];
  /** [dirsek ucu, bilek ucu] */
  lowerRadius: [number, number];
  sleeve: THREE.Material;
  /** Dirsek küresinin malzemesi (verilmezse kol malzemesi). */
  joint?: THREE.Material;
  radialSegments?: number;
  /** Üst kolun omuzdan geriye taşan kısmı (birinci şahıs kolu için gövdeye uzanan kol). */
  upperBackExtension?: number;
}

/**
 * Omuz → dirsek → bilek kolu. Kemikler yerel +y boyunca uzanır.
 * Bütün hesaplar kolun `group`unun üst nesnesinin uzayındadır (genelde karakterin kökü).
 * Bant, manşet gibi süsler `upper` / `lower` gruplarına eklenebilir (`addBand`).
 */
export class IKArm {
  readonly group = new THREE.Group();
  readonly upper = new THREE.Group();
  readonly lower = new THREE.Group();
  readonly elbow = new THREE.Vector3();
  readonly wrist = new THREE.Vector3();
  readonly style: ArmStyle;
  lastResult: TwoBoneResult = { reach: 0, clamped: false };
  private geos = new GeoCache();
  private side = new THREE.Vector3();

  constructor(style: ArmStyle) {
    this.style = style;
    const seg = style.radialSegments ?? 14;
    const { upperLength: a, lowerLength: b } = style;
    const back = style.upperBackExtension ?? 0;
    const up = new THREE.Mesh(
      this.geos.track(
        new THREE.CylinderGeometry(style.upperRadius[1], style.upperRadius[0], a + back, seg, 1, true).translate(
          0,
          (a - back) / 2,
          0,
        ),
      ),
      style.sleeve,
    );
    const lo = new THREE.Mesh(
      this.geos.track(
        new THREE.CylinderGeometry(style.lowerRadius[1], style.lowerRadius[0], b, seg, 1, true).translate(0, b / 2, 0),
      ),
      style.sleeve,
    );
    const elbowBall = new THREE.Mesh(
      this.geos.track(new THREE.SphereGeometry(Math.max(style.upperRadius[1], style.lowerRadius[0]) * 1.04, seg, 10)),
      style.joint ?? style.sleeve,
    );
    elbowBall.position.y = a;
    for (const m of [up, lo, elbowBall]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.upper.add(up, elbowBall);
    this.lower.add(lo);
    this.upper.name = 'ust-kol';
    this.lower.name = 'on-kol';
    this.group.add(this.upper, this.lower);
  }

  /** Kemiğin bir noktasına (0 baş, 1 uç) halka biçimli bir bant ekler. */
  addBand(
    bone: 'upper' | 'lower',
    at: number,
    width: number,
    mat: THREE.Material,
    grow = 1.06,
    radiusOverride?: number,
  ): THREE.Mesh {
    const s = this.style;
    const len = bone === 'upper' ? s.upperLength : s.lowerLength;
    const [r0, r1] = bone === 'upper' ? s.upperRadius : s.lowerRadius;
    const r = radiusOverride ?? THREE.MathUtils.lerp(r0, r1, at) * grow;
    const seg = s.radialSegments ?? 14;
    const geo = this.geos.get(`band-${r.toFixed(3)}-${width.toFixed(3)}-${seg}`, () =>
      new THREE.CylinderGeometry(r, r, width, seg, 1, true),
    );
    const m = new THREE.Mesh(geo, mat);
    m.position.y = at * len;
    (bone === 'upper' ? this.upper : this.lower).add(m);
    return m;
  }

  /** Kendi geometrisi olan bir süs örgüsünü kemiğe ekler (geometri kol ile birlikte atılır). */
  attach(bone: 'upper' | 'lower', mesh: THREE.Mesh): void {
    this.geos.track(mesh.geometry);
    (bone === 'upper' ? this.upper : this.lower).add(mesh);
  }

  /** Omzu, bileği ve dirsek ipucunu alıp kemikleri yerleştirir. */
  solve(shoulder: THREE.Vector3, wristTarget: THREE.Vector3, pole: THREE.Vector3): TwoBoneResult {
    const s = this.style;
    this.lastResult = solveTwoBone(shoulder, wristTarget, s.upperLength, s.lowerLength, pole, this.elbow, this.wrist);
    // Kemiklerin dönüşü bükülme düzlemine göre sabitlenir: +z ekseni dirseğin dışına bakar.
    this.side.copy(pole);
    orientBone(this.upper, shoulder, this.elbow, this.side);
    orientBone(this.lower, this.elbow, this.wrist, this.side);
    return this.lastResult;
  }

  dispose(): void {
    this.geos.dispose();
  }
}

export interface FingerStyle {
  /** Parmak boğumlarının boyları [kök, orta, uç] */
  lengths: [number, number, number];
  radius: number;
  /** Avuç üzerindeki x konumu */
  x: number;
  /** Kapalıyken eklem açıları (radyan, pozitif = avuca doğru kıvrılma) */
  closed: [number, number, number];
  /** Yana açılma (y ekseni çevresinde) */
  splay: number;
}

export interface HandStyle {
  skin: THREE.Material;
  /** Avucun [genişlik, kalınlık, boy] ölçüleri */
  palm: [number, number, number];
  fingers: FingerStyle[];
  thumb: { lengths: [number, number]; radius: number };
  /** Sol el için true: el x ekseninde aynalanır. */
  mirror?: boolean;
  /** Bilek kısmı (eldiven ağzı ya da bilek); [yarıçap, boy] */
  wrist?: { radius: number; length: number; mat?: THREE.Material };
  radialSegments?: number;
  /** Avucun dinlenmede yukarı eğimi: el bilekten parmaklara doğru biraz aşağı iner. */
  palmTilt?: number;
}

export interface ArticulatedHand extends Hand {
  /** Bileğin, elin kökü (kavrama noktası) uzayındaki konumu. Kolun bileği buraya bağlanır. */
  readonly wristOffset: THREE.Vector3;
  /** Parmak boyunca tahmini el boyu (bilekten parmak ucuna). */
  readonly length: number;
  readonly grip: number;
  /** Tek bir parmağı ek olarak kaldırır (pozitif) ya da bükükleştirir (negatif); 0..3 işaret→serçe, 4 başparmak. */
  setFingerLift(index: number, amount: number): void;
  dispose(): void;
}

interface FingerRig {
  joints: THREE.Group[];
  closed: [number, number, number];
  open: [number, number, number];
  lift: number;
}

/**
 * Parmakları eklemli el. İç düzen: bilek orijinde, el -z yönüne uzanır, avuç aşağı (-y) bakar,
 * sağ elde başparmak -x tarafındadır. Kök, kapalı tutuşta başparmak ucu ile işaret/orta parmak
 * uçlarının ortasına (kavrama noktasına) taşınır.
 */
export function buildArticulatedHand(style: HandStyle, geos: GeoCache): ArticulatedHand {
  const root = new THREE.Group();
  root.name = 'el';
  const offset = new THREE.Group();
  const mirror = new THREE.Group();
  mirror.scale.x = style.mirror ? -1 : 1;
  root.add(offset);
  offset.add(mirror);
  const palmGroup = new THREE.Group();
  palmGroup.rotation.x = -(style.palmTilt ?? 0.18);
  mirror.add(palmGroup);

  const seg = style.radialSegments ?? 10;
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material = style.skin) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };
  const capsule = (r: number, len: number) =>
    geos.get(`cap-${r.toFixed(3)}-${len.toFixed(3)}-${seg}`, () =>
      new THREE.CapsuleGeometry(r, Math.max(0.01, len - r), 3, seg).rotateX(Math.PI / 2).translate(0, 0, -len / 2),
    );

  const [pw, ph, pl] = style.palm;
  // Avuç: hafif yuvarlatılmış bir kutu (ölçeklenmiş küre + kutu karışımı yerine yuvarlak kenarlı kapsül dizisi).
  const palmGeo = geos.get(`palm-${pw}-${ph}-${pl}`, () => {
    const g = new THREE.SphereGeometry(1, 14, 10);
    // Küreyi kutuya yaklaştır: köşeleri biraz doldur.
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 / Math.max(0.0001, Math.pow(Math.abs(x) ** 4 + Math.abs(y) ** 4 + Math.abs(z) ** 4, 0.25));
      const blend = 0.55;
      p.setXYZ(i, x * (1 - blend + blend * k), y * (1 - blend + blend * k), z * (1 - blend + blend * k));
    }
    g.computeVertexNormals();
    g.scale(pw / 2, ph / 2, pl / 2);
    return g;
  });
  const palm = mk(palmGeo);
  palm.position.set(0, 0, -pl / 2);
  palmGroup.add(palm);

  if (style.wrist) {
    const w = mk(
      geos.get(`wrist-${style.wrist.radius}-${style.wrist.length}`, () =>
        new THREE.CylinderGeometry(style.wrist!.radius * 0.92, style.wrist!.radius, style.wrist!.length, seg + 4)
          .rotateX(Math.PI / 2)
          .translate(0, 0, style.wrist!.length * 0.3),
      ),
      style.wrist.mat ?? style.skin,
    );
    w.position.y = 0;
    mirror.add(w);
    const ball = mk(
      geos.get(`wristball-${style.wrist.radius}`, () => new THREE.SphereGeometry(style.wrist!.radius, seg + 4, 8)),
      style.wrist.mat ?? style.skin,
    );
    ball.scale.set(1.0, 0.85, 1.0);
    mirror.add(ball);
  }

  const fingers: FingerRig[] = [];
  const tips: THREE.Object3D[] = [];
  style.fingers.forEach((f) => {
    const joints: THREE.Group[] = [];
    let parent: THREE.Object3D = palmGroup;
    f.lengths.forEach((len, j) => {
      const joint = new THREE.Group();
      if (j === 0) {
        joint.position.set(f.x, -ph * 0.08, -pl + f.radius * 0.4);
        joint.rotation.order = 'YXZ';
        joint.rotation.y = f.splay;
      } else {
        joint.position.z = -f.lengths[j - 1];
      }
      const r = f.radius * (1 - j * 0.07);
      joint.add(mk(capsule(r, len)));
      if (j > 0) {
        // Eklem yuvarlağı: büküldüğünde boğumu kapatır.
        joint.add(mk(geos.get(`knk-${r.toFixed(3)}`, () => new THREE.SphereGeometry(r * 1.02, seg, 6))));
      }
      parent.add(joint);
      joints.push(joint);
      parent = joint;
    });
    const tip = new THREE.Object3D();
    tip.position.z = -f.lengths[2] + f.radius * 0.35;
    tip.position.y = -f.radius * 0.5;
    parent.add(tip);
    tips.push(tip);
    // Açıkken parmaklar hafifçe kıvrık ve biraz yukarı kalkık durur.
    fingers.push({ joints, closed: f.closed, open: [-0.12, 0.12, 0.08], lift: 0 });
  });

  // Başparmak: avucun yan alt köşesinden çıkar, kapanınca işaret parmağının ucuna doğru döner.
  const t = style.thumb;
  const thumbBase = new THREE.Group();
  thumbBase.position.set(-pw * 0.42, -ph * 0.25, -pl * 0.28);
  thumbBase.rotation.order = 'YXZ';
  palmGroup.add(thumbBase);
  const thumbMeta = mk(capsule(t.radius * 1.15, pl * 0.42));
  thumbBase.add(thumbMeta);
  const thumbJ1 = new THREE.Group();
  thumbJ1.position.z = -pl * 0.42;
  thumbJ1.add(mk(capsule(t.radius, t.lengths[0])));
  thumbJ1.add(mk(geos.get(`knk-${t.radius.toFixed(3)}`, () => new THREE.SphereGeometry(t.radius * 1.02, seg, 6))));
  thumbBase.add(thumbJ1);
  const thumbJ2 = new THREE.Group();
  thumbJ2.position.z = -t.lengths[0];
  thumbJ2.add(mk(capsule(t.radius * 0.93, t.lengths[1])));
  thumbJ1.add(thumbJ2);
  const thumbTip = new THREE.Object3D();
  thumbTip.position.set(0, -t.radius * 0.3, -t.lengths[1] + t.radius * 0.3);
  thumbJ2.add(thumbTip);
  let thumbLift = 0;

  let grip = 0;
  const pose = (g: number) => {
    grip = g;
    for (const f of fingers) {
      f.joints.forEach((j, i) => {
        // Negatif x dönüşü parmağı avuca (aşağı) kıvırır.
        const a = THREE.MathUtils.lerp(f.open[i], f.closed[i], g) - (i === 0 ? f.lift : f.lift * 0.3);
        j.rotation.x = -a;
      });
    }
    // Başparmak: açıkken yana ve aşağı açık, kapalıyken içe ve öne.
    thumbBase.rotation.y = THREE.MathUtils.lerp(0.75, 0.2, g);
    thumbBase.rotation.x = -THREE.MathUtils.lerp(0.55, 0.75, g) + thumbLift;
    thumbBase.rotation.z = THREE.MathUtils.lerp(0.5, 0.9, g);
    thumbJ1.rotation.y = -THREE.MathUtils.lerp(0.05, 0.35, g);
    thumbJ1.rotation.x = -THREE.MathUtils.lerp(0.05, 0.25, g);
    thumbJ2.rotation.x = -THREE.MathUtils.lerp(0.05, 0.3, g);
  };

  // Kavrama noktasını kapalı pozda ölç ve kökü oraya taşı.
  pose(1);
  root.updateMatrixWorld(true);
  const tipPos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const thumbP = tipPos(thumbTip);
  const fingerP = tipPos(tips[0]).add(tipPos(tips[1] ?? tips[0])).multiplyScalar(0.5);
  const grip0 = thumbP.add(fingerP).multiplyScalar(0.5);
  offset.position.copy(grip0).negate();
  const wristOffset = offset.position.clone();
  const length = pl + style.fingers[1 % style.fingers.length].lengths.reduce((s, v) => s + v, 0);
  pose(0);

  const hand: ArticulatedHand = {
    root,
    wristOffset,
    length,
    get grip() {
      return grip;
    },
    setGrip(amount: number) {
      pose(THREE.MathUtils.clamp(Number.isFinite(amount) ? amount : 0, 0, 1));
    },
    setFingerLift(index: number, amount: number) {
      const a = Number.isFinite(amount) ? amount : 0;
      if (index >= 0 && index < fingers.length) fingers[index].lift = a;
      else if (index === fingers.length) thumbLift = a;
      pose(grip);
    },
    dispose() {
      // Geometriler önbellekte, malzemeler karakterde atılır.
    },
  };
  return hand;
}

/** Bir nesne ağacındaki bütün örgülerin geometri ve malzemelerini atar. */
export function disposeTree(obj: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    geos.add(m.geometry);
    const mm = m.material;
    if (Array.isArray(mm)) mm.forEach((x) => mats.add(x));
    else mats.add(mm);
  });
  for (const g of geos) g.dispose();
  for (const m of mats) {
    for (const v of Object.values(m)) {
      if (v instanceof THREE.Texture) v.dispose();
    }
    m.dispose();
  }
}

/** Dünya konumunu, nesnenin üst nesnesinin (yoksa dünyanın) uzayından okur. */
export function worldPositionOf(obj: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  out.copy(obj.position);
  if (obj.parent) {
    obj.parent.updateWorldMatrix(true, false);
    out.applyMatrix4(obj.parent.matrixWorld);
  }
  return out;
}

const _pq = new THREE.Quaternion();
const _pinv = new THREE.Matrix4();

/** Nesneyi dünya konumu ve dünya dönüşüyle yerleştirir; üst nesnesi neresi olursa olsun. */
export function setWorldPose(obj: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion): void {
  if (obj.parent) {
    obj.parent.updateWorldMatrix(true, false);
    _pinv.copy(obj.parent.matrixWorld).invert();
    obj.position.copy(pos).applyMatrix4(_pinv);
    obj.parent.getWorldQuaternion(_pq);
    obj.quaternion.copy(_pq.invert().multiply(quat));
  } else {
    obj.position.copy(pos);
    obj.quaternion.copy(quat);
  }
}

/** Kısa yardımcılar */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  target + (current - target) * Math.exp(-rate * dt);
export const smooth01 = (k: number): number => {
  const x = THREE.MathUtils.clamp(k, 0, 1);
  return x * x * (3 - 2 * x);
};
