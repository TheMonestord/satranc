import * as THREE from 'three';
import type { Hand } from '../hand';
import type { Character, CharacterEvent } from './types';
import { buildParkChair, type ChairOptions } from './chair';
import { SkinnedRig, type GltfLike, type ReachTuning } from './gltfRig';
import { dampTo, smoothstep, worldQuaternion } from './ik';

/*
 * GLB dosyasından yüklenen, Mixamo iskeletli, canlandırmalı rakip karakter.
 * Kurucu hemen döner; model arka planda yüklenir ve hazır olunca köke eklenir. O zamana kadar
 * `update` ve `restPoint` varsayılan değerlerle çalışır, `hand.root` baştan vardır.
 *
 * Koordinatlar karakterin kökünün yerel uzayındadır: karakter +z'ye (tahtaya) bakar, sağ eli -x tarafındadır.
 * Kök sahnede (0,0,-11,2) noktasındadır; tahtanın yakın kenarı yerel z≈6,75, uzak sırası z≈14,7'dedir.
 */

/** Masa üstü (table.ts ile uyumlu) ve yarıçapı */
const TABLE_TOP = -0.29;
/** Hamleye giriş/çıkış karışımının süresi (s) */
const BUSY_BLEND = 0.25;
const TABLE_RADIUS = 10.6;
const BOARD_HALF = 4.45;
const FLOOR_Y = -14;
/** Oyuncunun gözü, karakter -z tarafında otururken kökün yerel uzayında */
const PLAYER_EYE_LOCAL = new THREE.Vector3(0, 12.5, 22.7);
const BOARD_CENTER_LOCAL = new THREE.Vector3(0, 1.2, 12.5);
/** Başın en çok ne kadar aşağı bakabileceği (rad, yataydan) */
const MIN_HEAD_ELEVATION = -0.4;
/** Kucaktaki ellerin masanın üstüne kaldırılma miktarı (dünya birimi) */
const LAP_LIFT = 3.6;

export interface GltfCharacterOptions {
  id: string;
  /** GLB adresi */
  url?: string;
  /** Önceden çözümlenmiş model (testler veya önbellek dışı kullanım); verilirse karakter ona sahip olur */
  gltf?: GltfLike;
  /** Yükleyici (varsayılan: GLTFLoader) */
  loader?: (url: string) => Promise<GltfLike>;
  /** Model metresi başına dünya birimi */
  scale?: number;
  /** Kalçanın kökteki yeri: y yüksekliği, z ileri-geri */
  hips?: { y: number; z: number };
  /** Kalçadan oturağın üstüne mesafe (dünya) */
  seatDrop?: number;
  headScale?: number;
  handScale?: number;
  reach?: Partial<ReachTuning>;
  /** Dinlenen elin avuç ortasının masadaki yeri (kök yereli) */
  rest?: THREE.Vector3;
  /** Dirseğin kıvrılacağı yön (kök yereli) */
  pole?: THREE.Vector3;
  /** Sandalye; false ise yok */
  chair?: Partial<ChairOptions> | false;
  /** Model hazır olunca (hata olursa da çağrılmaz) */
  onReady?: () => void;
  /** Rastgelelik kaynağı (testler için) */
  random?: () => number;
}

const DEFAULT_REACH: ReachTuning = {
  maxPitch: 0.75,
  maxTwist: 0.35,
  maxRise: 1.6,
  maxForward: 1.2,
  maxClavicle: 0.3,
  comfort: 0.93,
};

// ---------- Yükleme ve önbellek ----------

interface CacheEntry {
  promise: Promise<GltfLike>;
  refs: number;
  evictTimer?: ReturnType<typeof setTimeout>;
}
const cache = new Map<string, CacheEntry>();

async function defaultLoader(url: string): Promise<GltfLike> {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  return new GLTFLoader().loadAsync(url);
}

/** Modeli paylaşılan önbellekten alır (her alış bir `releaseGltf` ile bırakılmalı). */
export function acquireGltf(url: string, loader: (url: string) => Promise<GltfLike> = defaultLoader): Promise<GltfLike> {
  let e = cache.get(url);
  if (!e) {
    const entry: CacheEntry = { promise: loader(url), refs: 0 };
    entry.promise.catch(() => {
      if (cache.get(url) === entry) cache.delete(url);
    });
    cache.set(url, entry);
    e = entry;
  }
  e.refs++;
  clearTimeout(e.evictTimer);
  return e.promise;
}

export function releaseGltf(url: string): void {
  const e = cache.get(url);
  if (!e) return;
  e.refs--;
  if (e.refs > 0) return;
  // Yeni oyunda, menüden dönüşte veya 2D↔3D geçişinde model yeniden indirilmesin diye kısa süre saklanır.
  e.evictTimer = setTimeout(() => {
    if (cache.get(url) !== e || e.refs > 0) return;
    evict(url, e);
  }, CACHE_GRACE_MS);
}

/** Önbellekte kullanılmayan bir modelin kalma süresi. */
let CACHE_GRACE_MS = 60_000;

/** Testler için: kullanılmayan modelin önbellekte bekleme süresini değiştirir. */
export function setGltfCacheGraceMs(ms: number): void {
  CACHE_GRACE_MS = ms;
}

function evict(url: string, e: CacheEntry): void {
  cache.delete(url);
  // Son kullanıcı da bıraktı: paylaşılan geometri, malzeme ve dokular atılır.
  e.promise.then((g) => disposeObject(g.scene)).catch(() => {});
}

/** Önbellekteki model sayısı (testler için). */
export function gltfCacheSize(): number {
  return cache.size;
}

/** Modelin kopyası: kemikler ve iskeletler yeniden bağlanır; geometri ve malzemeler paylaşılır. */
export async function cloneGltf(g: GltfLike): Promise<GltfLike> {
  const { clone } = await import('three/addons/utils/SkeletonUtils.js');
  return { scene: clone(g.scene), animations: g.animations };
}

export function disposeObject(root: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    geos.add(m.geometry);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat) mats.add(mat);
  });
  for (const g of geos) g.dispose();
  for (const m of mats) {
    for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
    m.dispose();
  }
}

// ---------- Tepki planları ----------

interface Segment {
  clip: string;
  /** Klipteki başlangıç (s) */
  start?: number;
  /** Oynatma süresi (s); yoksa klibin sonuna kadar */
  duration?: number;
  loop?: boolean;
  /** Gövdeye karışma ağırlığı */
  weight?: number;
}
interface Plan {
  kind: 'think' | 'once';
  segments: Segment[];
  lookPlayer: boolean;
}

const pick = <T>(arr: T[], rnd: () => number): T => arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];

function planFor(ev: CharacterEvent, rnd: () => number): Plan | null {
  switch (ev) {
    case 'think-start':
      return { kind: 'think', segments: [{ clip: pick(['dusunme-1', 'dusunme-2'], rnd), loop: true }], lookPlayer: false };
    case 'took-piece':
      return { kind: 'once', segments: [{ clip: pick(['begeni', 'alkis-2'], rnd) }], lookPlayer: true };
    case 'lost-piece':
      return { kind: 'once', segments: [{ clip: pick(['onaylamama', 'kizgin'], rnd) }], lookPlayer: true };
    case 'gave-check':
      return { kind: 'once', segments: [{ clip: 'konusma', start: 2 + rnd() * 34, duration: 3 + rnd() * 2 }], lookPlayer: true };
    case 'in-check':
      return { kind: 'once', segments: [{ clip: 'sasirma', weight: 0.85 }], lookPlayer: false };
    case 'won':
      return { kind: 'once', segments: [{ clip: 'sevinc' }, { clip: 'alkis-1', duration: 4 }], lookPlayer: true };
    case 'lost':
      return { kind: 'once', segments: [{ clip: 'yumruk' }, { clip: 'onaylamama' }], lookPlayer: true };
    case 'draw':
      return { kind: 'once', segments: [{ clip: 'onaylamama' }], lookPlayer: true };
    default:
      return null;
  }
}

const IDLE_CLIPS = ['bekleme-1', 'bekleme-2', 'bekleme-3'];
const FADE_IN = 0.45;
const FADE_OUT = 0.6;
const CROSS = 0.5;

class GltfCharacter implements Character {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly hand: Hand;
  private opts: GltfCharacterOptions;
  private reachT: ReachTuning;
  private rest: THREE.Vector3;
  private pole: THREE.Vector3;
  private rig: SkinnedRig | null = null;
  private gltf: GltfLike | null = null;
  private ownsGltf = false;
  private chair: THREE.Group | null = null;
  private disposed = false;
  private rnd: () => number;

  private base: THREE.AnimationMixer | null = null;
  private reactMixer: THREE.AnimationMixer | null = null;
  private idleActions: THREE.AnimationAction[] = [];
  private idleIndex = 0;
  private idleSwitchAt = 8;
  private clips = new Map<string, THREE.AnimationClip>();
  private trackedBy = new Map<string, Set<string>>();
  private allBones: THREE.Bone[] = [];
  private snapQ: THREE.Quaternion[] = [];
  private snapHips = new THREE.Vector3();

  // tepki durumu
  private thinking = false;
  private plan: Plan | null = null;
  private segIndex = 0;
  private segAction: THREE.AnimationAction | null = null;
  private segEnd = 0;
  private reactW = 0;
  private reactTarget = 0;
  private reactWeight = 1;
  private queue: CharacterEvent[] = [];
  private queueDelay = 0;
  /** Tepki sırasında oyuncuya bakış */
  private lookPlayer = 0;

  // el ve kol
  private busy = false;
  private busyW = 0;
  private busyT = 0;
  private grip = 0;
  private bodyM = 0;
  private stretch = 1;
  private startOffset = new THREE.Vector3();
  private startDecay = 0;
  private lastGrip = new THREE.Vector3();
  private time = 0;

  // bakış
  private lookTarget: THREE.Vector3 | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private glanceUntil = 0;
  private glanceNext = 4;

  // geçici
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private q3 = new THREE.Quaternion();
  private tRest = new THREE.Vector3();
  private tLift = new THREE.Vector3();
  private tAnim = new THREE.Vector3();
  private tTarget = new THREE.Vector3();
  private tBusy = new THREE.Vector3();
  private qRest = new THREE.Quaternion();
  private qAnim = new THREE.Quaternion();
  private qTarget = new THREE.Quaternion();
  private qBusy = new THREE.Quaternion();
  private qRoot = new THREE.Quaternion();
  private qLeft = new THREE.Quaternion();
  private tLeft = new THREE.Vector3();
  private tLeft2 = new THREE.Vector3();

  constructor(opts: GltfCharacterOptions) {
    this.opts = opts;
    this.id = opts.id;
    this.rnd = opts.random ?? Math.random;
    this.root.name = `rakip-${opts.id}`;
    this.reachT = { ...DEFAULT_REACH, ...opts.reach };
    this.rest = (opts.rest ?? new THREE.Vector3(-4.6, 0.35, 4.2)).clone();
    this.pole = (opts.pole ?? new THREE.Vector3(-0.75, -0.55, -0.35)).clone().normalize();
    const handRoot = new THREE.Group();
    handRoot.name = `${opts.id}-eli`;
    this.hand = {
      root: handRoot,
      setGrip: (amount: number) => {
        this.grip = THREE.MathUtils.clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
      },
    };
    const hips = opts.hips ?? { y: -3.4, z: -0.6 };
    if (opts.chair !== false) {
      const seatY = hips.y - (opts.seatDrop ?? 1.6);
      this.chair = buildParkChair({ seatY, seatZ: hips.z - 1.4, floorY: FLOOR_Y, ...opts.chair });
      this.root.add(this.chair);
    }
    this.root.updateMatrixWorld(true);
    handRoot.position.copy(this.restPoint());

    if (opts.gltf) {
      this.ownsGltf = true;
      this.attach(opts.gltf);
    } else if (opts.url) {
      const url = opts.url;
      acquireGltf(url, opts.loader ?? defaultLoader)
        .then(async (g) => {
          if (this.disposed) {
            releaseGltf(url);
            return;
          }
          const copy = await cloneGltf(g);
          if (this.disposed) {
            releaseGltf(url);
            return;
          }
          this.attach(copy);
          this.opts.onReady?.();
        })
        .catch((err) => console.warn(`Karakter yüklenemedi (${opts.id}).`, err));
    }
  }

  /** Model hazır mı */
  get ready(): boolean {
    return this.rig !== null;
  }

  private attach(g: GltfLike): void {
    this.gltf = g;
    const scale = this.opts.scale ?? 17;
    const hips = this.opts.hips ?? { y: -3.4, z: -0.6 };
    // Kalçanın modeldeki yüksekliği bekleme-1 klibinden okunur.
    const hipsTrack = g.animations
      .find((c) => c.name === 'bekleme-1')
      ?.tracks.find((t) => /Hips\.position$/.test(t.name));
    const hipsModelY = hipsTrack ? hipsTrack.values[1] * 0.01 : 0.5;
    const offset = new THREE.Vector3(0, hips.y - hipsModelY * scale, hips.z);
    const rig = new SkinnedRig(g, { scale, offset, headScale: this.opts.headScale, handScale: this.opts.handScale, reach: this.reachT });
    this.rig = rig;
    this.root.add(rig.wrapper);
    for (const c of g.animations) {
      this.clips.set(c.name, c);
      this.trackedBy.set(c.name, new Set(c.tracks.map((t) => t.name.split('.')[0])));
    }
    rig.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.allBones.push(o as THREE.Bone);
    });
    this.snapQ = this.allBones.map(() => new THREE.Quaternion());

    this.base = new THREE.AnimationMixer(rig.model);
    this.reactMixer = new THREE.AnimationMixer(rig.model);
    this.idleActions = IDLE_CLIPS.map((n) => this.clips.get(n) ?? this.clips.get('oturus') ?? g.animations[0])
      .filter((c): c is THREE.AnimationClip => !!c)
      .map((c) => this.base!.clipAction(c));
    this.idleIndex = Math.floor(this.rnd() * this.idleActions.length);
    const first = this.idleActions[this.idleIndex];
    if (first) {
      first.play();
      first.time = this.rnd() * first.getClip().duration;
    }
    this.idleSwitchAt = 7 + this.rnd() * 8;
    if (this.thinking) this.startPlan(planFor('think-start', this.rnd)!);
    this.update(0, 0);
  }

  // ---------- Character ----------

  restPoint(): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    if (!this.rig) return this.root.localToWorld(this.rest.clone().setY(this.rest.y + 0.2));
    return this.restGrip(this.restHandQ(new THREE.Quaternion()), new THREE.Vector3());
  }

  /** Avucu masada dinlenen elin kavrama noktası (dünya). */
  private restGrip(handQ: THREE.Quaternion, out: THREE.Vector3): THREE.Vector3 {
    const palm = this.root.localToWorld(new THREE.Vector3().copy(this.rest).setY(TABLE_TOP + 0.05));
    return this.rig!.gripForPalm(palm, handQ, out);
  }

  lookAt(target: THREE.Vector3 | null): void {
    if (target && [target.x, target.y, target.z].every(Number.isFinite)) {
      this.lookTarget = (this.lookTarget ?? new THREE.Vector3()).copy(target);
    } else this.lookTarget = null;
  }

  setHandBusy(busy: boolean): void {
    if (busy === this.busy) return;
    this.busy = busy;
    if (busy) {
      // Elin o anki yeri ile canlandırmanın başladığı nokta arasındaki fark kısa sürede kapanır.
      this.root.updateMatrixWorld(true);
      this.startOffset.subVectors(this.lastGrip, this.hand.root.position);
      if (!this.rig || !Number.isFinite(this.startOffset.x) || this.startOffset.length() > 8) this.startOffset.set(0, 0, 0);
      this.startDecay = 1;
      // Hamle sırasında tepki oynamaz: süren tepki hızla söner.
      if (this.plan) this.reactTarget = 0;
    } else {
      this.queueDelay = 0.6;
    }
  }

  react(ev: CharacterEvent): void {
    if (this.disposed) return;
    if (ev === 'think-start') {
      this.thinking = true;
      if (!this.plan && !this.busy && this.rig) this.startPlan(planFor(ev, this.rnd)!);
      return;
    }
    if (ev === 'think-end') {
      this.thinking = false;
      if (this.plan?.kind === 'think') this.endPlan();
      return;
    }
    if (this.busy || !this.rig) {
      // Hamle bitince oynatılır; en fazla iki tepki bekler.
      this.queue.push(ev);
      if (this.queue.length > 2) this.queue.shift();
      return;
    }
    const plan = planFor(ev, this.rnd);
    if (plan) this.startPlan(plan);
  }

  private startPlan(plan: Plan): void {
    const react = this.reactMixer;
    if (!react) return;
    const prev = this.segAction;
    this.plan = plan;
    this.segIndex = 0;
    this.lookPlayer = plan.lookPlayer ? 1 : 0;
    this.playSegment(prev);
    this.reactTarget = 1;
  }

  private playSegment(prev: THREE.AnimationAction | null): void {
    const react = this.reactMixer!;
    const seg = this.plan!.segments[this.segIndex];
    const clip = this.clips.get(seg.clip);
    if (!clip) {
      this.endPlan();
      return;
    }
    const action = react.clipAction(clip);
    action.reset();
    action.setLoop(seg.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.time = seg.start ?? 0;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    const sameTracks = prev && prev !== action && this.sameTrackSet(prev.getClip().name, seg.clip);
    if (prev && prev !== action) {
      if (sameTracks && this.reactW > 0.05) prev.crossFadeTo(action, CROSS, false);
      else {
        prev.stop();
        // Farklı iz takımına geçiş: karışım ağırlığı baştan yükselsin.
        this.reactW = Math.min(this.reactW, 0.3);
      }
    }
    this.reactWeight = seg.weight ?? 1;
    const dur = seg.duration ?? clip.duration - (seg.start ?? 0);
    this.segAction = action;
    this.segEnd = seg.loop ? Infinity : this.time + Math.max(0.5, dur);
  }

  private sameTrackSet(a: string, b: string): boolean {
    const ta = this.trackedBy.get(a);
    const tb = this.trackedBy.get(b);
    if (!ta || !tb) return false;
    const hipsA = [...ta].some((n) => /Hips$/.test(n) && ta.has(n));
    const hipsB = [...tb].some((n) => /Hips$/.test(n) && tb.has(n));
    return hipsA === hipsB;
  }

  private endPlan(): void {
    // Düşünürken gelen tepki bitince düşünmeye dönülür.
    if (this.thinking && this.plan?.kind !== 'think' && !this.busy) {
      const prev = this.segAction;
      this.plan = planFor('think-start', this.rnd)!;
      this.segIndex = 0;
      this.lookPlayer = 0;
      this.playSegment(prev);
      this.reactTarget = 1;
      return;
    }
    this.reactTarget = 0;
    this.segEnd = Infinity;
  }

  private tickReactions(dt: number): void {
    // Sıradaki tepkiler
    if (!this.busy && this.queue.length) {
      this.queueDelay -= dt;
      if (this.queueDelay <= 0) {
        const ev = this.queue.shift()!;
        const plan = planFor(ev, this.rnd);
        if (plan) this.startPlan(plan);
      }
    }
    if (this.plan && this.reactTarget > 0 && this.time >= this.segEnd - FADE_OUT) {
      if (this.segIndex + 1 < this.plan.segments.length) {
        this.segIndex++;
        this.playSegment(this.segAction);
      } else {
        this.endPlan();
      }
    }
    if (this.busy) this.reactTarget = 0;
    const rate = this.reactTarget > this.reactW ? 1 / FADE_IN : 1 / FADE_OUT;
    const step = rate * dt * (this.busy ? 2 : 1);
    this.reactW =
      this.reactTarget > this.reactW ? Math.min(this.reactTarget, this.reactW + step) : Math.max(this.reactTarget, this.reactW - step);
    if (this.reactW <= 0 && this.reactTarget <= 0 && this.plan) {
      this.reactMixer?.stopAllAction();
      this.plan = null;
      this.segAction = null;
      this.lookPlayer = 0;
      if (this.thinking && !this.busy) this.startPlan(planFor('think-start', this.rnd)!);
    }
  }

  private tickIdle(): void {
    if (this.time < this.idleSwitchAt || this.idleActions.length < 2) return;
    const cur = this.idleActions[this.idleIndex];
    let next = Math.floor(this.rnd() * (this.idleActions.length - 1));
    if (next >= this.idleIndex) next++;
    const action = this.idleActions[next];
    action.reset();
    action.play();
    cur.crossFadeTo(action, 1.4, false);
    this.idleIndex = next;
    this.idleSwitchAt = this.time + 7 + this.rnd() * 9;
  }

  update(dt: number, now: number): void {
    void now;
    const d = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    this.time += d;
    this.root.updateMatrixWorld(true);
    const rig = this.rig;
    // Hamleye giriş/çıkış ~0,25 s'de yumuşakça karışır.
    this.busyT = THREE.MathUtils.clamp(this.busyT + (this.busy ? d : -d) / BUSY_BLEND, 0, 1);
    this.busyW = smoothstep(0, 1, this.busyT);
    if (!rig || !this.base || !this.reactMixer) {
      if (!this.busy) this.hand.root.position.copy(this.restPoint());
      return;
    }

    // 1. Canlandırma: boşta klipleri + tepki katmanı
    this.tickIdle();
    this.tickReactions(d);
    rig.resetPose();
    this.base.update(d);
    const rw = smoothstep(0, 1, this.reactW) * this.reactWeight;
    if (this.plan && rw > 1e-4) {
      this.allBones.forEach((b, i) => this.snapQ[i].copy(b.quaternion));
      this.snapHips.copy(rig.hips.position);
      this.reactMixer.update(d);
      this.allBones.forEach((b, i) => b.quaternion.copy(this.snapQ[i].slerp(b.quaternion, rw)));
      rig.hips.position.lerpVectors(this.snapHips, rig.hips.position, rw);
    } else if (this.plan) {
      this.reactMixer.update(d);
      this.allBones.forEach((b, i) => this.snapQ[i].copy(b.quaternion));
    }
    const reactClip = this.segAction?.getClip().name;
    rig.setTrackedFingers(reactClip && rw > 0.5 ? this.trackedBy.get(reactClip) ?? [] : []);
    rig.capture();

    // 2. Elin hedefi
    const root = this.root;
    const t = this.time;
    const restQ = this.restHandQ(this.qRest);
    const restW = this.restGrip(restQ, this.tRest);
    restW.x += 0.05 * Math.sin(t * 0.9);
    restW.z += 0.04 * Math.sin(t * 0.6 + 1);

    // Tepkide el canlandırmayı izler; masanın altına inerse masanın üstünde tutulur.
    const anim = rig.gripWorld(this.tAnim);
    const animQ = worldQuaternion(rig.hand, this.qAnim);
    const clamp = this.clampToTable(anim);
    animQ.slerp(restQ, clamp * 0.6);
    const target = this.tTarget.copy(restW).lerp(anim, rw);
    const handQ = this.qTarget.copy(restQ).slerp(animQ, rw);
    let weight = THREE.MathUtils.lerp(1, clamp, rw);
    if (this.busyW > 0) {
      const busyTarget = this.hand.root.getWorldPosition(this.tBusy);
      if (![busyTarget.x, busyTarget.y, busyTarget.z].every(Number.isFinite)) busyTarget.copy(restW);
      this.startDecay = dampTo(this.startDecay, 0, 9, d);
      busyTarget.addScaledVector(this.startOffset, this.startDecay);
      const reachQ = this.reachHandQ(busyTarget, restW, this.qBusy);
      target.lerp(busyTarget, this.busyW);
      handQ.slerp(reachQ, this.busyW);
      weight = THREE.MathUtils.lerp(weight, 1, this.busyW);
    }

    // 3. Gövde yardımı: hedef rahat erişimin ötesindeyse eğil, dön, kalk
    let need = 0;
    let stretch = 1;
    if (this.busyW > 0.001) {
      const base = 0.12 * this.busyW * smoothstep(3, 10, target.distanceTo(rig.shoulderWorld(this.v1)));
      const r = rig.reachNeed(target, handQ, base);
      need = r.body;
      stretch = r.stretch;
    }
    this.bodyM = need > this.bodyM ? need : dampTo(this.bodyM, need, 3.5, d);
    this.stretch = stretch > this.stretch ? stretch : dampTo(this.stretch, stretch, 4, d);
    rig.setStretch(this.stretch);
    const pole = this.v1.copy(this.pole).applyQuaternion(worldQuaternion(root, this.q3));
    rig.reach(target, handQ, weight, this.bodyM, pole);
    if (this.bodyM > 0.01) rig.lowerLegs(Math.min(1.2, this.reachT.maxRise * this.bodyM * 0.25));

    // Sol el: masada dinlenir; gövde öne eğilince biraz öne kayıp gövdeyi destekler.
    const left = rig.left;
    if (left) {
      const lq = this.restHandQ(this.qLeft, true);
      const palm = this.tLeft.set(-this.rest.x, TABLE_TOP + 0.05, this.rest.z + 1.6 * this.bodyM);
      root.localToWorld(palm);
      const lt = left.gripForPalm(palm, lq, this.tLeft2);
      lt.x += 0.04 * Math.sin(t * 0.7 + 2);
      const la = left.gripWorld(this.tAnim);
      const laq = worldQuaternion(left.hand, this.qAnim);
      const lc = this.clampToTable(la);
      laq.slerp(lq, lc * 0.6);
      lt.lerp(la, rw);
      lq.slerp(laq, rw);
      const lpole = this.v1.copy(this.pole).setX(-this.pole.x).applyQuaternion(worldQuaternion(root, this.q3));
      left.solve(lt, lq, THREE.MathUtils.lerp(1, lc, rw), lpole);
      left.fingers(0.15, (1 - rw) * 0.85);
    }

    // 4. Parmaklar: masada dinlenirken gevşek açık, hamlede açık ↔ kıstırma
    const restFingers = 1 - rw;
    const fw = Math.max(this.busyW, restFingers * 0.85);
    rig.fingers(THREE.MathUtils.lerp(0.18, this.grip, this.busyW), fw);

    // 5. Bakış
    this.updateLook(d);

    // 6. El kökü: hamle yokken kavrama noktasını izler
    rig.gripWorld(this.lastGrip);
    if (!this.busy && [this.lastGrip.x, this.lastGrip.y, this.lastGrip.z].every(Number.isFinite)) {
      this.hand.root.position.copy(this.lastGrip);
    }
    this.hand.root.updateMatrixWorld(true);
  }

  /** Masanın altına düşen noktayı masanın üstüne çıkarır; ne kadar düzeltildiğini (0..1) döner. */
  private clampToTable(p: THREE.Vector3): number {
    // Oturan karakterin kucak hizasındaki el hareketleri masanın altında kalırdı: hareket, yükseldikçe
    // azalan bir kaydırmayla masanın üstüne taşınır (alkış, yumruk vb. masanın üstünde görünür).
    const local = this.root.worldToLocal(this.tLift.copy(p));
    const lift = LAP_LIFT * (1 - smoothstep(-3.5, 3.0, local.y));
    const inside = local.z > -0.5 ? 1 : smoothstep(-2.5, -0.5, local.z);
    local.y += lift * inside;
    // Masanın içine giren nokta masanın önüne de çekilir
    this.root.localToWorld(local);
    p.copy(local);
    const r = Math.hypot(p.x, p.z);
    const onBoard = Math.abs(p.x) < BOARD_HALF && Math.abs(p.z) < BOARD_HALF;
    const top = (onBoard ? 0 : TABLE_TOP) + 0.45;
    let k = smoothstep(0, 0.8, lift * inside);
    if (r < TABLE_RADIUS + 0.6 && p.y < top) {
      k = Math.max(k, smoothstep(0, 1.2, top - p.y));
      p.y = top;
    }
    return k;
  }

  /** Dinlenen el: avuç masaya dönük, parmaklar tahtaya ve biraz içeri. */
  private restHandQ(out: THREE.Quaternion, left = false): THREE.Quaternion {
    const rootQ = worldQuaternion(this.root, this.qRoot);
    const sx = left ? -1 : 1;
    const f = new THREE.Vector3(0.38 * sx, -0.2, 1).normalize().applyQuaternion(rootQ);
    const palm = new THREE.Vector3(0.05 * sx, -1, 0.1).applyQuaternion(rootQ);
    const arm = left ? this.rig!.left! : this.rig!.right;
    return arm.handQuaternion(f, palm, out);
  }

  /** Taşa uzanan el: parmaklar taşa doğru aşağı eğik, avuç aşağı ve gövdeye dönük. */
  private reachHandQ(target: THREE.Vector3, rest: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
    const rig = this.rig!;
    const rootQ = worldQuaternion(this.root, new THREE.Quaternion());
    // Yön, göğsün biraz arkasındaki bir noktadan hedefe: yakın hedeflerde de kararlı.
    const from = this.root.localToWorld(new THREE.Vector3(-1.2, 0, -2.5));
    const h = new THREE.Vector3().subVectors(target, from).setY(0);
    if (h.lengthSq() < 1e-6) h.set(0, 0, 1).applyQuaternion(rootQ);
    h.normalize();
    const k = smoothstep(0.5, 3.5, target.distanceTo(rest));
    const pitch = THREE.MathUtils.lerp(0.2, 0.8, k);
    const f = h.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(new THREE.Vector3(0, -1, 0), Math.sin(pitch));
    const side = new THREE.Vector3(0, 1, 0).cross(h).normalize(); // gövdenin soluna
    // Avuç: aşağı ve geri; biraz da başparmak tarafı aşağı yuvarlanır
    const palm = new THREE.Vector3(0, -1, 0).addScaledVector(side, -0.25 * k);
    const q = rig.handQuaternion(f, palm, out);
    // Dinlenmedeki düz elden yumuşak geçiş
    return this.restHandQ(new THREE.Quaternion()).slerp(q, smoothstep(0, 1, k * 1.4));
  }

  private updateLook(dt: number): void {
    const rig = this.rig!;
    const t = this.time;
    if (t > this.glanceNext) {
      this.glanceUntil = t + 1.4 + this.rnd() * 1.6;
      this.glanceNext = this.glanceUntil + 2.5 + this.rnd() * 5;
    }
    const target = this.v2;
    let w = 0.55;
    if (this.busyW > 0.3) {
      target.copy(this.hand.root.position);
      w = 0.9;
    } else if (this.lookTarget) {
      target.copy(this.lookTarget);
      w = 0.85;
    } else if (this.lookPlayer > 0 || t < this.glanceUntil) {
      this.root.localToWorld(target.copy(PLAYER_EYE_LOCAL));
      w = this.plan && this.lookPlayer > 0 ? 0.7 : 0.6;
    } else {
      this.root.localToWorld(target.copy(BOARD_CENTER_LOCAL));
      w = this.plan ? 0.2 : 0.35;
    }
    if (this.plan?.kind === 'think') w *= 0.5;
    const head = rig.headWorld(this.v1);
    const dir = target.sub(head);
    const fwd = rig.headForwardWorld(this.v3);
    let yaw = Math.atan2(fwd.z * dir.x - fwd.x * dir.z, fwd.x * dir.x + fwd.z * dir.z);
    // Yukarı-aşağı bakış mutlak açıyla sınırlanır: eğilirken bile yüz oyuncuya dönük kalsın,
    // yalnızca saçın tepesi görünmesin.
    const fwdElev = Math.atan2(fwd.y, Math.hypot(fwd.x, fwd.z));
    const want = THREE.MathUtils.lerp(fwdElev, Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), w);
    let pitch = Math.max(want, MIN_HEAD_ELEVATION) - fwdElev;
    if (!Number.isFinite(yaw)) yaw = 0;
    if (!Number.isFinite(pitch)) pitch = 0;
    yaw = THREE.MathUtils.clamp(yaw, -0.9, 0.9) * w;
    pitch = THREE.MathUtils.clamp(pitch, -0.6, 0.95);
    this.lookYaw = dampTo(this.lookYaw, yaw, 4, dt);
    this.lookPitch = dampTo(this.lookPitch, pitch, 4, dt);
    rig.addLook(this.lookYaw, this.lookPitch);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hand.root.removeFromParent();
    this.root.removeFromParent();
    this.base?.stopAllAction();
    this.reactMixer?.stopAllAction();
    if (this.rig) {
      this.base?.uncacheRoot(this.rig.model);
      this.reactMixer?.uncacheRoot(this.rig.model);
      this.rig.dispose();
    }
    if (this.chair) disposeObject(this.chair);
    if (this.gltf) {
      if (this.ownsGltf) disposeObject(this.gltf.scene);
      else if (this.opts.url) releaseGltf(this.opts.url);
    }
    this.rig = null;
    this.gltf = null;
  }
}

/** GLB karakteri kurar; model arka planda yüklenir. */
export function createGltfCharacter(opts: GltfCharacterOptions): Character & { readonly ready: boolean } {
  return new GltfCharacter(opts);
}
