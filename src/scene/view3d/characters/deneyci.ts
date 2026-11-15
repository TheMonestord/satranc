import * as THREE from 'three';
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
  type HandStyle,
} from './rig';
import { filterGrillTexture, grimeTexture, hazardTexture, patchTexture, seeded } from './textures';

/*
 * Deneyci — gaz maskeli, sarı-siyah koruyucu giysili, kambur oturan rakip.
 * Yerel uzay: kök (0,0,0) tahtanın üst yüzü yüksekliğinde, göğsün altındaki noktadır; karakter +z'ye
 * (tahtaya) bakar, sağ eli -x tarafındadır. Sahne kökü OPPONENT_ROOT ile yerleştirir.
 */

/**
 * Rakibin kökünün önerilen yeri: tahtanın siyah tarafında, tahtaya (+z) bakar; dönüş gerekmez.
 * Gövde masa yüksekliğinde yerel z≈0,4'e kadar uzanır; 10,6 yarıçaplı masanın kenarına girmemesi için Z ≤ -11,1.
 */
export const OPPONENT_ROOT = { position: new THREE.Vector3(0, 0, -11.2), rotationY: 0 } as const;

/** Karakteri tahtanın karşı tarafına yerleştirir. */
export function placeOpponent(c: Character): void {
  c.root.position.copy(OPPONENT_ROOT.position);
  c.root.rotation.set(0, OPPONENT_ROOT.rotationY, 0);
  c.root.updateMatrixWorld(true);
}

/** Masa üstünün yüksekliği (table.ts ile uyumlu). */
const TABLE_TOP = -0.29;
/** Oyuncunun gözü (dünya, görünüm çevrilmemişken); "oyuncuya bak" tepkileri buraya bakar. */
export const PLAYER_EYE = new THREE.Vector3(0, 12.5, 11.5);
/** Aynı göz, karakterin yerel uzayında: karakter masanın hangi yanına oturursa otursun oyuncuya bakar. */
const PLAYER_EYE_LOCAL = PLAYER_EYE.clone().sub(OPPONENT_ROOT.position);

const UPPER = 5.5;
const LOWER = 5.0;
const PELVIS = new THREE.Vector3(0, -4.0, -3.0);
/** Oda zemini (room.ts FLOOR_Y ile aynı). */
const FLOOR_Y = -14;
/** Baldır boyu (diz → ayak bileği) */
const SHIN = 8.0;
const BASE_LEAN = 0.2;
const CHEST_HUNCH = 0.28;
/** Kolun ulaşabildiği en uzak bilek mesafesi (tam açılmayı göstermemek için biraz kısa). */
const REACH_LIMIT = (UPPER + LOWER) * 0.975;

interface HandPose {
  pos: THREE.Vector3;
  /** Parmakların yatay yönü */
  heading: THREE.Vector3;
  /** Parmakların aşağı eğimi (radyan) */
  pitch: number;
  roll: number;
  grip: number;
}

const pose = (x: number, y: number, z: number, hx: number, hz: number, pitch: number, roll: number, grip: number): HandPose => ({
  pos: new THREE.Vector3(x, y, z),
  heading: new THREE.Vector3(hx, 0, hz).normalize(),
  pitch,
  roll,
  grip,
});

/** Sağ elin dinlenme pozu (yerel). Kavrama noktası tahtanın yanında, masa üstünde. */
export const DENEYCI_REST_LOCAL = new THREE.Vector3(-5.2, -0.75, 7.6);
const REST_R = pose(-5.2, -0.75, 7.6, 0.7, 1, 0.1, 0.1, 0.2);
const REST_L = pose(5.2, -0.75, 7.6, -0.7, 1, 0.1, -0.1, 0.2);

function copyPose(dst: HandPose, src: HandPose): HandPose {
  dst.pos.copy(src.pos);
  dst.heading.copy(src.heading);
  dst.pitch = src.pitch;
  dst.roll = src.roll;
  dst.grip = src.grip;
  return dst;
}
function blendPose(dst: HandPose, src: HandPose, w: number): void {
  if (w <= 0) return;
  dst.pos.lerp(src.pos, w);
  dst.heading.lerp(src.heading, w).normalize();
  dst.pitch += (src.pitch - dst.pitch) * w;
  dst.roll += (src.roll - dst.roll) * w;
  dst.grip += (src.grip - dst.grip) * w;
}
const mirrorPose = (p: HandPose): HandPose =>
  pose(-p.pos.x, p.pos.y, p.pos.z, -p.heading.x, p.heading.z, p.pitch, -p.roll, p.grip);

/** Tepki kanalları: her tepki bunlara ağırlığıyla katkı yapar. */
interface Channels {
  lean: number;
  twist: number;
  back: number;
  rise: number;
  shrug: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  lookPlayer: number;
  tap: number;
  handL: Array<{ pose: HandPose; w: number }>;
  handR: Array<{ pose: HandPose; w: number }>;
}
const emptyChannels = (): Channels => ({
  lean: 0,
  twist: 0,
  back: 0,
  rise: 0,
  shrug: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  lookPlayer: 0,
  tap: 0,
  handL: [],
  handR: [],
});

interface ReactionDef {
  duration: number;
  attack: number;
  release: number;
  /** t: başlangıçtan beri saniye; w: zarf ağırlığı */
  apply(t: number, w: number, ch: Channels): void;
}

// Tepkilerde kullanılan el pozları
const STEEPLE_L = pose(0.75, 3.6, 5.0, -0.25, 1, -1.15, -1.35, 0.1);
const STEEPLE_R = mirrorPose(STEEPLE_L);
const SPREAD_L = pose(5.2, 1.9, 6.2, 0.1, 1, 0.1, -2.5, 0.05);
const SPREAD_R = mirrorPose(SPREAD_L);
const SLUMP_L = pose(4.0, -0.8, 8.4, -0.25, 1, 0.05, -0.25, 0.0);
const SLUMP_R = mirrorPose(SLUMP_L);
const FLINCH_L = pose(5.8, 1.6, 5.4, -0.35, 1, 0.1, -0.2, 0.85);
const FLINCH_R = mirrorPose(FLINCH_L);
const PRESS_L = pose(4.7, -0.6, 8.6, -0.5, 1, 0.12, -0.1, 0.0);
const PRESS_R = mirrorPose(PRESS_L);
const FIST_L = pose(5.2, -0.3, 7.2, -0.6, 1, 0.3, -0.5, 1);
const TAP_L = pose(5.1, -0.55, 7.7, -0.7, 1, 0.22, -0.1, 0.25);

const REACTIONS: Record<Exclude<CharacterEvent, 'think-end'>, ReactionDef> = {
  'think-start': {
    duration: Infinity,
    attack: 0.9,
    release: 0.7,
    apply(t, w, ch) {
      ch.headPitch += w * (0.32 + 0.05 * Math.sin(t * 0.7));
      ch.headRoll += w * (0.16 + 0.05 * Math.sin(t * 0.43));
      ch.headYaw += w * 0.08 * Math.sin(t * 0.31);
      ch.lean += w * 0.06;
      ch.tap += w;
      ch.handL.push({ pose: TAP_L, w });
    },
  },
  'lost-piece': {
    duration: 1.3,
    attack: 0.07,
    release: 0.9,
    apply(t, w, ch) {
      const shake = Math.exp(-t * 3) * Math.sin(t * 38) * 0.05;
      ch.back -= w * 1.0;
      ch.lean -= w * 0.2;
      ch.shrug += w * 0.55;
      ch.headPitch -= w * 0.3;
      ch.headRoll -= w * 0.1 + shake;
      ch.headYaw += shake;
      ch.handL.push({ pose: FLINCH_L, w: w * 0.8 });
      ch.handR.push({ pose: FLINCH_R, w: w * 0.8 });
    },
  },
  'took-piece': {
    duration: 1.6,
    attack: 0.2,
    release: 0.5,
    apply(t, w, ch) {
      ch.headPitch += w * 0.2 * Math.max(0, Math.sin(t * Math.PI * 2.2));
      ch.headRoll += w * 0.1;
      ch.lean += w * 0.05;
      ch.lookPlayer += w * 0.7;
    },
  },
  'gave-check': {
    duration: 2.6,
    attack: 0.55,
    release: 0.8,
    apply(t, w, ch) {
      ch.lean += w * 0.3;
      ch.back += w * 0.7;
      ch.headPitch -= w * 0.1;
      ch.headRoll += w * (0.2 + 0.04 * Math.sin(t * 5));
      ch.lookPlayer += w;
      ch.handL.push({ pose: PRESS_L, w });
      ch.handR.push({ pose: PRESS_R, w });
    },
  },
  'in-check': {
    duration: 2.0,
    attack: 0.18,
    release: 0.8,
    apply(_t, w, ch) {
      ch.back -= w * 0.7;
      ch.lean -= w * 0.14;
      ch.headRoll -= w * 0.3;
      ch.headPitch += w * 0.08;
      ch.shrug += w * 0.3;
      ch.handL.push({ pose: FIST_L, w });
    },
  },
  won: {
    duration: 6.5,
    attack: 1.4,
    release: 1.6,
    apply(t, w, ch) {
      ch.lean -= w * 0.18;
      ch.back -= w * 0.4;
      ch.headPitch += w * 0.14 * Math.sin(Math.max(0, t - 1.2) * 1.9);
      ch.headRoll += w * 0.1;
      ch.lookPlayer += w;
      ch.handL.push({ pose: STEEPLE_L, w });
      ch.handR.push({ pose: STEEPLE_R, w });
    },
  },
  lost: {
    duration: 7,
    attack: 1.3,
    release: 2.0,
    apply(t, w, ch) {
      ch.lean += w * 0.32;
      ch.shrug -= w * 0.55;
      ch.headPitch += w * (0.75 + 0.03 * Math.sin(t * 0.8));
      ch.headRoll += w * 0.22;
      ch.handL.push({ pose: SLUMP_L, w });
      ch.handR.push({ pose: SLUMP_R, w });
    },
  },
  draw: {
    duration: 2.4,
    attack: 0.45,
    release: 0.8,
    apply(t, w, ch) {
      const bump = Math.sin(Math.min(1, t / 1.2) * Math.PI);
      ch.shrug += w * (0.4 + 0.7 * bump);
      ch.headRoll += w * 0.28;
      ch.lean -= w * 0.05;
      ch.lookPlayer += w * 0.8;
      ch.handL.push({ pose: SPREAD_L, w });
      ch.handR.push({ pose: SPREAD_R, w });
    },
  },
};

interface ActiveReaction {
  ev: Exclude<CharacterEvent, 'think-end'>;
  t: number;
  /** Bitirilmek istendiğinde süre buradan başlayarak söner. */
  releaseAt: number;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

class Deneyci implements Character {
  readonly id = 'deneyci';
  readonly root = new THREE.Group();
  readonly hand: ArticulatedHand;

  private geos = new GeoCache();
  private mats: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private chest = new THREE.Group();
  private chestShell!: THREE.Group;
  private shoulderR = new THREE.Group();
  private shoulderL = new THREE.Group();
  private neck = new THREE.Group();
  private shins: THREE.Group[] = [];
  private head = new THREE.Group();
  private armR: IKArm;
  private armL: IKArm;
  private handL: ArticulatedHand;
  private lensMat!: THREE.MeshPhysicalMaterial;
  private glints: THREE.Mesh[] = [];

  private time = 0;
  private busy = false;
  private busyW = 0;
  private lookTarget: THREE.Vector3 | null = null;
  private reactions: ActiveReaction[] = [];
  private headYaw = 0;
  private headPitch = 0.3;
  private headRoll = 0;
  private reachLean = 0;
  private chLean = 0;
  private chBack = 0;
  private handPosR = REST_R.pos.clone();
  private handPosL = REST_L.pos.clone();
  private curR = copyPose(pose(0, 0, 0, 0, 1, 0, 0, 0), REST_R);
  private curL = copyPose(pose(0, 0, 0, 0, 1, 0, 0, 0), REST_L);
  private rnd = seeded(42);
  private nextTilt = 4;
  private tilt = { t: -10, dir: 1 };
  private nextBlink = 2.5;
  private blinkT = -10;
  private nextFidget = 5;
  private fidgetT = -10;

  constructor() {
    this.root.name = 'deneyci';
    const M = this.materials();

    // ---- Gövde hiyerarşisi ----
    this.hips.position.copy(PELVIS);
    this.root.add(this.hips);
    this.hips.add(this.spine);
    this.spine.rotation.order = 'YXZ';
    this.chest.position.set(0, 5.0, 0.1);
    this.spine.add(this.chest);
    this.buildLegsAndChair(M);
    this.buildTorso(M);
    this.neck.position.set(0, 6.0, 0.9);
    this.neck.rotation.x = 0.12;
    this.chest.add(this.neck);
    this.head.position.set(0, 2.0, 0.55);
    this.head.rotation.order = 'YXZ';
    this.neck.add(this.head);
    this.buildHead(M);

    // ---- Kollar ----
    const armStyle = {
      upperLength: UPPER,
      lowerLength: LOWER,
      upperRadius: [1.3, 1.05] as [number, number],
      lowerRadius: [1.05, 0.92] as [number, number],
      sleeve: M.suit,
      radialSegments: 16,
    };
    this.armR = new IKArm(armStyle);
    this.armL = new IKArm(armStyle);
    for (const arm of [this.armR, this.armL]) {
      // Yansıtıcı şeritler, dirsek kırışıkları ve eldiven ağzı
      arm.addBand('upper', 0.45, 0.42, M.reflect, 1.04);
      arm.addBand('lower', 0.42, 0.38, M.reflect, 1.04);
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(1.08, 0.95, 1.9, 18, 1, true).translate(0, LOWER - 0.95 + 0.25, 0),
        M.rubber,
      );
      cuff.castShadow = true;
      arm.attach('lower', cuff);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.12, 6, 20).rotateX(Math.PI / 2), M.rubber);
      lip.position.y = LOWER - 1.65;
      arm.attach('lower', lip);
      arm.addBand('lower', 0.62, 0.42, M.hazard, 1.03);
      this.root.add(arm.group);
    }

    // ---- Eller (kalın lastik eldiven) ----
    const glove = (mirror: boolean): HandStyle => ({
      skin: M.glove,
      palm: [1.9, 0.82, 1.75],
      fingers: [
        { x: -0.66, lengths: [0.62, 0.44, 0.38], radius: 0.27, closed: [0.6, 0.7, 0.45], splay: 0.08 },
        { x: -0.22, lengths: [0.68, 0.47, 0.4], radius: 0.28, closed: [0.58, 0.7, 0.45], splay: 0.0 },
        { x: 0.22, lengths: [0.64, 0.44, 0.37], radius: 0.27, closed: [1.0, 1.15, 0.8], splay: -0.05 },
        { x: 0.64, lengths: [0.52, 0.36, 0.32], radius: 0.24, closed: [1.25, 1.3, 0.9], splay: -0.12 },
      ],
      thumb: { lengths: [0.52, 0.46], radius: 0.3 },
      mirror,
      wrist: { radius: 0.9, length: 1.2, mat: M.glove },
      radialSegments: 9,
      palmTilt: 0.12,
    });
    this.hand = buildArticulatedHand(glove(false), this.geos);
    this.hand.root.name = 'deneyci-el';
    this.handL = buildArticulatedHand(glove(true), this.geos);
    this.handL.root.name = 'deneyci-sol-el';
    this.root.add(this.handL.root);
    this.hand.setGrip(REST_R.grip);
    this.handL.setGrip(REST_L.grip);

    this.update(0, 0);
  }

  // ------------------------------------------------------------------ malzemeler
  private materials() {
    const grime = grimeTexture(7);
    const hazard = hazardTexture();
    const patch = patchTexture('D-07');
    const grill = filterGrillTexture();
    for (const t of [grime, hazard, patch, grill]) if (t) this.textures.push(t);
    const track = <T extends THREE.Material>(m: T): T => {
      this.mats.push(m);
      return m;
    };
    const M = {
      suit: track(
        new THREE.MeshStandardMaterial({ color: '#dcae1c', roughness: 0.58, metalness: 0.0, map: grime ?? null }),
      ),
      suitDark: track(new THREE.MeshStandardMaterial({ color: '#1c1b1a', roughness: 0.7, metalness: 0.0 })),
      rubber: track(
        new THREE.MeshPhysicalMaterial({
          color: '#141414',
          roughness: 0.42,
          metalness: 0,
          clearcoat: 0.7,
          clearcoatRoughness: 0.35,
        }),
      ),
      glove: track(
        new THREE.MeshPhysicalMaterial({
          color: '#1a1c19',
          roughness: 0.38,
          metalness: 0,
          clearcoat: 0.85,
          clearcoatRoughness: 0.28,
        }),
      ),
      reflect: track(
        new THREE.MeshStandardMaterial({ color: '#c9cdca', roughness: 0.28, metalness: 0.55, emissive: '#3a3d3b' }),
      ),
      hazard: track(
        new THREE.MeshStandardMaterial({
          color: hazard ? '#ffffff' : '#d8a812',
          map: hazard ?? null,
          roughness: 0.5,
          metalness: 0.05,
        }),
      ),
      metal: track(new THREE.MeshStandardMaterial({ color: '#8d9291', roughness: 0.3, metalness: 0.85 })),
      darkMetal: track(new THREE.MeshStandardMaterial({ color: '#33363a', roughness: 0.45, metalness: 0.7 })),
      filter: track(new THREE.MeshStandardMaterial({ color: '#46523a', roughness: 0.5, metalness: 0.35 })),
      grill: track(
        new THREE.MeshStandardMaterial({
          color: grill ? '#ffffff' : '#2a2f24',
          map: grill ?? null,
          roughness: 0.55,
          metalness: 0.4,
        }),
      ),
      patch: track(
        new THREE.MeshStandardMaterial({ color: patch ? '#ffffff' : '#e4dfcf', map: patch ?? null, roughness: 0.8 }),
      ),
      glint: track(new THREE.MeshBasicMaterial({ color: '#f3fff0' })),
      eye: track(new THREE.MeshBasicMaterial({ color: '#d6ff9a' })),
      chair: track(new THREE.MeshStandardMaterial({ color: '#2b2d2f', roughness: 0.5, metalness: 0.65 })),
    };
    this.lensMat = track(
      new THREE.MeshPhysicalMaterial({
        color: '#14211b',
        roughness: 0.06,
        metalness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        emissive: '#83d86a',
        emissiveIntensity: 0.3,
      }),
    );
    return M;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** Ölçeklenmiş birim küre (elipsoit). */
  private ellipsoid(
    mat: THREE.Material,
    parent: THREE.Object3D,
    pos: [number, number, number],
    radii: [number, number, number],
    seg: [number, number] = [24, 16],
  ): THREE.Mesh {
    const m = this.mesh(this.geos.get(`sph-${seg[0]}-${seg[1]}`, () => new THREE.SphereGeometry(1, seg[0], seg[1])), mat, parent);
    m.position.set(...pos);
    m.scale.set(...radii);
    return m;
  }

  /** Elipsoidin yüzeyini saran bant (enlem dilimi). theta: 0 tepe, π dip. */
  private band(
    mat: THREE.Material,
    parent: THREE.Object3D,
    pos: [number, number, number],
    radii: [number, number, number],
    theta0: number,
    thetaLen: number,
    grow = 1.012,
    phi: [number, number] = [0, Math.PI * 2],
  ): THREE.Mesh {
    const key = `band-${theta0.toFixed(3)}-${thetaLen.toFixed(3)}-${phi[0].toFixed(3)}-${phi[1].toFixed(3)}`;
    const m = this.mesh(
      this.geos.get(key, () =>
        new THREE.SphereGeometry(1, Math.max(4, Math.ceil(phi[1] * 6)), Math.max(2, Math.ceil(thetaLen * 14)), phi[0], phi[1], theta0, thetaLen),
      ),
      mat,
      parent,
      false,
    );
    m.position.set(...pos);
    m.scale.set(radii[0] * grow, radii[1] * grow, radii[2] * grow);
    return m;
  }

  // ------------------------------------------------------------------ gövde
  private buildTorso(M: ReturnType<Deneyci['materials']>): void {
    // Karın/bel: bol giysi
    const belly: [number, number, number] = [3.35, 3.1, 2.75];
    this.ellipsoid(M.suit, this.spine, [0, 2.2, 0.35], belly);
    // Bel lastiği
    this.band(M.suitDark, this.spine, [0, 2.2, 0.35], belly, 1.95, 0.22, 1.015);

    // Göğüs kabuğu: nefesle ölçeklenen grup
    const shell = new THREE.Group();
    this.chest.add(shell);
    this.chestShell = shell;
    const chestR: [number, number, number] = [4.0, 3.5, 2.9];
    this.ellipsoid(M.suit, shell, [0, 2.6, 0.35], chestR);
    // Kamburluk: sırtın üstünde şişkin bir tümsek
    this.ellipsoid(M.suit, shell, [0, 3.9, -1.0], [3.5, 2.7, 2.5]);
    // Göğüsteki yansıtıcı şerit
    this.band(M.reflect, shell, [0, 2.6, 0.35], chestR, 1.62, 0.2, 1.01);
    // Önde siyah fermuar kapağı
    this.band(M.suitDark, shell, [0, 2.6, 0.35], chestR, 0.8, 1.9, 1.02, [Math.PI / 2 - 0.09, 0.18]);
    // Göğüs etiketi (karakterin solunda, +x)
    const patch = this.band(M.patch, shell, [0, 2.6, 0.35], chestR, 0.95, 0.42, 1.025, [Math.PI / 2 - 0.68, 0.5]);
    patch.name = 'gogus-etiketi';
    // Omuz örtüsü (başlığın eteği): siyah lastik yaka
    const yoke = this.mesh(
      this.geos.get('yoke', () => new THREE.CylinderGeometry(2.0, 3.4, 1.6, 24, 1, true, 0.8, Math.PI * 2 - 1.6)),
      M.suit,
      shell,
    );
    yoke.position.set(0, 5.6, 0.55);
    yoke.rotation.x = 0.18;

    // Omuzlar: kolun başladığı yer; omuz topu kolun ucunu örter
    this.shoulderR.position.set(-3.45, 4.4, 0.15);
    this.shoulderL.position.set(3.45, 4.4, 0.15);
    for (const s of [this.shoulderR, this.shoulderL]) {
      this.chest.add(s);
      const ball = this.ellipsoid(M.suit, s, [0, 0.1, 0], [1.45, 1.35, 1.4], [18, 12]);
      ball.name = 'omuz';
      this.band(M.reflect, s, [0, 0.1, 0], [1.45, 1.35, 1.4], 0.6, 0.2, 1.02);
    }
  }

  private buildLegsAndChair(M: ReturnType<Deneyci['materials']>): void {
    const cap = (r: number, len: number) =>
      this.geos.get(`leg-${r}-${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 12));
    const legs = new THREE.Group();
    legs.name = 'bacaklar';
    this.hips.add(legs);
    for (const s of [-1, 1]) {
      // Uyluk öne, masanın altına uzanır; baldır dizden yere iner.
      const thigh = this.mesh(cap(1.45, 6.2), M.suit, legs);
      thigh.position.set(s * 1.8, -0.9, 3.4);
      thigh.rotation.x = Math.PI / 2 + 0.08;
      const knee = new THREE.Group();
      knee.position.set(s * 1.9, -1.4, 6.9);
      legs.add(knee);
      const shin = new THREE.Group();
      knee.add(shin);
      const shinMesh = this.mesh(cap(1.15, SHIN - 1.15), M.suit, shin);
      shinMesh.position.y = -SHIN / 2;
      this.band(M.reflect, shin, [0, -SHIN * 0.55, 0], [1.15, SHIN / 2, 1.15], 1.45, 0.12, 1.03);
      const boot = this.mesh(this.geos.get('boot', () => new THREE.BoxGeometry(2.3, 1.3, 3.6)), M.rubber, shin);
      boot.position.set(0, -SHIN - 0.1, 0.7);
      this.shins.push(shin);
    }
    // Basit metal sandalye; ayakları yere değer
    const chair = new THREE.Group();
    chair.name = 'sandalye';
    chair.position.set(0, PELVIS.y, PELVIS.z);
    this.root.add(chair);
    const seatY = -1.55;
    const legLen = seatY + PELVIS.y - FLOOR_Y;
    const seat = this.mesh(this.geos.get('seat', () => new THREE.BoxGeometry(6.6, 0.4, 6.0)), M.chair, chair);
    seat.position.set(0, seatY, 0.6);
    const leg = this.geos.get('chairleg', () => new THREE.CylinderGeometry(0.18, 0.18, legLen, 8));
    for (const [x, z] of [
      [-3.0, -2.1],
      [3.0, -2.1],
      [-3.0, 3.3],
      [3.0, 3.3],
    ]) {
      const l = this.mesh(leg, M.chair, chair);
      l.position.set(x, seatY - legLen / 2, z);
    }
    const post = this.geos.get('chairpost', () => new THREE.CylinderGeometry(0.18, 0.18, 7.5, 8));
    for (const x of [-3.0, 3.0]) {
      const p = this.mesh(post, M.chair, chair);
      p.position.set(x, seatY + 3.6, -2.5);
      p.rotation.x = -0.12;
    }
    const back = this.mesh(this.geos.get('chairback', () => new THREE.BoxGeometry(6.2, 2.4, 0.3)), M.chair, chair);
    back.position.set(0, seatY + 5.6, -2.95);
    back.rotation.x = -0.12;
  }

  private buildHead(M: ReturnType<Deneyci['materials']>): void {
    const h = this.head;
    // Başlık (hood): giysiyle aynı sarı; tepesi hafif sivri, arkası ve yanları omuzlara sarkar
    // Arkaya uzun: kukuleta biçimi
    const hood: [number, number, number] = [2.15, 2.1, 2.65];
    const hoodMesh = this.ellipsoid(M.suit, h, [0, 0.15, -0.8], hood);
    hoodMesh.name = 'baslik';
    // Başlık eteği: başla omuzlar arasındaki bol kumaş
    const drape = this.mesh(
      this.geos.get('drape', () => new THREE.CylinderGeometry(1.75, 2.75, 2.6, 22, 1, true, 1.0, Math.PI * 2 - 2.0)),
      M.suit,
      h,
    );
    drape.position.set(0, -1.7, -1.05);
    drape.rotation.x = -0.3;
    // Başlıktaki yansıtıcı şerit ve kayışlar (yüzeye oturan dilimler)
    this.band(M.reflect, h, [0, 0.15, -0.8], hood, 0.95, 0.17, 1.012, [Math.PI * 0.08, Math.PI * 0.84]);
    this.band(M.suitDark, h, [0, 0.15, -0.8], hood, 1.25, 0.1, 1.018, [Math.PI * 1.05, Math.PI * 0.9]);
    this.band(M.suitDark, h, [0, 0.15, -0.8], hood, 1.85, 0.1, 1.018, [Math.PI * 1.1, Math.PI * 0.8]);
    // Yüz açıklığının lastik kenarı
    const rim = this.mesh(this.geos.get('hoodrim', () => new THREE.TorusGeometry(1.7, 0.2, 10, 30)), M.suitDark, h);
    rim.position.set(0, -0.05, 1.22);
    rim.scale.set(1, 1.12, 0.8);

    // Maske gövdesi: parlak siyah lastik, öne doğru sivrilen burun
    this.ellipsoid(M.rubber, h, [0, -0.2, 1.25], [1.72, 1.8, 1.2]);
    this.ellipsoid(M.rubber, h, [0, -0.85, 1.9], [1.05, 0.95, 0.95], [18, 12]);

    // Gözlükler: iki yuvarlak cam, metal çerçeve, hafif dışa bakar (böcek gibi)
    const housingGeo = this.geos.get('gog-housing', () =>
      new THREE.CylinderGeometry(0.7, 0.8, 0.5, 22).rotateX(Math.PI / 2),
    );
    const rimGeo = this.geos.get('gog-rim', () => new THREE.TorusGeometry(0.66, 0.13, 8, 24));
    const lensGeo = this.geos.get('gog-lens', () => {
      const g = new THREE.SphereGeometry(0.68, 22, 10, 0, Math.PI * 2, 0, 0.8);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, -0.68 * Math.cos(0.8));
      return g;
    });
    const glintGeo = this.geos.get('gog-glint', () => new THREE.SphereGeometry(0.085, 8, 6));
    const eyeGeo = this.geos.get('gog-eye', () => new THREE.SphereGeometry(0.11, 8, 6));
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.8, 0.55, 1.98);
      g.rotation.set(-0.1, s * 0.32, 0);
      h.add(g);
      this.mesh(housingGeo, M.rubber, g);
      const r = this.mesh(rimGeo, M.metal, g);
      r.position.z = 0.27;
      const lens = this.mesh(lensGeo, this.lensMat, g, false);
      lens.position.z = 0.26;
      // Camın arkasında belli belirsiz göz parıltısı
      const eye = this.mesh(eyeGeo, M.eye, g, false);
      eye.position.set(-s * 0.06, -0.05, 0.1);
      eye.scale.set(1, 0.65, 0.5);
      const glint = this.mesh(glintGeo, M.glint, g, false);
      glint.position.set(-0.2, 0.24, 0.42);
      glint.scale.set(1.3, 0.8, 0.5);
      this.glints.push(glint, eye);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const bolt = this.mesh(
          this.geos.get('bolt', () => new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6).rotateX(Math.PI / 2)),
          M.darkMetal,
          g,
          false,
        );
        bolt.position.set(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0.38);
      }
    }
    const bridge = this.mesh(this.geos.get('bridge', () => new THREE.BoxGeometry(0.38, 0.2, 0.3)), M.metal, h);
    bridge.position.set(0, 0.6, 2.28);

    // Burunda konuşma zarı: kısa metal kutu ve ızgara
    const voice = new THREE.Group();
    voice.position.set(0, -1.0, 2.62);
    voice.rotation.x = 0.35;
    h.add(voice);
    this.mesh(
      this.geos.get('voice', () => new THREE.CylinderGeometry(0.5, 0.58, 0.45, 18).rotateX(Math.PI / 2)),
      M.darkMetal,
      voice,
    );
    const vg = this.mesh(this.geos.get('voice-grill', () => new THREE.CircleGeometry(0.46, 18)), M.grill, voice, false);
    vg.position.z = 0.23;

    // Filtre: sol yanakta (karakterin solu, +x) öne-aşağı bakan iri kutu; maskeye kişilik veren asimetri
    const f = new THREE.Group();
    f.position.set(1.0, -0.95, 1.95);
    f.rotation.set(0.55, 0.75, 0);
    h.add(f);
    this.mesh(
      this.geos.get('filt-neck', () => new THREE.CylinderGeometry(0.5, 0.6, 0.55, 18).rotateX(Math.PI / 2)),
      M.rubber,
      f,
    ).position.z = 0.1;
    const can = this.mesh(
      this.geos.get('filt-can', () => new THREE.CylinderGeometry(0.8, 0.8, 0.95, 22).rotateX(Math.PI / 2)),
      M.filter,
      f,
    );
    can.position.z = 0.8;
    const ringGeo = this.geos.get('filt-ring', () => new THREE.TorusGeometry(0.82, 0.065, 6, 22));
    for (const z of [0.42, 0.8, 1.18]) {
      const ring = this.mesh(ringGeo, M.darkMetal, f, false);
      ring.position.z = z;
    }
    const cap = this.mesh(this.geos.get('filt-cap', () => new THREE.CircleGeometry(0.78, 22)), M.grill, f, false);
    cap.position.z = 1.28;
    // Sağ yanakta küçük nefes valfi
    const v = this.mesh(
      this.geos.get('valve', () => new THREE.CylinderGeometry(0.34, 0.42, 0.42, 14)),
      M.darkMetal,
      h,
    );
    v.position.set(-1.25, -0.85, 1.6);
    v.rotation.set(0, 0.5, Math.PI / 2);
  }

  // ------------------------------------------------------------------ arayüz
  restPoint(): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.root.localToWorld(REST_R.pos.clone());
  }

  lookAt(target: THREE.Vector3 | null): void {
    if (target && [target.x, target.y, target.z].every(Number.isFinite)) {
      this.lookTarget = (this.lookTarget ?? new THREE.Vector3()).copy(target);
    } else {
      this.lookTarget = null;
    }
  }

  setHandBusy(busy: boolean): void {
    this.busy = busy;
  }

  react(ev: CharacterEvent): void {
    if (ev === 'think-end') {
      for (const r of this.reactions) if (r.ev === 'think-start') r.releaseAt = Math.min(r.releaseAt, r.t);
      return;
    }
    // Aynı tepki yeniden gelirse baştan başlar; oyun sonu tepkileri diğerlerini söndürür.
    const final = ev === 'won' || ev === 'lost' || ev === 'draw';
    for (const r of this.reactions) {
      if (r.ev === ev || final) r.releaseAt = Math.min(r.releaseAt, r.t);
    }
    this.reactions.push({ ev, t: 0, releaseAt: Infinity });
  }

  private weight(r: ActiveReaction, def: ReactionDef): number {
    const a = smooth01(def.attack > 0 ? r.t / def.attack : 1);
    const end = Math.min(def.duration - def.release, r.releaseAt);
    const rel = smooth01(def.release > 0 ? (r.t - end) / def.release : r.t >= end ? 1 : 0);
    return a * (1 - rel);
  }

  update(dt: number, now: number): void {
    void now;
    const d = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    this.time += d;
    const t = this.time;

    // ---- Tepkiler ----
    const ch = emptyChannels();
    this.reactions = this.reactions.filter((r) => {
      r.t += d;
      const def = REACTIONS[r.ev];
      const end = Math.min(def.duration - def.release, r.releaseAt);
      if (r.t > end + def.release) return false;
      def.apply(r.t, this.weight(r, def), ch);
      return true;
    });

    // ---- Boşta: kendiliğinden küçük hareketler ----
    if (t > this.nextTilt) {
      this.tilt = { t, dir: this.rnd() < 0.5 ? -1 : 1 };
      this.nextTilt = t + 5 + this.rnd() * 6;
    }
    const tiltK = (t - this.tilt.t) / 1.8;
    const tiltW = tiltK >= 0 && tiltK <= 1 ? Math.sin(tiltK * Math.PI) : 0;
    if (t > this.nextBlink) {
      this.blinkT = t;
      this.nextBlink = t + 2.5 + this.rnd() * 4;
    }
    if (t > this.nextFidget) {
      this.fidgetT = t;
      this.nextFidget = t + 4 + this.rnd() * 5;
    }

    const breath = Math.sin(t * ((Math.PI * 2) / 3.8));
    const breathIn = 0.5 + 0.5 * breath;

    this.busyW = damp(this.busyW, this.busy ? 1 : 0, 6, d);
    this.chLean = damp(this.chLean, ch.lean, 10, d);
    this.chBack = damp(this.chBack, ch.back, 10, d);

    // ---- Sağ elin hedefi ----
    const root = this.root;
    root.updateMatrixWorld(true);
    const targetR = _v1;
    if (this.busy) {
      worldPositionOf(this.hand.root, targetR);
      root.worldToLocal(targetR);
      if (![targetR.x, targetR.y, targetR.z].every(Number.isFinite)) targetR.copy(REST_R.pos);
    }
    // Boştaki ve tepkideki poz
    const idleR = copyPose(this.curR, REST_R);
    idleR.pos.y += 0.05 * breath;
    for (const h of ch.handR) blendPose(idleR, h.pose, h.w);
    const idleL = copyPose(this.curL, REST_L);
    idleL.pos.y += 0.05 * breath;
    for (const h of ch.handL) blendPose(idleL, h.pose, h.w);
    if (!this.busy) {
      this.handPosR.x = damp(this.handPosR.x, idleR.pos.x, 7, d);
      this.handPosR.y = damp(this.handPosR.y, idleR.pos.y, 7, d);
      this.handPosR.z = damp(this.handPosR.z, idleR.pos.z, 7, d);
      targetR.copy(this.handPosR);
    } else {
      this.handPosR.copy(targetR);
    }
    this.handPosL.x = damp(this.handPosL.x, idleL.pos.x, 7, d);
    this.handPosL.y = damp(this.handPosL.y, idleL.pos.y, 7, d);
    this.handPosL.z = damp(this.handPosL.z, idleL.pos.z, 7, d);

    // Sağ elin yönü: hamlede taşa yukarıdan, boşta pozdan
    const qR = _q1;
    {
      const heading = _v2.set(targetR.x - this.shoulderR.position.x * 0.6, 0, targetR.z - 1.0);
      if (heading.lengthSq() < 1e-6) heading.set(0, 0, 1);
      heading.normalize();
      const reachQ = handBasis(pitchedForward(heading, 0.6, _v3), UP, 0.1, _q2);
      handBasis(pitchedForward(idleR.heading, idleR.pitch, _v3), UP, idleR.roll, qR);
      qR.slerp(reachQ, this.busyW);
    }
    if (!this.busy) this.hand.setGrip(idleR.grip);
    const qL = handBasis(pitchedForward(idleL.heading, idleL.pitch, _v3), UP, idleL.roll, new THREE.Quaternion());
    this.handL.setGrip(idleL.grip);

    const wristR = _v3.copy(this.hand.wristOffset).applyQuaternion(qR).add(targetR);
    const wristRTarget = this.wristRTarget.copy(wristR);

    // ---- Gövde pozu (uzanma eğilmesi dahil) ----
    const styleLean = this.busyW * THREE.MathUtils.clamp((wristRTarget.z - 5) / 9, 0, 0.55);
    const setBody = (L: number) => {
      // Uzanma: sandalyeden yarı doğrulur, öne eğilir, gövdesini döndürür ve omzunu uzatır.
      const lean = BASE_LEAN + this.chLean + L * 0.5 + 0.012 * breath;
      this.spine.rotation.x = lean;
      const across = THREE.MathUtils.clamp(wristRTarget.x / 6, -1, 1);
      this.spine.rotation.y = ch.twist + L * (0.2 + 0.25 * across);
      this.chest.rotation.x = CHEST_HUNCH - L * 0.12;
      // Kalça masaya doğru kaymaz (karın masanın kenarına girmesin); yerine yarı doğrulur.
      this.hips.position.set(PELVIS.x, PELVIS.y + ch.rise + L * 1.6, PELVIS.z + this.chBack + L * 0.3);
      const shrug = ch.shrug * 0.9 + 0.08 * breathIn;
      this.shoulderR.position.set(-3.45 + L * 0.3, 4.4 + shrug + L * 0.3, 0.15 + L * 1.6);
      this.shoulderL.position.set(3.45, 4.4 + shrug, 0.15);
      root.updateMatrixWorld(true);
    };
    const shoulderLocal = (s: THREE.Object3D, out: THREE.Vector3) =>
      root.worldToLocal(s.getWorldPosition(out));
    const distAt = (L: number) => {
      setBody(L);
      return shoulderLocal(this.shoulderR, this.tmpS).distanceTo(wristRTarget);
    };
    let L = styleLean;
    if (this.busyW > 0.01 || this.busy) {
      if (distAt(L) > REACH_LIMIT) {
        // Ulaşmak için gereken en az eğilme (ikiye bölme)
        let lo = L;
        let hi = 1;
        if (distAt(hi) > REACH_LIMIT) {
          L = hi;
        } else {
          for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            if (distAt(mid) > REACH_LIMIT) lo = mid;
            else hi = mid;
          }
          L = hi;
        }
      }
    }
    // Gerekli eğilme anında uygulanır, fazlası yumuşakça geri gelir.
    this.reachLean = Math.max(L, damp(this.reachLean, L, 3, d));
    setBody(this.reachLean);
    // Ayaklar yerde kalsın: baldır diz yüksekliğine göre uzar/kısalır.
    for (const shin of this.shins) {
      const kneeY = root.worldToLocal(shin.getWorldPosition(this.tmpW)).y;
      shin.scale.y = THREE.MathUtils.clamp((kneeY - FLOOR_Y - 0.75) / SHIN, 0.6, 1.4);
    }
    if (this.shins.length) root.updateMatrixWorld(true);

    // Nefes: göğüs kabuğu hafifçe şişer
    this.chestShell.scale.set(1 + 0.012 * breathIn, 1 + 0.018 * breathIn, 1 + 0.03 * breathIn);

    // ---- Baş ve bakış ----
    this.updateHead(d, t, ch, tiltW);

    // ---- Kollar ----
    const sR = shoulderLocal(this.shoulderR, this.tmpS);
    const poleR = _v2.set(-1, -0.75, -0.55);
    this.armR.solve(sR, wristRTarget, poleR);
    // El, kolun ulaştığı bileğe bağlanır; ulaşılabilen hedefte bu tam olarak hedef noktasıdır.
    const gripR = this.tmpG.copy(this.hand.wristOffset).applyQuaternion(qR).negate().add(this.armR.wrist);
    const worldQ = root.getWorldQuaternion(this.tmpQ).multiply(qR);
    if (!this.busy || gripR.distanceTo(targetR) > 1e-4) {
      setWorldPose(this.hand.root, root.localToWorld(gripR), worldQ);
    } else {
      // Animasyonun yazdığı konuma dokunma, yalnızca dönüşü ayarla.
      setWorldPose(this.hand.root, worldPositionOf(this.hand.root, this.tmpW), worldQ);
    }

    // Sol el: masada; düşünürken parmaklarıyla tıklatır.
    const sL = shoulderLocal(this.shoulderL, this.tmpS);
    const wristL = _v1.copy(this.handL.wristOffset).applyQuaternion(qL).add(this.handPosL);
    this.armL.solve(sL, wristL, _v2.set(1, -0.75, -0.55));
    const gripL = this.tmpG.copy(this.handL.wristOffset).applyQuaternion(qL).negate().add(this.armL.wrist);
    this.handL.root.position.copy(gripL);
    this.handL.root.quaternion.copy(qL);
    this.updateFingers(t, ch.tap);

    // ---- Gözlük parıltısı ve göz kırpma ----
    const bk = (t - this.blinkT) / 0.22;
    const blink = bk >= 0 && bk <= 1 ? 1 - Math.sin(bk * Math.PI) : 1;
    this.lensMat.emissiveIntensity = (0.22 + 0.08 * Math.sin(t * 1.3)) * blink;
    for (let i = 0; i < this.glints.length; i++) {
      // Çift indeksler cam parıltısı, tekler göz.
      this.glints[i].visible = i % 2 === 0 || blink > 0.3;
    }

    root.updateMatrixWorld(true);
    this.hand.root.updateMatrixWorld(true);
  }

  private tmpS = new THREE.Vector3();
  private tmpG = new THREE.Vector3();
  private tmpW = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private wristRTarget = new THREE.Vector3();
  private lookLocal = new THREE.Vector3();
  private playerLocal = new THREE.Vector3();

  private updateHead(d: number, t: number, ch: Channels, tiltW: number): void {
    const root = this.root;
    // Bakılacak nokta (yerel): verilen hedef, yoksa tahtanın ortası; tepkiler oyuncunun yüzüne çeker.
    if (this.lookTarget) this.lookLocal.copy(this.lookTarget);
    else root.localToWorld(this.lookLocal.set(0, 0.5, 9.5));
    root.localToWorld(this.playerLocal.copy(PLAYER_EYE_LOCAL));
    const look = this.lookLocal.lerp(this.playerLocal, THREE.MathUtils.clamp(ch.lookPlayer, 0, 1));
    // Boyun uzayında yön
    const dir = this.neck.worldToLocal(look.clone()).sub(this.head.position);
    let yaw = Math.atan2(dir.x, dir.z);
    let pitch = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z));
    if (!Number.isFinite(yaw)) yaw = 0;
    if (!Number.isFinite(pitch)) pitch = 0.3;
    yaw = THREE.MathUtils.clamp(yaw, -0.85, 0.85);
    pitch = THREE.MathUtils.clamp(pitch, -0.55, 0.75);
    this.headYaw = damp(this.headYaw, yaw, 4.5, d);
    this.headPitch = damp(this.headPitch, pitch, 4.5, d);
    const sway = 0.035 * Math.sin(t * 0.9) + 0.02 * Math.sin(t * 2.3 + 1);
    const roll = ch.headRoll + 0.25 * tiltW * this.tilt.dir + 0.02 * Math.sin(t * 0.6);
    this.headRoll = damp(this.headRoll, roll, 6, d);
    this.head.rotation.set(
      THREE.MathUtils.clamp(this.headPitch + ch.headPitch + 0.02 * Math.sin(t * 1.65), -0.7, 1.1),
      THREE.MathUtils.clamp(this.headYaw + ch.headYaw + sway, -1, 1),
      THREE.MathUtils.clamp(this.headRoll, -0.6, 0.6),
    );
  }

  private updateFingers(t: number, tap: number): void {
    // Düşünürken serçeden işarete sırayla vurur; boşta arada bir işaret parmağıyla iki kez tıklatır.
    const fk = (t - this.fidgetT) / 0.7;
    const fidget = fk >= 0 && fk <= 1 ? Math.max(0, Math.sin(fk * Math.PI * 4)) * 0.45 : 0;
    for (let i = 0; i < 4; i++) {
      const phase = t * 7.5 - (3 - i) * 0.9;
      const cycle = phase % (Math.PI * 2 * 1.6);
      const lift = cycle < Math.PI ? Math.sin(cycle) : 0;
      const tapLift = tap * lift * 0.75;
      this.handL.setFingerLift(i, tapLift + (i === 0 ? fidget * (1 - tap) : 0));
    }
  }

  dispose(): void {
    this.hand.root.removeFromParent();
    this.root.removeFromParent();
    this.armR.dispose();
    this.armL.dispose();
    this.geos.dispose();
    for (const t of this.textures) t.dispose();
    for (const m of this.mats) m.dispose();
    // Yukarıda atılmamış başka bir şey kalmışsa
    disposeTree(this.root);
    disposeTree(this.hand.root);
    this.textures = [];
    this.mats = [];
  }
}

export function createDeneyci(): Character {
  return new Deneyci();
}
