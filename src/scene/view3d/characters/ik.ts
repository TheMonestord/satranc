import * as THREE from 'three';

/*
 * Kemikli (skinned) karakterler için küçük ters kinematik yardımcıları.
 * Hepsi dünya uzayında çalışır; kemiğin yerel dönüşü ebeveyninin dünya dönüşünden hesaplanır.
 */

export interface TwoBoneResult {
  /** Dirseğin (orta eklemin) dünya konumu */
  elbow: THREE.Vector3;
  /** Zincirin ucunun (bileğin) ulaştığı nokta; hedef erişilebilirse hedefin kendisi */
  end: THREE.Vector3;
  /** Hedefe tam ulaşıldı mı */
  reached: boolean;
}

const _d = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/**
 * İki kemikli zincir (omuz → dirsek → bilek) için analitik çözüm.
 * `pole`, dirseğin hangi yana kıvrılacağını gösteren yöndür (dünya). Hiçbir girdide NaN üretmez.
 */
export function solveTwoBone(
  a: THREE.Vector3,
  l1: number,
  l2: number,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  out: TwoBoneResult = { elbow: new THREE.Vector3(), end: new THREE.Vector3(), reached: false },
): TwoBoneResult {
  const L1 = Math.max(1e-6, Number.isFinite(l1) ? Math.abs(l1) : 1e-6);
  const L2 = Math.max(1e-6, Number.isFinite(l2) ? Math.abs(l2) : 1e-6);
  _d.subVectors(target, a);
  if (![_d.x, _d.y, _d.z].every(Number.isFinite)) _d.set(0, -1, 0);
  let dist = _d.length();
  if (dist < 1e-9) {
    _d.set(0, -1, 0);
    dist = 1e-9;
  }
  _d.multiplyScalar(1 / dist);
  const minD = Math.abs(L1 - L2) + 1e-6;
  const maxD = L1 + L2 - 1e-6;
  const reached = dist >= minD && dist <= maxD;
  const dc = THREE.MathUtils.clamp(dist, minD, maxD);
  const cosA = THREE.MathUtils.clamp((L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // Dirsek yönü: kutup vektörünün hedef doğrultusuna dik bileşeni
  _bend.copy(pole);
  if (![_bend.x, _bend.y, _bend.z].every(Number.isFinite)) _bend.set(0, -1, 0);
  _bend.addScaledVector(_d, -_bend.dot(_d));
  if (_bend.lengthSq() < 1e-10) {
    // Kutup hedef doğrultusundaysa herhangi bir dik yön
    _bend.set(0, 1, 0).cross(_d);
    if (_bend.lengthSq() < 1e-10) _bend.set(1, 0, 0).cross(_d);
  }
  _bend.normalize();
  out.elbow.copy(a).addScaledVector(_d, L1 * cosA).addScaledVector(_bend, L1 * sinA);
  out.end.copy(a).addScaledVector(_d, dc);
  out.reached = reached && dist > 1e-8;
  return out;
}

const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _x1 = new THREE.Vector3();
const _y1 = new THREE.Vector3();
const _z1 = new THREE.Vector3();

/** (birincil, ikincil) yerel eksen çiftini dünyadaki (birincil, ikincil) çifte götüren dönüş. Birincil tam eşlenir. */
export function quatFromAxes(
  localPrimary: THREE.Vector3,
  localSecondary: THREE.Vector3,
  worldPrimary: THREE.Vector3,
  worldSecondary: THREE.Vector3,
  out = new THREE.Quaternion(),
): THREE.Quaternion {
  basis(localPrimary, localSecondary, _m1);
  basis(worldPrimary, worldSecondary, _m2);
  // R * L = W  →  R = W * L^T
  _m1.transpose();
  _m2.multiply(_m1);
  out.setFromRotationMatrix(_m2);
  if (![out.x, out.y, out.z, out.w].every(Number.isFinite)) out.identity();
  return out.normalize();
}

/** Birincil ekseni tam, ikincili ona dik olacak biçimde düzeltilmiş ortonormal taban (sütunlar: p, s, p×s). */
function basis(p: THREE.Vector3, s: THREE.Vector3, m: THREE.Matrix4): THREE.Matrix4 {
  _x1.copy(p).normalize();
  if (_x1.lengthSq() < 0.5) _x1.set(0, 1, 0);
  _y1.copy(s).addScaledVector(_x1, -s.dot(_x1));
  if (_y1.lengthSq() < 1e-10) {
    _y1.set(1, 0, 0).addScaledVector(_x1, -_x1.x);
    if (_y1.lengthSq() < 1e-10) _y1.set(0, 0, 1).addScaledVector(_x1, -_x1.z);
  }
  _y1.normalize();
  _z1.crossVectors(_x1, _y1);
  return m.makeBasis(_x1, _y1, _z1);
}

const _pq = new THREE.Quaternion();
const _pp = new THREE.Vector3();
const _ps = new THREE.Vector3();

/** Ebeveynin güncel dünya matrisinden dünya dönüşünü okur. */
export function parentWorldQuaternion(o: THREE.Object3D, out = new THREE.Quaternion()): THREE.Quaternion {
  if (!o.parent) return out.identity();
  o.parent.matrixWorld.decompose(_pp, out, _ps);
  return out;
}

/** Kemiğe dünya uzayında dönüş verir ve alt ağacın matrislerini günceller. */
export function setWorldQuaternion(o: THREE.Object3D, q: THREE.Quaternion, update = true): void {
  parentWorldQuaternion(o, _pq).invert();
  o.quaternion.copy(_pq.multiply(q)).normalize();
  if (update) o.updateMatrixWorld(true);
}

const _wq = new THREE.Quaternion();
const _rq = new THREE.Quaternion();

/** Kemiği, dünya eksenine göre ek bir açıyla döndürür (dünya uzayında önden çarpma). */
export function rotateWorld(o: THREE.Object3D, axisWorld: THREE.Vector3, angle: number, update = true): void {
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-7) return;
  o.matrixWorld.decompose(_pp, _wq, _ps);
  _rq.setFromAxisAngle(_tmp.copy(axisWorld).normalize(), angle);
  setWorldQuaternion(o, _rq.multiply(_wq), update);
}

/** Dünya dönüşü (güncel matrislerden). */
export function worldQuaternion(o: THREE.Object3D, out = new THREE.Quaternion()): THREE.Quaternion {
  o.matrixWorld.decompose(_pp, out, _ps);
  return out;
}

/** Dünya konumu (güncel matrislerden). */
export function worldPosition(o: THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 {
  return out.setFromMatrixPosition(o.matrixWorld);
}

/** Dönüşün `axis` çevresindeki burulma bileşeni (swing-twist ayrışımı). */
export function twistAbout(q: THREE.Quaternion, axis: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  out.set(axis.x * d, axis.y * d, axis.z * d, q.w);
  const len = Math.hypot(out.x, out.y, out.z, out.w);
  if (len < 1e-9) return out.identity();
  out.x /= len;
  out.y /= len;
  out.z /= len;
  out.w /= len;
  return out;
}

/** Üstel yumuşatma (kare hızından bağımsız). */
export function dampTo(current: number, target: number, rate: number, dt: number): number {
  if (!Number.isFinite(current)) return target;
  return target + (current - target) * Math.exp(-rate * Math.max(0, dt));
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}
