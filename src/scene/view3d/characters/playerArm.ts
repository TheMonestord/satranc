import * as THREE from 'three';
import type { EllerTheme } from '../../../themes/types';
import type { Character, CharacterEvent } from './types';
import {
  GeoCache,
  IKArm,
  buildArticulatedHand,
  damp,
  disposeTree,
  handBasis,
  pitchedForward,
  setWorldPose,
  smooth01,
  worldPositionOf,
  type ArticulatedHand,
} from './rig';
import { grimeTexture } from './textures';

/*
 * Oyuncunun kendi kolu: birinci şahıs kameranın sağ altından giren kol ve el.
 * Gövde ve baş çizilmez; omuz ekranın hemen dışındadır. Kök dünya merkezinde (dönüşsüz) durur.
 */

/** Varsayılan birinci şahıs kamera (sahne başka değer kullanıyorsa `placePlayerArm` ile bildirir). */
export const PLAYER_CAMERA = {
  position: new THREE.Vector3(0, 12.5, 11.5),
  target: new THREE.Vector3(0, 0, -2),
  fov: 50,
  aspect: 16 / 9,
};

/** Omzun kameraya göre yeri: sağa, aşağı, biraz geriye (birim). */
export const PLAYER_SHOULDER_OFFSET = { right: 6.2, down: 5.0, back: 0.5 };
/** Dinlenmede elin (kavrama noktasının) ekrandaki yeri (NDC) ve kameradan derinliği. */
export const PLAYER_REST_VIEW = { ndcX: 0.74, ndcY: -1.08, depth: 8.5 };


const UPPER = 5.5;
const LOWER = 5.0;
const REACH_LIMIT = (UPPER + LOWER) * 0.975;
const TABLE_TOP = -0.29;
const DEFAULT_SLEEVE = '#2a3147';

export interface PlayerArmLayout {
  shoulder: THREE.Vector3;
  rest: THREE.Vector3;
  /** Uzanırken omzun gidebileceği en uzak yer için kaydırma (gövdenin öne eğilmesi). */
  lean: THREE.Vector3;
  /** Kameranın yatay sağ yönü */
  right: THREE.Vector3;
}

/** Kamera konumundan omuz, dinlenme noktası ve eğilme yönünü hesaplar. */
export function playerArmLayout(
  cameraPos: THREE.Vector3,
  lookTarget: THREE.Vector3,
  fov = PLAYER_CAMERA.fov,
  aspect = PLAYER_CAMERA.aspect,
): PlayerArmLayout {
  const fwd = new THREE.Vector3().subVectors(lookTarget, cameraPos);
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
  fwd.normalize();
  const flat = new THREE.Vector3(fwd.x, 0, fwd.z);
  if (flat.lengthSq() < 1e-8) flat.set(0, 0, -1);
  flat.normalize();
  const right = new THREE.Vector3().crossVectors(flat, new THREE.Vector3(0, 1, 0)).normalize();
  const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const o = PLAYER_SHOULDER_OFFSET;
  const shoulder = cameraPos
    .clone()
    .addScaledVector(right, o.right)
    .addScaledVector(flat, -o.back)
    .add(new THREE.Vector3(0, -o.down, 0));
  const v = PLAYER_REST_VIEW;
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const rest = cameraPos
    .clone()
    .addScaledVector(fwd, v.depth)
    .addScaledVector(right, v.ndcX * tanV * aspect * v.depth)
    .addScaledVector(camUp, v.ndcY * tanV * v.depth);
  rest.y = Math.max(rest.y, TABLE_TOP + 1.2);
  const lean = new THREE.Vector3().addScaledVector(flat, 10).addScaledVector(right, -0.8).add(new THREE.Vector3(0, -3.2, 0));
  return { shoulder, rest, lean, right };
}

const DEFAULT_LAYOUT = playerArmLayout(PLAYER_CAMERA.position, PLAYER_CAMERA.target);
/** Varsayılan kamerayla omuz (dünya). */
export const PLAYER_SHOULDER = DEFAULT_LAYOUT.shoulder.clone();
/** Varsayılan kamerayla elin dinlenme noktası (dünya). */
export const PLAYER_REST = DEFAULT_LAYOUT.rest.clone();

class PlayerArm implements Character {
  readonly id = 'oyuncu';
  readonly root = new THREE.Group();
  readonly hand: ArticulatedHand;
  private geos = new GeoCache();
  private mats: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private arm: IKArm;
  private layout: PlayerArmLayout;
  private busy = false;
  private busyW = 0;
  private time = 0;
  private reachL = 0;
  private handPos = new THREE.Vector3();
  private gripPulse = 0;
  private slump = 0;
  private slumpTarget = 0;
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private s = new THREE.Vector3();
  private w = new THREE.Vector3();
  private g = new THREE.Vector3();
  private leanVec = new THREE.Vector3();

  constructor(eller: EllerTheme) {
    this.root.name = 'oyuncu-kolu';
    const skin = this.track(new THREE.MeshStandardMaterial({ color: eller.renk, roughness: 0.62, metalness: 0 }));
    const fabric = grimeTexture(19);
    if (fabric) {
      fabric.repeat.set(1, 3);
      this.textures.push(fabric);
    }
    const sleeve = this.track(
      new THREE.MeshStandardMaterial({
        color: eller.kolRengi ?? DEFAULT_SLEEVE,
        roughness: 0.88,
        metalness: 0,
        map: fabric ?? null,
      }),
    );
    const cuffColor = new THREE.Color(eller.kolRengi ?? DEFAULT_SLEEVE).multiplyScalar(0.7);
    const cuff = this.track(new THREE.MeshStandardMaterial({ color: cuffColor, roughness: 0.95, metalness: 0 }));

    this.arm = new IKArm({
      upperLength: UPPER,
      lowerLength: LOWER,
      upperRadius: [1.0, 0.82],
      lowerRadius: [0.82, 0.62],
      sleeve,
      radialSegments: 16,
      upperBackExtension: 4,
    });
    this.arm.addBand('lower', 0.97, 0.55, cuff, 1.08);
    this.arm.addBand('lower', 0.5, 0.06, cuff, 1.02);
    this.root.add(this.arm.group);

    this.hand = buildArticulatedHand(
      {
        skin,
        palm: [1.7, 0.62, 1.75],
        fingers: [
          { x: -0.6, lengths: [0.72, 0.45, 0.36], radius: 0.19, closed: [0.6, 0.7, 0.45], splay: 0.08 },
          { x: -0.2, lengths: [0.78, 0.5, 0.38], radius: 0.2, closed: [0.58, 0.7, 0.45], splay: 0.0 },
          { x: 0.2, lengths: [0.74, 0.47, 0.36], radius: 0.19, closed: [1.15, 1.25, 0.8], splay: -0.05 },
          { x: 0.58, lengths: [0.6, 0.38, 0.3], radius: 0.17, closed: [1.25, 1.3, 0.9], splay: -0.12 },
        ],
        thumb: { lengths: [0.55, 0.45], radius: 0.22 },
        wrist: { radius: 0.62, length: 1.1 },
        radialSegments: 10,
        palmTilt: 0.12,
      },
      this.geos,
    );
    this.hand.root.name = 'oyuncu-eli';
    this.layout = playerArmLayout(PLAYER_CAMERA.position, PLAYER_CAMERA.target);
    this.handPos.copy(this.layout.rest);
    this.update(0, 0);
  }

  private track<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  /**
   * Kamera değişince omuz ve dinlenme noktasını yeniden hesaplar. Değerler kökün uzayındadır:
   * görünüm çevrildiğinde kök π döndürülür, kamera yine beyaz taraftaki hâliyle verilir.
   */
  configure(cameraPos: THREE.Vector3, lookTarget: THREE.Vector3, fov?: number, aspect?: number): void {
    this.layout = playerArmLayout(cameraPos, lookTarget, fov, aspect);
    if (!this.busy) this.handPos.copy(this.layout.rest);
  }

  get shoulder(): THREE.Vector3 {
    return this.layout.shoulder.clone();
  }

  /** Dinlenme noktası (dünya). Kök döndürülmüşse (görünüm çevrilince) onunla birlikte döner. */
  restPoint(): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.root.localToWorld(this.layout.rest.clone());
  }

  lookAt(): void {
    // Oyuncunun başı yok; bakışı kamera belirler.
  }

  setHandBusy(busy: boolean): void {
    this.busy = busy;
  }

  react(ev: CharacterEvent): void {
    // Oyuncunun eli yalnızca küçük tepkiler verir: kazanınca yumruk, kaybedince gevşer.
    if (ev === 'won' || ev === 'took-piece' || ev === 'gave-check') this.gripPulse = 1;
    if (ev === 'lost') this.slumpTarget = 1;
    if (ev === 'draw' || ev === 'won') this.slumpTarget = 0;
  }

  update(dt: number, now: number): void {
    void now;
    const d = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    this.time += d;
    const t = this.time;
    this.busyW = damp(this.busyW, this.busy ? 1 : 0, 6, d);
    this.gripPulse = damp(this.gripPulse, 0, 1.6, d);
    this.slump = damp(this.slump, this.slumpTarget, 1.5, d);
    const L = this.layout;
    const root = this.root;
    root.updateMatrixWorld(true);

    // Hedef (kök uzayında)
    const target = this.v;
    if (this.busy) {
      worldPositionOf(this.hand.root, target);
      root.worldToLocal(target);
      if (![target.x, target.y, target.z].every(Number.isFinite)) target.copy(L.rest);
      this.handPos.copy(target);
    } else {
      const rest = this.v2.copy(L.rest);
      rest.y += 0.08 * Math.sin(t * 1.6) - 0.6 * this.slump;
      rest.x += 0.05 * Math.sin(t * 0.7);
      this.handPos.set(
        damp(this.handPos.x, rest.x, 7, d),
        damp(this.handPos.y, rest.y, 7, d),
        damp(this.handPos.z, rest.z, 7, d),
      );
      target.copy(this.handPos);
      this.hand.setGrip(0.25 + 0.75 * smooth01(this.gripPulse * 1.4) - 0.2 * this.slump);
    }

    // Elin yönü
    const heading = this.w.subVectors(target, L.shoulder).setY(0);
    if (heading.lengthSq() < 1e-6) heading.set(-0.5, 0, -1);
    heading.normalize();
    const reachQ = handBasis(pitchedForward(heading, 0.55, this.g), UP, 0.3, this.q2);
    const idleQ = handBasis(pitchedForward(IDLE_HEADING, 0.35 + 0.3 * this.slump, this.g), UP, 0.2, this.q);
    idleQ.slerp(reachQ, this.busyW);
    const wrist = this.g.copy(this.hand.wristOffset).applyQuaternion(idleQ).add(target);

    // Uzak hedefte omuz öne kayar (gövde eğilir); gereken en az kayma bulunur.
    // Hedef soldaysa gövde o yana da eğilir.
    const side = THREE.MathUtils.clamp(this.v2.subVectors(wrist, L.shoulder).dot(L.right) * 0.3, -4, 0);
    const leanVec = this.leanVec.copy(L.lean).addScaledVector(L.right, side);
    const shoulderAt = (k: number) => this.s.copy(L.shoulder).addScaledVector(leanVec, k);
    let need = 0;
    if (shoulderAt(0).distanceTo(wrist) > REACH_LIMIT) {
      let lo = 0;
      let hi = 1;
      if (shoulderAt(1).distanceTo(wrist) > REACH_LIMIT) need = 1;
      else {
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (shoulderAt(mid).distanceTo(wrist) > REACH_LIMIT) lo = mid;
          else hi = mid;
        }
        need = hi;
      }
    }
    this.reachL = Math.max(need, damp(this.reachL, need, 3, d));
    const shoulder = shoulderAt(this.reachL);

    this.arm.solve(shoulder, wrist, POLE);
    const grip = this.w.copy(this.hand.wristOffset).applyQuaternion(idleQ).negate().add(this.arm.wrist);
    const worldQ = root.getWorldQuaternion(this.q2).multiply(idleQ);
    if (!this.busy || grip.distanceTo(target) > 1e-4) {
      setWorldPose(this.hand.root, root.localToWorld(grip), worldQ);
    } else {
      setWorldPose(this.hand.root, worldPositionOf(this.hand.root, this.s), worldQ);
    }
    root.updateMatrixWorld(true);
    this.hand.root.updateMatrixWorld(true);
  }

  dispose(): void {
    this.hand.root.removeFromParent();
    this.root.removeFromParent();
    this.arm.dispose();
    this.geos.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.textures) t.dispose();
    this.textures = [];
    disposeTree(this.root);
    disposeTree(this.hand.root);
    this.mats = [];
  }
}

const UP = new THREE.Vector3(0, 1, 0);
/** Dinlenmede parmaklar tahtaya, hafifçe sola doğru bakar. */
const IDLE_HEADING = new THREE.Vector3(-0.55, 0, -1).normalize();
/** Dirsek dışarı (sağa) ve aşağı bakar. */
const POLE = new THREE.Vector3(1, -0.7, 0.35);

export type PlayerArmCharacter = Character & {
  configure(cameraPos: THREE.Vector3, lookTarget: THREE.Vector3, fov?: number, aspect?: number): void;
  readonly shoulder: THREE.Vector3;
};

/** Oyuncunun kolunu kurar. Sahne `hand.root`u doğrudan sahneye ekler. */
export function createPlayerArm(eller: EllerTheme): PlayerArmCharacter {
  return new PlayerArm(eller);
}

/** Kolu kameraya göre yeniden yerleştirir (kısayol). */
export function placePlayerArm(
  arm: PlayerArmCharacter,
  cameraPos: THREE.Vector3,
  lookTarget: THREE.Vector3,
  fov?: number,
  aspect?: number,
): void {
  arm.configure(cameraPos, lookTarget, fov, aspect);
}
