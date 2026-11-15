import * as THREE from 'three';
import type { Hand } from '../hand';
import type { Character, CharacterEvent } from './types';
import { SkinnedRig, type GltfLike, type ReachTuning } from './gltfRig';
import { dampTo, smoothstep, worldPosition, worldQuaternion } from './ik';
import { acquireGltf, cloneGltf, disposeObject, releaseGltf } from './gltfCharacter';
import { PLAYER_CAMERA, type PlayerArmCharacter } from './playerArm';

/*
 * Oyuncunun gövdesi: GLB karakterlerden biri kameranın arkasına ve altına oturtulur, yalnızca sağ ön kolu
 * ve eli (biraz da kolu) görüntünün sağ altından girer. Baş ve kameraya çarpabilecek parçalar gizlenir.
 * Kol rakip karakterle aynı ters kinematikle sürülür. Kök dünya merkezindedir; siyah oynarken π döner.
 */

const TABLE_TOP = -0.29;
/** Hamleye giriş/çıkış karışımının süresi (s) */
const BUSY_BLEND = 0.25;
const HIDE_MESH = /head|hat|cigar|teeth|eye|hair|lash|brow/i;

export interface PlayerBodyOptions {
  url?: string;
  gltf?: GltfLike;
  loader?: (url: string) => Promise<GltfLike>;
  scale?: number;
  reach?: Partial<ReachTuning>;
}

/** Omzun kameraya göre yeri: sağa, aşağı, geriye (birim). */
const SHOULDER = { right: 6.6, down: 6.2, back: 1.2 };
/** Dinlenen avucun ekrandaki yeri (NDC); masa düzleminde aranır. */
const REST_NDC = { x: 0.6, y: -0.64 };

export interface PlayerBodyLayout {
  shoulder: THREE.Vector3;
  /** Avucun masada dinlendiği nokta */
  restPalm: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
}

export function playerBodyLayout(
  cameraPos: THREE.Vector3,
  lookTarget: THREE.Vector3,
  fov = PLAYER_CAMERA.fov,
  aspect = PLAYER_CAMERA.aspect,
): PlayerBodyLayout {
  const fwd = new THREE.Vector3().subVectors(lookTarget, cameraPos);
  if (fwd.lengthSq() < 1e-8) fwd.set(0, -0.5, -1);
  fwd.normalize();
  const flat = new THREE.Vector3(fwd.x, 0, fwd.z);
  if (flat.lengthSq() < 1e-8) flat.set(0, 0, -1);
  flat.normalize();
  const right = new THREE.Vector3().crossVectors(flat, new THREE.Vector3(0, 1, 0)).normalize();
  const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const shoulder = cameraPos
    .clone()
    .addScaledVector(right, SHOULDER.right)
    .addScaledVector(flat, -SHOULDER.back)
    .add(new THREE.Vector3(0, -SHOULDER.down, 0));
  // Ekrandaki noktadan geçen ışın masa düzlemini nerede keser
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const ray = fwd
    .clone()
    .addScaledVector(right, REST_NDC.x * tanV * aspect)
    .addScaledVector(camUp, REST_NDC.y * tanV)
    .normalize();
  let k = ray.y < -1e-3 ? (TABLE_TOP - cameraPos.y) / ray.y : 12;
  if (!Number.isFinite(k) || k <= 0) k = 12;
  const restPalm = cameraPos.clone().addScaledVector(ray, k);
  // Omuzdan çok uzaksa omza doğru çekilir (kol gerilmesin)
  const maxD = 9.4;
  const d = restPalm.distanceTo(shoulder);
  if (d > maxD) restPalm.lerp(shoulder, (d - maxD) / d).setY(TABLE_TOP);
  return { shoulder, restPalm, forward: flat, right };
}

class PlayerBody implements PlayerArmCharacter {
  readonly id = 'oyuncu';
  readonly root = new THREE.Group();
  readonly hand: Hand;
  private rig: SkinnedRig | null = null;
  private gltf: GltfLike | null = null;
  private owns = false;
  private disposed = false;
  private mixer: THREE.AnimationMixer | null = null;
  private layout: PlayerBodyLayout;
  private reachT: ReachTuning;
  private scale: number;
  private shoulderModel = new THREE.Vector3();
  private busy = false;
  private busyW = 0;
  private busyT = 0;
  private grip = 0;
  private gripPulse = 0;
  private slump = 0;
  private slumpTarget = 0;
  private bodyM = 0;
  private stretch = 1;
  private time = 0;
  private startOffset = new THREE.Vector3();
  private startDecay = 0;
  private lastGrip = new THREE.Vector3();
  private url?: string;
  private ownGeometries: THREE.BufferGeometry[] = [];
  private ownMaterials: THREE.Material[] = [];

  private tRest = new THREE.Vector3();
  private tTarget = new THREE.Vector3();
  private tBusy = new THREE.Vector3();
  private qRest = new THREE.Quaternion();
  private qTarget = new THREE.Quaternion();
  private qBusy = new THREE.Quaternion();

  constructor(opts: PlayerBodyOptions) {
    this.root.name = 'oyuncu-govdesi';
    this.scale = opts.scale ?? 18;
    this.reachT = {
      maxPitch: 0.5,
      maxTwist: 0.35,
      maxRise: 0.5,
      maxForward: 3.2,
      maxClavicle: 0.4,
      comfort: 0.96,
      maxStretch: 0.3,
      ...opts.reach,
    };
    const handRoot = new THREE.Group();
    handRoot.name = 'oyuncu-eli';
    this.hand = {
      root: handRoot,
      setGrip: (a: number) => {
        this.grip = THREE.MathUtils.clamp(Number.isFinite(a) ? a : 0, 0, 1);
      },
    };
    this.layout = playerBodyLayout(PLAYER_CAMERA.position, PLAYER_CAMERA.target);
    handRoot.position.copy(this.restPoint());
    this.url = opts.url;
    if (opts.gltf) {
      this.owns = true;
      this.attach(opts.gltf);
    } else if (opts.url) {
      const url = opts.url;
      acquireGltf(url, opts.loader)
        .then(async (g) => {
          if (this.disposed) return releaseGltf(url);
          const copy = await cloneGltf(g);
          if (this.disposed) return releaseGltf(url);
          this.attach(copy);
        })
        .catch((err) => console.warn('Oyuncu gövdesi yüklenemedi.', err));
    }
  }

  get ready(): boolean {
    return this.rig !== null;
  }

  get shoulder(): THREE.Vector3 {
    return this.layout.shoulder.clone();
  }

  private attach(g: GltfLike): void {
    this.gltf = g;
    const rig = new SkinnedRig(g, { scale: this.scale, offset: new THREE.Vector3(), reach: this.reachT });
    this.rig = rig;
    // Model +z'ye bakar; oyuncu tahtaya (-z) bakar.
    rig.wrapper.rotation.y = Math.PI;
    // Yalnızca sağ kol çizilir: gövde, baş ve bacaklar uzanırken kameraya girerdi.
    for (const m of rig.meshes) {
      if (HIDE_MESH.test(m.name)) {
        m.visible = false;
        continue;
      }
      const geo = keepArmTriangles(m, rig.right.clavicle);
      if (!geo) m.visible = false;
      else {
        m.geometry = geo;
        this.ownGeometries.push(geo);
        // Kol örgüsü kesildiği için açık kalan omuz ağzının içi de çizilsin. Malzemeler önbellekteki
        // modelle paylaşıldığından kopyalanır.
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mat) => {
          const c = mat.clone();
          c.side = THREE.DoubleSide;
          this.ownMaterials.push(c);
          return c;
        });
        m.material = Array.isArray(m.material) ? mats : mats[0];
      }
    }
    this.root.add(rig.wrapper);
    this.mixer = new THREE.AnimationMixer(rig.model);
    const clip = g.animations.find((c) => c.name === 'bekleme-1') ?? g.animations.find((c) => c.name === 'oturus');
    if (clip) this.mixer.clipAction(clip).play();
    this.mixer.update(0);
    rig.capture();
    // Omzun model içindeki yeri (canlandırılmış duruşta, ölçekli sarmalayıcıya göre)
    this.root.updateMatrixWorld(true);
    this.shoulderModel.copy(rig.wrapper.worldToLocal(rig.shoulderWorld(new THREE.Vector3())));
    this.place();
    this.update(0, 0);
  }

  /** Sarmalayıcıyı, omuz düzenin omuz noktasına gelecek biçimde yerleştirir. */
  private place(): void {
    const rig = this.rig;
    if (!rig) return;
    const w = rig.wrapper;
    // Gövde biraz sola dönük: sağ omuz öne, kol ekrana doğru
    w.rotation.set(0, Math.PI + 0.25, 0);
    w.position.set(0, 0, 0);
    w.updateMatrix();
    const s = this.shoulderModel.clone().applyMatrix4(w.matrix);
    w.position.copy(this.layout.shoulder).sub(s);
    this.root.updateMatrixWorld(true);
  }

  configure(cameraPos: THREE.Vector3, lookTarget: THREE.Vector3, fov?: number, aspect?: number): void {
    this.layout = playerBodyLayout(cameraPos, lookTarget, fov, aspect);
    this.place();
  }

  restPoint(): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    if (!this.rig) return this.root.localToWorld(this.layout.restPalm.clone().setY(TABLE_TOP + 0.6));
    return this.restGrip(this.restHandQ(new THREE.Quaternion()), new THREE.Vector3());
  }

  private restGrip(q: THREE.Quaternion, out: THREE.Vector3): THREE.Vector3 {
    const palm = this.root.localToWorld(this.layout.restPalm.clone().setY(TABLE_TOP + 0.05));
    return this.rig!.gripForPalm(palm, q, out);
  }

  /** Dinlenen el: avuç masada, parmaklar tahtaya ve biraz sola. */
  private restHandQ(out: THREE.Quaternion): THREE.Quaternion {
    const rq = worldQuaternion(this.root, new THREE.Quaternion());
    const f = new THREE.Vector3(-0.5, -0.18, -1).normalize().applyQuaternion(rq);
    const palm = new THREE.Vector3(0.12, -1, 0).applyQuaternion(rq);
    return this.rig!.handQuaternion(f, palm, out);
  }

  private reachHandQ(target: THREE.Vector3, rest: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
    const rq = worldQuaternion(this.root, new THREE.Quaternion());
    const from = this.root.localToWorld(this.layout.shoulder.clone().add(new THREE.Vector3(0, 0, 3)));
    const h = new THREE.Vector3().subVectors(target, from).setY(0);
    if (h.lengthSq() < 1e-6) h.set(0, 0, -1).applyQuaternion(rq);
    h.normalize();
    const k = smoothstep(0.5, 3.5, target.distanceTo(rest));
    const pitch = THREE.MathUtils.lerp(0.18, 0.8, k);
    const f = h.clone().multiplyScalar(Math.cos(pitch)).add(new THREE.Vector3(0, -Math.sin(pitch), 0));
    const side = new THREE.Vector3(0, 1, 0).cross(h).normalize();
    const palm = new THREE.Vector3(0, -1, 0).addScaledVector(side, -0.25 * k);
    const q = this.rig!.handQuaternion(f, palm, out);
    return this.restHandQ(new THREE.Quaternion()).slerp(q, smoothstep(0, 1, k * 1.4));
  }

  lookAt(): void {
    // Oyuncunun bakışını kamera belirler.
  }

  setHandBusy(busy: boolean): void {
    if (busy === this.busy) return;
    this.busy = busy;
    if (busy) {
      this.startOffset.subVectors(this.lastGrip, this.hand.root.position);
      if (!this.rig || !Number.isFinite(this.startOffset.x) || this.startOffset.length() > 8) this.startOffset.set(0, 0, 0);
      this.startDecay = 1;
    }
  }

  react(ev: CharacterEvent): void {
    if (ev === 'won' || ev === 'took-piece' || ev === 'gave-check') this.gripPulse = 1;
    if (ev === 'lost') this.slumpTarget = 1;
    if (ev === 'draw' || ev === 'won') this.slumpTarget = 0;
  }

  update(dt: number, now: number): void {
    void now;
    const d = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    this.time += d;
    this.root.updateMatrixWorld(true);
    // Hamleye giriş/çıkış ~0,25 s'de yumuşakça karışır.
    this.busyT = THREE.MathUtils.clamp(this.busyT + (this.busy ? d : -d) / BUSY_BLEND, 0, 1);
    this.busyW = smoothstep(0, 1, this.busyT);
    this.gripPulse = dampTo(this.gripPulse, 0, 1.6, d);
    this.slump = dampTo(this.slump, this.slumpTarget, 1.5, d);
    const rig = this.rig;
    if (!rig || !this.mixer) {
      if (!this.busy) this.hand.root.position.copy(this.restPoint());
      return;
    }
    rig.resetPose();
    this.mixer.update(d);
    rig.capture();

    const restQ = this.restHandQ(this.qRest);
    const restW = this.restGrip(restQ, this.tRest);
    restW.y += 0.04 * Math.sin(this.time * 1.3) - 0.2 * this.slump;
    const target = this.tTarget.copy(restW);
    const handQ = this.qTarget.copy(restQ);
    if (this.busyW > 0) {
      const busyT = this.hand.root.getWorldPosition(this.tBusy);
      if (![busyT.x, busyT.y, busyT.z].every(Number.isFinite)) busyT.copy(restW);
      this.startDecay = dampTo(this.startDecay, 0, 9, d);
      busyT.addScaledVector(this.startOffset, this.startDecay);
      const rq = this.reachHandQ(busyT, restW, this.qBusy);
      target.lerp(busyT, this.busyW);
      handQ.slerp(rq, this.busyW);
    }
    let need = 0;
    let stretch = 1;
    {
      const base = 0.1 * this.busyW * smoothstep(4, 10, target.distanceTo(rig.shoulderWorld()));
      const r = rig.reachNeed(target, handQ, base);
      need = r.body;
      stretch = r.stretch;
    }
    this.bodyM = need > this.bodyM ? need : dampTo(this.bodyM, need, 3.5, d);
    this.stretch = stretch > this.stretch ? stretch : dampTo(this.stretch, stretch, 4, d);
    rig.setStretch(this.stretch);
    const pole = new THREE.Vector3(1, -0.75, 0.3).applyQuaternion(worldQuaternion(this.root, new THREE.Quaternion()));
    rig.reach(target, handQ, 1, this.bodyM, pole);
    const gripAmt = this.busyW > 0 ? THREE.MathUtils.lerp(0.15, this.grip, this.busyW) : 0.15 + 0.6 * smoothstep(0, 1, this.gripPulse * 1.4);
    rig.fingers(gripAmt, 1);

    rig.gripWorld(this.lastGrip);
    if (!this.busy && [this.lastGrip.x, this.lastGrip.y, this.lastGrip.z].every(Number.isFinite)) {
      this.hand.root.position.copy(this.lastGrip);
    }
    this.hand.root.updateMatrixWorld(true);
    void worldPosition;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hand.root.removeFromParent();
    this.root.removeFromParent();
    this.mixer?.stopAllAction();
    if (this.rig) {
      this.mixer?.uncacheRoot(this.rig.model);
      this.rig.dispose();
    }
    for (const g of this.ownGeometries) g.dispose();
    for (const m of this.ownMaterials) m.dispose();
    this.ownGeometries = [];
    this.ownMaterials = [];
    if (this.gltf) {
      if (this.owns) disposeObject(this.gltf.scene);
      else if (this.url) releaseGltf(this.url);
    }
    this.rig = null;
    this.gltf = null;
  }
}

/**
 * Örgünün yalnızca sağ kola (köprücükten parmak uçlarına) bağlı üçgenlerini tutan kopya; hiç kalmazsa null.
 * Geometri önbellekteki modelle paylaşıldığı için kopyalanır.
 */
function keepArmTriangles(mesh: THREE.SkinnedMesh, clavicle: THREE.Bone): THREE.BufferGeometry | null {
  const src = mesh.geometry;
  const si = src.getAttribute('skinIndex');
  const sw = src.getAttribute('skinWeight');
  if (!si || !sw) return null;
  const arm = new Set<number>();
  mesh.skeleton.bones.forEach((b, i) => {
    let o: THREE.Object3D | null = b;
    while (o) {
      if (o === clavicle) {
        // Köprücük ve sonrası: omuz başı kalır, açık ağız omzun içinde kalır.
        arm.add(i);
        break;
      }
      o = o.parent;
    }
  });
  if (arm.size === 0) return null;
  const n = si.count;
  const w = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    let s = 0;
    for (let k = 0; k < 4; k++) if (arm.has(si.getComponent(v, k))) s += sw.getComponent(v, k);
    w[v] = s;
  }
  const index = src.index;
  const tri = index ? index.count : n;
  const keep: number[] = [];
  for (let t = 0; t < tri; t += 3) {
    const a = index ? index.getX(t) : t;
    const b = index ? index.getX(t + 1) : t + 1;
    const c = index ? index.getX(t + 2) : t + 2;
    if (Math.min(w[a], w[b], w[c]) >= 0.5) keep.push(a, b, c);
  }
  if (keep.length === 0) return null;
  const geo = src.clone();
  geo.setIndex(keep);
  return geo;
}

/** GLB karakterlerinden birinin gövdesiyle oyuncunun kolu. Varsayılan: Patron. */
export function createPlayerBody(id = 'patron', opts: PlayerBodyOptions = {}): PlayerArmCharacter & { readonly ready: boolean } {
  return new PlayerBody({ url: `karakterler/${id}/karakter.glb`, ...opts });
}
