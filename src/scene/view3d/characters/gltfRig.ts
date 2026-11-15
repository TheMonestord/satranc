import * as THREE from 'three';
import {
  dampTo,
  quatFromAxes,
  rotateWorld,
  setWorldQuaternion,
  solveTwoBone,
  twistAbout,
  worldPosition,
  worldQuaternion,
  type TwoBoneResult,
} from './ik';

/*
 * Mixamo iskeletli (GLB) bir karakterin kollarını ters kinematikle süren ortak parça.
 * Rakip karakter (gltfCharacter.ts) ve oyuncunun gövdesi (playerBody.ts) bunu kullanır.
 *
 * Her karede sıra şöyledir:
 *   1. Canlandırma karıştırıcıları kemikleri yazar (çağıran yapar).
 *   2. `capture()` canlandırılmış duruşu saklar.
 *   3. `reachNeed()` + `reach()` gerekirse gövdeyi eğer/döndürür/kaldırır, sağ kolu hedefe çözer
 *      ve canlandırmayla karıştırır; `left.solve()` sol eli masada tutar.
 *   4. `fingers()` parmakları açık ↔ kıstırma arasında büker.
 *   5. `addLook()` boyun ve başa bakış ekler.
 */

/** GLTFLoader çıktısının kullandığımız kısmı. */
export interface GltfLike {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export interface ReachTuning {
  /** Gövdenin öne eğilebileceği en büyük açı (rad), omurgaya dağıtılır */
  maxPitch: number;
  /** Gövdenin sağ omuzu öne getirmek için dönebileceği açı (rad) */
  maxTwist: number;
  /** Kalçanın yükselebileceği en büyük mesafe (dünya birimi) */
  maxRise: number;
  /** Kalçanın öne kayabileceği en büyük mesafe (dünya birimi) */
  maxForward: number;
  /** Köprücük kemiğinin öne dönüşü (rad) */
  maxClavicle: number;
  /** Rahat erişim: kol uzunluğunun bu oranından uzağa kol gerilmez, gövde yardım eder */
  comfort: number;
  /** Gövde yetmezse kolun çizgi film gibi uzayabileceği oran (0 = hiç) */
  maxStretch?: number;
}

export interface RigOptions {
  /** Model metresi başına dünya birimi */
  scale: number;
  /** Modelin kök içindeki yeri (oturma noktası) */
  offset: THREE.Vector3;
  /** Başın büyüklüğü (1 = olduğu gibi) */
  headScale?: number;
  /** Ellerin büyüklüğü (1 = olduğu gibi); iri eldivenli karakterlerde taşlara göre küçültmek için */
  handScale?: number;
  reach: ReachTuning;
  /** Kemik adı öneki; verilmezse kalça kemiğinden bulunur */
  prefix?: string;
}

type Side = 'Right' | 'Left';
type FingerName = 'Thumb' | 'Index' | 'Middle' | 'Ring' | 'Pinky';
const FINGERS: FingerName[] = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

interface FingerChain {
  name: FingerName;
  /** 1, 2, 3. eklemler */
  joints: THREE.Bone[];
  /** Ucun son eklemdeki yeri */
  tip: THREE.Vector3;
  open: THREE.Quaternion[];
  pinch: THREE.Quaternion[];
  bind: THREE.Quaternion[];
  flexAxis: THREE.Vector3[];
}

const UP = new THREE.Vector3(0, 1, 0);

/** Klipte bir kemiğin ortadaki karedeki yerel dönüşü. */
function clipQuat(clips: THREE.AnimationClip[], clipName: string, track: string, out: THREE.Quaternion): boolean {
  const clip = clips.find((c) => c.name === clipName);
  const t = clip?.tracks.find((x) => x.name === `${track}.quaternion`);
  if (!t || t.values.length < 4) return false;
  const v = t.values;
  const i = Math.min(Math.floor(v.length / 4 / 2), v.length / 4 - 1) * 4;
  out.set(v[i], v[i + 1], v[i + 2], v[i + 3]).normalize();
  return true;
}

/** Bağlamaya göre dönüşün ekseni ve açısı (açı pozitif). */
function relAxis(bind: THREE.Quaternion, q: THREE.Quaternion, out: THREE.Vector3): number {
  const rel = bind.clone().invert().multiply(q);
  if (rel.w < 0) rel.set(-rel.x, -rel.y, -rel.z, -rel.w);
  const s = Math.sqrt(Math.max(0, 1 - rel.w * rel.w));
  if (s < 1e-4) return 0;
  out.set(rel.x / s, rel.y / s, rel.z / s);
  return 2 * Math.acos(THREE.MathUtils.clamp(rel.w, -1, 1));
}

/** Bir kol: köprücük, üst kol, ön kol, el ve parmaklar. */
export class ArmRig {
  readonly side: Side;
  readonly clavicle: THREE.Bone;
  readonly upper: THREE.Bone;
  readonly fore: THREE.Bone;
  readonly hand: THREE.Bone;
  /** Kıstırmada başparmak ile işaret/orta parmak uçlarının ortası (el kemiğinin yerel uzayı, model birimi) */
  readonly gripLocal = new THREE.Vector3();
  /** Avuç içinin ortası, avuç yüzeyinde */
  readonly palmCenter = new THREE.Vector3();
  /** Elin yerel eksenleri: parmak yönü, avuç içi normali */
  readonly fingerAxis = new THREE.Vector3();
  readonly palmAxis = new THREE.Vector3();
  private hingeUpper = new THREE.Vector3();
  private chains: FingerChain[] = [];
  private bindForePos = new THREE.Vector3();
  private bindHandPos = new THREE.Vector3();
  private stretch = 1;
  private ik: TwoBoneResult = { elbow: new THREE.Vector3(), end: new THREE.Vector3(), reached: false };
  private tracked = new Set<string>();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private v4 = new THREE.Vector3();

  constructor(
    side: Side,
    bones: Map<string, THREE.Bone>,
    private prefix: string,
    private bindQ: Map<THREE.Object3D, THREE.Quaternion>,
    clips: THREE.AnimationClip[],
  ) {
    this.side = side;
    const need = (n: string): THREE.Bone => {
      const b = bones.get(`${side}${n}`);
      if (!b) throw new Error(`Karakter iskeletinde ${side}${n} kemiği yok`);
      return b;
    };
    this.clavicle = need('Shoulder');
    this.upper = need('Arm');
    this.fore = need('ForeArm');
    this.hand = need('Hand');
    this.bindForePos.copy(this.fore.position);
    this.bindHandPos.copy(this.hand.position);
    this.measureHand(bones, clips);
    this.measureHinge(clips);
  }

  get bones(): THREE.Bone[] {
    return [this.upper, this.fore, this.hand];
  }

  private measureHinge(clips: THREE.AnimationClip[]): void {
    const hingeFore = new THREE.Vector3();
    let best = 0;
    const axis = new THREE.Vector3();
    for (const clip of ['bekleme-1', 'oturus', 'yumruk', 'konusma']) {
      if (!clipQuat(clips, clip, `${this.prefix}${this.side}ForeArm`, this.q1)) continue;
      const ang = relAxis(this.bindQ.get(this.fore)!, this.q1, axis);
      if (ang > best + 0.05) {
        best = ang;
        hingeFore.copy(axis);
      }
    }
    if (best < 0.2) hingeFore.set(0, 0, this.side === 'Right' ? -1 : 1);
    // Menteşe ön kolun kendi eksenine dik olmalı.
    const yF = this.v1.copy(this.hand.position).normalize();
    hingeFore.addScaledVector(yF, -hingeFore.dot(yF)).normalize();
    // Üst kolun yerel uzayında (bağlama dönüşüyle)
    this.hingeUpper.copy(hingeFore).applyQuaternion(this.bindQ.get(this.fore)!);
    const yU = this.v2.copy(this.fore.position).normalize();
    this.hingeUpper.addScaledVector(yU, -this.hingeUpper.dot(yU)).normalize();
  }

  private measureHand(bones: Map<string, THREE.Bone>, clips: THREE.AnimationClip[]): void {
    const bone = (n: string) => bones.get(`${this.side}Hand${n}`);
    const mid1 = bone('Middle1') ?? bone('Index1');
    if (!mid1) throw new Error('Karakterin elinde parmak kemiği yok');
    this.fingerAxis.copy(mid1.position).normalize();
    const idx1 = bone('Index1');
    const radial = new THREE.Vector3();
    if (idx1 && bone('Middle1')) radial.subVectors(idx1.position, bone('Middle1')!.position);
    else radial.set(this.side === 'Right' ? 1 : -1, 0, 0);
    radial.addScaledVector(this.fingerAxis, -radial.dot(this.fingerAxis)).normalize();
    // Sağ el: avuç içi = başparmak yönü × parmak yönü; sol elde tersi
    if (this.side === 'Right') this.palmAxis.crossVectors(radial, this.fingerAxis).normalize();
    else this.palmAxis.crossVectors(this.fingerAxis, radial).normalize();
    // Avucun ortası: bilek ile parmak köklerinin arası, avuç yüzeyinde
    const palmLen = mid1.position.length();
    this.palmCenter.copy(mid1.position).multiplyScalar(0.55).addScaledVector(this.palmAxis, palmLen * 0.14);

    for (const name of FINGERS) {
      const joints: THREE.Bone[] = [];
      for (let i = 1; i <= 3; i++) {
        const b = bone(`${name}${i}`);
        if (b) joints.push(b);
      }
      if (joints.length === 0) continue;
      const tipBone = bone(`${name}4`);
      const last = joints[joints.length - 1];
      const tip = tipBone ? tipBone.position.clone() : last.position.clone().multiplyScalar(0.8);
      const bind = joints.map((j) => this.bindQ.get(j)!.clone());
      const flexAxis = joints.map((j, i) => {
        const ax = new THREE.Vector3();
        let ang = 0;
        if (clipQuat(clips, 'yumruk', `${this.prefix}${this.side}Hand${name}${i + 1}`, this.q1)) ang = relAxis(bind[i], this.q1, ax);
        if (ang < 0.15) {
          if (name === 'Thumb') ax.set(0, 0, 1);
          else ax.set(1, 0, 0);
        }
        return ax;
      });
      this.chains.push({ name, joints, tip, open: [], pinch: [], bind, flexAxis });
    }
    this.buildFingerPoses();
  }

  /** Eli ve parmakları kıstırma duruşuna göre ölçer; açık el ve kıstırma dönüşlerini hazırlar. */
  private buildFingerPoses(): void {
    const PINCH: Record<FingerName, number[]> = {
      Thumb: [0, 0, 0],
      Index: [0.5, 0.55, 0.35],
      Middle: [0.62, 0.7, 0.42],
      Ring: [1.0, 1.05, 0.7],
      Pinky: [1.15, 1.1, 0.75],
    };
    const OPEN: Record<FingerName, number[]> = {
      Thumb: [0, 0, 0],
      Index: [0.26, 0.3, 0.16],
      Middle: [0.32, 0.36, 0.2],
      Ring: [0.42, 0.46, 0.26],
      Pinky: [0.52, 0.5, 0.3],
    };
    const rot = (c: FingerChain, angles: number[]) =>
      c.joints.map((_, i) => c.bind[i].clone().multiply(new THREE.Quaternion().setFromAxisAngle(c.flexAxis[i], angles[i] ?? 0)));
    for (const c of this.chains) {
      c.pinch = rot(c, PINCH[c.name]);
      c.open = rot(c, OPEN[c.name]);
    }
    const thumb = this.chains.find((c) => c.name === 'Thumb');
    const index = this.chains.find((c) => c.name === 'Index');
    const middle = this.chains.find((c) => c.name === 'Middle');
    if (!index) return;
    const indexTip = this.chainTip(index, index.pinch);
    const middleTip = middle ? this.chainTip(middle, middle.pinch) : indexTip.clone();
    const fingersTip = indexTip.clone().lerp(middleTip, 0.35);
    if (thumb) {
      // Başparmağı işaret parmağının ucuna, bir taş kalınlığı kadar boşlukla getiren dönüşü ara.
      const handLen = index.joints[0].position.length() + 1e-6;
      const gap = handLen * 0.32;
      const radial =
        this.side === 'Right'
          ? new THREE.Vector3().crossVectors(this.fingerAxis, this.palmAxis).normalize()
          : new THREE.Vector3().crossVectors(this.palmAxis, this.fingerAxis).normalize();
      let best = Infinity;
      let bestQ: THREE.Quaternion[] = thumb.bind.map((q) => q.clone());
      const qa = new THREE.Quaternion();
      const qb = new THREE.Quaternion();
      const qc = new THREE.Quaternion();
      const qs = thumb.bind.map((q) => q.clone());
      const side = new THREE.Vector3();
      for (let a = -1.2; a <= 1.21; a += 0.1) {
        for (let b = -1.2; b <= 1.21; b += 0.1) {
          qa.setFromAxisAngle(this.palmAxis, a);
          qb.setFromAxisAngle(this.fingerAxis, b);
          // İlk eklem el uzayındaki eksenlerle döner (ebeveyn uzayında önden çarpma).
          qs[0].copy(qa).multiply(qb).multiply(thumb.bind[0]);
          for (let c = 0; c <= 1.21; c += 0.1) {
            for (let i = 1; i < thumb.joints.length; i++) {
              qs[i].copy(thumb.bind[i]).multiply(qc.setFromAxisAngle(thumb.flexAxis[i], c * (i === 1 ? 1 : 0.8)));
            }
            const tip = this.chainTip(thumb, qs);
            const d = tip.distanceTo(fingersTip);
            side.subVectors(tip, fingersTip);
            const palmSide = side.dot(this.palmAxis);
            const along = side.dot(this.fingerAxis);
            const rad = side.dot(radial);
            const cost =
              (d - gap) * (d - gap) +
              0.6 * Math.max(0, -palmSide + gap * 0.1) ** 2 +
              0.5 * along * along +
              0.4 * Math.max(0, -rad) ** 2 +
              0.001 * handLen * handLen * (a * a + b * b + c * c);
            if (cost < best) {
              best = cost;
              bestQ = qs.map((q) => q.clone());
            }
          }
        }
      }
      thumb.pinch = bestQ;
      thumb.open = thumb.bind.map((q, i) => q.clone().slerp(bestQ[i], 0.35));
      const thumbTip = this.chainTip(thumb, thumb.pinch);
      this.gripLocal.copy(thumbTip).lerp(fingersTip, 0.5);
    } else {
      this.gripLocal.copy(fingersTip);
    }
    // Kavrama noktası parmak uçlarından biraz avuca doğru: taş parmak etlerinin arasında durur.
    this.gripLocal.lerp(index.joints[0].position, 0.12);
  }

  /** Parmak zincirinin ucunun el kemiği uzayındaki yeri (verilen eklem dönüşleriyle). */
  private chainTip(c: FingerChain, qs: THREE.Quaternion[]): THREE.Vector3 {
    const m = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    const acc = new THREE.Matrix4();
    c.joints.forEach((j, i) => {
      m.compose(j.position, qs[i], one);
      acc.multiply(m);
    });
    return c.tip.clone().applyMatrix4(acc);
  }

  /** Etkin kliplerin izlediği kemik adları; izlenmeyen yüzük/serçe parmaklar orta parmağı izler. */
  setTracked(names: Set<string>): void {
    this.tracked = names;
  }

  fillMissingFingers(): void {
    const middle = this.chains.find((c) => c.name === 'Middle') ?? this.chains.find((c) => c.name === 'Index');
    if (!middle) return;
    for (const c of this.chains) {
      if (c.name !== 'Ring' && c.name !== 'Pinky') continue;
      c.joints.forEach((j, i) => {
        if (this.tracked.has(j.name)) return;
        const mi = Math.min(i, middle.joints.length - 1);
        // Orta parmağın bağlamaya göre bükülmesini kopyala, biraz daha kıvır.
        const rel = this.q1.copy(middle.bind[mi]).invert().multiply(middle.joints[mi].quaternion);
        const extra = this.q2.setFromAxisAngle(c.flexAxis[i], c.name === 'Ring' ? 0.08 : 0.16);
        j.quaternion.copy(c.bind[i]).multiply(rel).multiply(extra);
      });
    }
  }

  /** Kolun uzama oranı (1 = doğal). Kemik konumları canlandırılmadığı için her kare yeniden kurulur. */
  setStretch(k: number): void {
    const v = THREE.MathUtils.clamp(Number.isFinite(k) ? k : 1, 0.5, 2);
    if (v === this.stretch) return;
    this.stretch = v;
    this.fore.position.copy(this.bindForePos).multiplyScalar(v);
    this.hand.position.copy(this.bindHandPos).multiplyScalar(v);
    this.upper.updateMatrixWorld(true);
  }

  gripWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.gripLocal).applyMatrix4(this.hand.matrixWorld);
  }

  shoulderWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return worldPosition(this.upper, out);
  }

  /** Kolun toplam uzunluğu (dünya birimi). */
  length(): number {
    const a = worldPosition(this.upper, this.v1);
    const b = worldPosition(this.fore, this.v2);
    const c = worldPosition(this.hand, this.v3);
    return a.distanceTo(b) + b.distanceTo(c);
  }

  private handScale(): number {
    return this.v4.setFromMatrixScale(this.hand.matrixWorld).x;
  }

  /** Dünya uzayında elin istenen yönü: parmaklar `finger`, avuç içi `palm` yönünde (el kemiğinin dünya dönüşü). */
  handQuaternion(finger: THREE.Vector3, palm: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
    return quatFromAxes(this.fingerAxis, this.palmAxis, finger, palm, out);
  }

  /** Kavrama noktası `grip`e gelecekse bileğin olması gereken yer. */
  wristFor(grip: THREE.Vector3, handQ: THREE.Quaternion, out = new THREE.Vector3()): THREE.Vector3 {
    const s = this.handScale();
    return out.copy(this.gripLocal).multiplyScalar(s).applyQuaternion(handQ).negate().add(grip);
  }

  /** Avuç ortası `palm` noktasına gelecekse kavrama noktasının yeri. */
  gripForPalm(palm: THREE.Vector3, handQ: THREE.Quaternion, out = new THREE.Vector3()): THREE.Vector3 {
    const s = this.handScale();
    return out.subVectors(this.gripLocal, this.palmCenter).multiplyScalar(s).applyQuaternion(handQ).add(palm);
  }

  /**
   * Kavrama noktasını `grip`e, el kemiğini `handQ` dönüşüne getirir; `weight` ile canlandırmayla karıştırır.
   * `pole` dirseğin kıvrılacağı yön (dünya).
   */
  solve(grip: THREE.Vector3, handQ: THREE.Quaternion, weight: number, pole: THREE.Vector3): void {
    const w = THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
    if (w <= 1e-4) return;
    const savedU = this.upper.quaternion.clone();
    const savedF = this.fore.quaternion.clone();
    const savedH = this.hand.quaternion.clone();

    const a = worldPosition(this.upper, new THREE.Vector3());
    const b = worldPosition(this.fore, this.v2);
    const c = worldPosition(this.hand, this.v3);
    const l1 = a.distanceTo(b);
    const l2 = b.distanceTo(c);
    const wrist = this.wristFor(grip, handQ, new THREE.Vector3());
    const res = solveTwoBone(a, l1, l2, wrist, pole, this.ik);

    // Üst kol: kemik yönü dirseğe, menteşe ekseni bükülme düzleminin normaline
    const dirAE = this.v2.subVectors(res.elbow, a).normalize();
    const dirEW = this.v3.subVectors(res.end, res.elbow).normalize();
    const n = this.v4.crossVectors(dirAE, dirEW);
    if (n.lengthSq() < 1e-8) {
      n.crossVectors(dirAE, pole);
      if (n.lengthSq() < 1e-8) n.set(1, 0, 0).cross(dirAE);
    }
    n.normalize();
    const yU = new THREE.Vector3().copy(this.fore.position).normalize();
    setWorldQuaternion(this.upper, quatFromAxes(yU, this.hingeUpper, dirAE, n, new THREE.Quaternion()));

    // Ön kol: bileğe yönel, sonra el ile arasındaki burulmanın bir kısmını üstlen (bilek değil ön kol döner)
    const yF = new THREE.Vector3().copy(this.hand.position).normalize();
    const curF = worldQuaternion(this.fore, new THREE.Quaternion());
    const curDir = yF.clone().applyQuaternion(curF);
    let qF = new THREE.Quaternion().setFromUnitVectors(curDir, dirEW).multiply(curF);
    const rel = qF.clone().invert().multiply(handQ);
    const tw = twistAbout(rel, yF, new THREE.Quaternion());
    qF = qF.multiply(new THREE.Quaternion().slerp(tw, 0.6));
    setWorldQuaternion(this.fore, qF);
    setWorldQuaternion(this.hand, handQ);

    if (w < 0.9999) {
      this.upper.quaternion.copy(savedU.slerp(this.upper.quaternion, w));
      this.fore.quaternion.copy(savedF.slerp(this.fore.quaternion, w));
      this.hand.quaternion.copy(savedH.slerp(this.hand.quaternion, w));
      this.upper.updateMatrixWorld(true);
    }
  }

  /** Parmakları büker: `amount` 0 açık, 1 kıstırma; `weight` canlandırmayla karışım. */
  fingers(amount: number, weight: number): void {
    const w = THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
    if (w <= 1e-4) return;
    const k = THREE.MathUtils.clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
    for (const c of this.chains) {
      c.joints.forEach((j, i) => {
        j.quaternion.slerp(this.q1.copy(c.open[i]).slerp(c.pinch[i], k), w);
      });
    }
    this.hand.updateMatrixWorld(true);
  }
}

export class SkinnedRig {
  /** Ölçeklenmiş, kökün içine konan sarmalayıcı */
  readonly wrapper = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly bones = new Map<string, THREE.Bone>();
  readonly meshes: THREE.SkinnedMesh[] = [];
  readonly prefix: string;
  readonly hips: THREE.Bone;
  readonly spine: THREE.Bone[];
  readonly neck: THREE.Bone[];
  readonly head: THREE.Bone;
  readonly right: ArmRig;
  readonly left: ArmRig | null;
  readonly opts: RigOptions;

  private headForward = new THREE.Vector3(0, 0, 1);
  private bindQ = new Map<THREE.Object3D, THREE.Quaternion>();
  /** Canlandırmadan gelen duruşun kopyası (gövde yardımını denerken geri almak için) */
  private animQ = new Map<THREE.Object3D, THREE.Quaternion>();
  private animHipsPos = new THREE.Vector3();
  private bindHipsPos = new THREE.Vector3();
  private bodyBones: THREE.Bone[];

  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private v4 = new THREE.Vector3();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private q3 = new THREE.Quaternion();

  constructor(gltf: GltfLike, opts: RigOptions) {
    this.opts = opts;
    this.model = gltf.scene;
    this.wrapper.name = 'karakter-sarmalayici';
    this.wrapper.scale.setScalar(opts.scale);
    this.wrapper.position.copy(opts.offset);
    this.wrapper.add(this.model);

    let prefix = opts.prefix;
    this.model.traverse((o) => {
      const bone = o as THREE.Bone;
      if (bone.isBone && prefix === undefined && /Hips$/.test(bone.name)) prefix = bone.name.replace(/Hips$/, '');
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isMesh) {
        // Canlandırılan örgünün bağlama duruşundaki sınırları yanlış olur; kesilmesin.
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.isSkinnedMesh) this.meshes.push(mesh);
      }
    });
    this.prefix = prefix ?? 'mixamorig';
    this.model.traverse((o) => {
      const bone = o as THREE.Bone;
      if (bone.isBone && bone.name.startsWith(this.prefix)) this.bones.set(bone.name.slice(this.prefix.length), bone);
    });
    const need = (n: string): THREE.Bone => {
      const b = this.bones.get(n);
      if (!b) throw new Error(`Karakter iskeletinde ${n} kemiği yok`);
      return b;
    };
    this.hips = need('Hips');
    this.spine = ['Spine', 'Spine1', 'Spine2'].map((n) => this.bones.get(n)).filter((b): b is THREE.Bone => !!b);
    this.neck = ['Neck', 'Neck1'].map((n) => this.bones.get(n)).filter((b): b is THREE.Bone => !!b);
    this.head = need('Head');
    for (const b of this.bones.values()) this.bindQ.set(b, b.quaternion.clone());
    this.bindHipsPos.copy(this.hips.position);
    this.right = new ArmRig('Right', this.bones, this.prefix, this.bindQ, gltf.animations);
    let left: ArmRig | null = null;
    try {
      left = new ArmRig('Left', this.bones, this.prefix, this.bindQ, gltf.animations);
    } catch {
      left = null;
    }
    this.left = left;
    this.bodyBones = [this.hips, ...this.spine, this.right.clavicle, ...this.neck, this.head];
    for (const b of [...this.bodyBones, ...this.right.bones]) this.animQ.set(b, b.quaternion.clone());

    if (opts.headScale && opts.headScale !== 1) this.head.scale.setScalar(opts.headScale);
    if (opts.handScale && opts.handScale !== 1) {
      this.right.hand.scale.setScalar(opts.handScale);
      this.left?.hand.scale.setScalar(opts.handScale);
    }
    this.model.updateMatrixWorld(true);
    this.measureHead();
  }

  private measureHead(): void {
    this.wrapper.updateMatrixWorld(true);
    // Bağlama duruşunda model +z'ye bakar.
    const hq = worldQuaternion(this.head, this.q1);
    const wq = worldQuaternion(this.wrapper, this.q2);
    this.headForward.set(0, 0, 1).applyQuaternion(wq).applyQuaternion(hq.invert()).normalize();
  }

  // ---------- Sağ kol kısayolları ----------
  get hand(): THREE.Bone {
    return this.right.hand;
  }
  get gripLocal(): THREE.Vector3 {
    return this.right.gripLocal;
  }
  gripWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.right.gripWorld(out);
  }
  shoulderWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.right.shoulderWorld(out);
  }
  armLength(): number {
    return this.right.length();
  }
  handQuaternion(finger: THREE.Vector3, palm: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
    return this.right.handQuaternion(finger, palm, out);
  }
  gripForPalm(palm: THREE.Vector3, handQ: THREE.Quaternion, out = new THREE.Vector3()): THREE.Vector3 {
    return this.right.gripForPalm(palm, handQ, out);
  }
  setStretch(k: number): void {
    this.right.setStretch(k);
  }
  fingers(amount: number, weight: number): void {
    this.right.fingers(amount, weight);
  }

  // ---------- Kare başına ----------

  /**
   * Bütün kemikleri bağlama duruşuna döndürür. Karıştırıcılardan önce çağrılır: hiçbir klibin izlemediği
   * kemiklere yapılan eğilme/bakış eklemeleri kareden kareye birikmesin.
   */
  resetPose(): void {
    for (const [b, q] of this.bindQ) b.quaternion.copy(q);
    this.hips.position.copy(this.bindHipsPos);
  }

  /** Canlandırmanın yazdığı gövde/kol duruşunu saklar (karıştırıcılardan hemen sonra çağrılır). */
  capture(): void {
    this.right.setStretch(1);
    for (const [b, q] of this.animQ) q.copy(b.quaternion);
    this.animHipsPos.copy(this.hips.position);
    this.right.fillMissingFingers();
    this.left?.fillMissingFingers();
    this.wrapper.updateMatrixWorld(true);
  }

  /** Etkin kliplerin izlediği kemik adları (tam adlarıyla). */
  setTrackedFingers(names: Iterable<string>): void {
    const set = new Set(names);
    this.right.setTracked(set);
    this.left?.setTracked(set);
  }

  private restoreBody(): void {
    for (const [b, q] of this.animQ) b.quaternion.copy(q);
    this.hips.position.copy(this.animHipsPos);
  }

  /**
   * Gövdeyi `m` (0..1) kadar hedefe doğru eğer: kalça kalkar ve öne kayar, omurga eğilir ve döner,
   * köprücük öne gelir. `dir` dünya uzayında hedefe yatay yön, `yaw` hedefin gövdeye göre yan açısı.
   */
  private applyBody(m: number, dir: THREE.Vector3, yaw: number, fwd: THREE.Vector3): void {
    const r = this.opts.reach;
    if (m <= 1e-5 && Math.abs(yaw) < 1e-5) return;
    const parent = this.hips.parent!;
    const off = this.v1
      .copy(UP)
      .multiplyScalar(r.maxRise * m)
      .addScaledVector(fwd, r.maxForward * m);
    const pq = worldQuaternion(parent, this.q1).invert();
    const ps = this.v2.setFromMatrixScale(parent.matrixWorld).x || 1;
    off.applyQuaternion(pq).multiplyScalar(1 / ps);
    this.hips.position.add(off);
    this.hips.updateMatrixWorld(true);
    const lateral = this.v3.crossVectors(UP, dir).normalize();
    const pitch = r.maxPitch * m;
    const twist = THREE.MathUtils.clamp(yaw * 0.45, -0.6, 0.6) + r.maxTwist * m;
    const w = [0.3, 0.35, 0.35];
    this.spine.forEach((b, i) => {
      rotateWorld(b, lateral, pitch * (w[i] ?? 0.3));
      rotateWorld(b, UP, twist * (i === 0 ? 0.2 : 0.4));
    });
    rotateWorld(this.right.clavicle, UP, r.maxClavicle * m);
    rotateWorld(this.right.clavicle, this.v4.copy(dir), -0.15 * m);
  }

  private dirH = new THREE.Vector3();
  private fwdW = new THREE.Vector3();

  /**
   * Hedefe uzanmak için gereken gövde katkısını (0..1) ve gerekirse kolun uzamasını bulur.
   * `minM` her durumda uygulanacak en az katkıdır. Çağrıdan sonra duruş canlandırmanınkine döner.
   */
  reachNeed(grip: THREE.Vector3, handQ: THREE.Quaternion, minM = 0): { body: number; stretch: number } {
    const r = this.opts.reach;
    const wrist = this.right.wristFor(grip, handQ, new THREE.Vector3());
    this.bodyFrame(grip);
    const yaw = this.yawTo(grip);
    const limit = this.right.length() * r.comfort;
    const shoulder = new THREE.Vector3();
    const tooFar = (m: number): boolean => {
      this.restoreBody();
      this.applyBody(m, this.dirH, yaw, this.fwdW);
      this.wrapper.updateMatrixWorld(true);
      this.right.shoulderWorld(shoulder);
      return shoulder.distanceTo(wrist) > limit;
    };
    let need = minM;
    let stretch = 1;
    if (tooFar(minM)) {
      if (tooFar(1)) {
        need = 1;
        // Gövde yetmiyor: kol (izin varsa) biraz uzar
        stretch = Math.min(1 + (r.maxStretch ?? 0), shoulder.distanceTo(wrist) / limit);
      } else {
        let lo = minM;
        let hi = 1;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          if (tooFar(mid)) lo = mid;
          else hi = mid;
        }
        need = hi;
      }
    }
    this.restoreBody();
    this.wrapper.updateMatrixWorld(true);
    return { body: need, stretch };
  }

  /** Gövdenin ileri yönü ve hedefe yatay yön (dünya). */
  private bodyFrame(target: THREE.Vector3): void {
    this.fwdW.set(0, 0, 1).applyQuaternion(worldQuaternion(this.wrapper, this.q3)).setY(0);
    if (this.fwdW.lengthSq() < 1e-6) this.fwdW.set(0, 0, 1);
    this.fwdW.normalize();
    const hp = worldPosition(this.hips, this.v1);
    this.dirH.subVectors(target, hp).setY(0);
    if (this.dirH.lengthSq() < 1e-6) this.dirH.copy(this.fwdW);
    this.dirH.normalize();
  }

  private yawTo(target: THREE.Vector3): number {
    const hp = worldPosition(this.hips, this.v1);
    const d = this.v2.subVectors(target, hp).setY(0);
    const f = this.fwdW;
    const cross = f.z * d.x - f.x * d.z;
    return Math.atan2(cross, f.dot(d));
  }

  /**
   * Sağ elin kavrama noktasını `grip`e, el kemiğini `handQ` dönüşüne getirir.
   * `weight` 0'da canlandırma olduğu gibi kalır, 1'de kol tamamen ters kinematiktedir.
   * `bodyM` gövdenin yardım miktarı (reachNeed ile bulunur), `pole` dirseğin kıvrılacağı yön (dünya).
   */
  reach(grip: THREE.Vector3, handQ: THREE.Quaternion, weight: number, bodyM: number, pole: THREE.Vector3): void {
    this.bodyFrame(grip);
    if (bodyM > 1e-4) {
      this.applyBody(bodyM, this.dirH, this.yawTo(grip), this.fwdW);
      this.wrapper.updateMatrixWorld(true);
    }
    this.right.solve(grip, handQ, weight, pole);
  }

  /** Boyun ve başa, canlandırmanın üstüne ek dönüş: `yaw` sola (+) / sağa, `pitch` yukarı (+) (rad). */
  addLook(yaw: number, pitch: number): void {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    if (Math.abs(yaw) < 1e-5 && Math.abs(pitch) < 1e-5) return;
    const chain = [...this.neck, this.head];
    const share = chain.length === 3 ? [0.25, 0.25, 0.5] : [0.4, 0.6];
    const fwd = this.headForwardWorld(this.v1);
    const lateral = this.v2.crossVectors(UP, fwd.setY(0).normalize()).normalize();
    chain.forEach((b, i) => {
      rotateWorld(b, UP, yaw * share[i]);
      rotateWorld(b, lateral, -pitch * share[i]);
    });
  }

  /** Başın şu anki bakış yönü (dünya). */
  headForwardWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.headForward).applyQuaternion(worldQuaternion(this.head, this.q1)).normalize();
  }

  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return worldPosition(this.head, out);
  }

  /** Bacakları, kalça yükseldikçe dizler masanın altında kalacak biçimde aşağı indirir. */
  lowerLegs(angle: number): void {
    if (Math.abs(angle) < 1e-4) return;
    const lateral = this.v1.set(1, 0, 0).applyQuaternion(worldQuaternion(this.wrapper, this.q1));
    for (const side of ['Left', 'Right']) {
      const up = this.bones.get(`${side}UpLeg`);
      const leg = this.bones.get(`${side}Leg`);
      if (up) rotateWorld(up, lateral, angle);
      if (leg) rotateWorld(leg, lateral, -angle * 0.9);
    }
  }

  dispose(): void {
    // Kopyalanan her iskelet kendi kemik dokusunu taşır; bırakılmazsa ekran kartında birikir.
    this.wrapper.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && (o as THREE.SkinnedMesh).skeleton?.dispose());
    this.wrapper.removeFromParent();
  }
}

export { dampTo };
