import * as THREE from 'three';
import type { Cue } from '../../audio/cues';
import type { Color, MoveEvent, PieceType, Square } from '../../core/types';
import { opposite } from '../../core/types';
import { squareToWorld } from '../view3d/table';
import type { AnimationClock } from './handAnimator';
import type { MoveAnimator, MoveAnimatorHost } from './types';
import { SETTLE_MS, settleSquash, squareDistance, travelEase, walkDuration, walkPose } from './walkStyles';

const REAL_CLOCK: AnimationClock = {
  now: () => performance.now(),
  frame: (cb) => {
    requestAnimationFrame(() => cb());
  },
};

/** Normal hızdaki süreler (ms). */
export const WALK_TIMINGS = {
  /** Alınan taşın devrilip kaybolması. */
  fall: 550,
  /** Saldıranın yolunun bu oranında alınan taşa çarpılır. */
  contactAt: 0.82,
  promote: 450,
  flinch: 600,
  topple: 1100,
  /** Efektlerin (toz halkası, parlama) ömrü. */
  effect: 500,
};

const UP = new THREE.Vector3(0, 1, 0);
const TRAIL_COUNT = 6;

/** Zaman çizelgesindeki bir iş: `start` anında başlar, `duration` sürer, `complete` sonucunu kesinleştirir. */
interface Track {
  start: number;
  duration: number;
  begin?(): void;
  update(k: number): void;
  complete(): void;
  begun: boolean;
  done: boolean;
}

function track(start: number, duration: number, parts: Pick<Track, 'update' | 'complete'> & { begin?(): void }): Track {
  return { start, duration, begun: false, done: false, ...parts };
}

const baseYaw = (color: Color) => (color === 'w' ? 0 : Math.PI);

function footstepCue(type: PieceType): Cue {
  switch (type) {
    case 'n':
      return 'jump';
    case 'r':
      return 'slide';
    case 'b':
    case 'q':
      return 'glide';
    default:
      return 'step';
  }
}

/**
 * Yürüyen taşlar modu: taşlar hedef kareye kendi karakterleriyle gider.
 * Piyon adımlar, at sıçrar, kale ağır ilerler, fil ışık iziyle süzülür, vezir dönerek kayar, şah ağırbaşlı yürür.
 */
export class WalkAnimator implements MoveAnimator {
  private running: { tracks: Track[]; startedAt: number; speed: number; resolve: () => void } | null = null;
  private effects = new THREE.Group();
  private ringGeo = new THREE.RingGeometry(0.3, 0.42, 32);
  private dotGeo = new THREE.SphereGeometry(0.09, 10, 8);

  constructor(
    private host: MoveAnimatorHost,
    private clock: AnimationClock = REAL_CLOCK,
  ) {
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  play(ev: MoveEvent, speed: number): Promise<void> {
    this.finishNow();
    return new Promise<void>((resolve) => {
      this.host.scene.add(this.effects);
      const tracks = this.buildTracks(ev);
      this.running = { tracks, startedAt: this.clock.now(), speed: Math.max(speed, 0.01), resolve };
      this.clock.frame(() => this.tick());
      this.host.requestRender();
    });
  }

  finishNow(): void {
    const run = this.running;
    if (!run) return;
    this.running = null;
    for (const t of run.tracks) {
      if (t.done) continue;
      if (!t.begun) {
        t.begun = true;
        t.begin?.();
      }
      t.done = true;
      t.complete();
    }
    this.clearEffects();
    this.host.scene.remove(this.effects);
    this.host.requestRender();
    run.resolve();
  }

  dispose(): void {
    this.finishNow();
    this.ringGeo.dispose();
    this.dotGeo.dispose();
  }

  private tick(): void {
    const run = this.running;
    if (!run) return;
    const elapsed = (this.clock.now() - run.startedAt) * run.speed;
    let pending = false;
    for (const t of run.tracks) {
      if (t.done) continue;
      if (elapsed < t.start) {
        pending = true;
        continue;
      }
      if (!t.begun) {
        t.begun = true;
        t.begin?.();
      }
      const k = t.duration > 0 ? Math.min(1, (elapsed - t.start) / t.duration) : 1;
      t.update(k);
      if (k >= 1) {
        t.done = true;
        t.complete();
      } else {
        pending = true;
      }
    }
    this.host.requestRender();
    if (!pending) {
      this.finishNow();
      return;
    }
    this.clock.frame(() => this.tick());
  }

  private buildTracks(ev: MoveEvent): Track[] {
    const tracks: Track[] = [];
    const squares = squareDistance(ev.from, ev.to);
    const travel = walkDuration(ev.piece, squares);

    if (ev.captured) {
      tracks.push(this.fallTrack(ev.captured.square, ev.from, travel * WALK_TIMINGS.contactAt));
    }
    tracks.push(...this.walkTracks(ev.piece, ev.color, ev.from, ev.to, 0));
    let at = travel + SETTLE_MS;

    if (ev.rookMove) {
      tracks.push(...this.walkTracks('r', ev.color, ev.rookMove.from, ev.rookMove.to, at));
      at += walkDuration('r', squareDistance(ev.rookMove.from, ev.rookMove.to)) + SETTLE_MS;
    }
    if (ev.special === 'promotion' && ev.promotion) {
      tracks.push(this.promoteTrack(ev.to, ev.promotion, ev.color, at));
      at += WALK_TIMINGS.promote;
    }

    const threatened = opposite(ev.color);
    if (ev.result.kind === 'checkmate') tracks.push(this.toppleTrack(threatened, ev.to, at));
    else if (ev.result.kind === 'ongoing' && ev.result.check) tracks.push(this.flinchTrack(threatened, ev.to, at));
    return tracks;
  }

  /** Bir taşın yürüyüşü ve ardından yere oturması. */
  private walkTracks(type: PieceType, color: Color, from: Square, to: Square, start: number): Track[] {
    const host = this.host;
    const a = squareToWorld(from);
    const b = squareToWorld(to);
    const squares = squareDistance(from, to);
    const duration = walkDuration(type, squares);
    const dir = b.clone().sub(a).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, baseYaw(color));
    const q = new THREE.Quaternion();
    const tmp = new THREE.Quaternion();
    let piece: THREE.Object3D | null = null;
    const trail: THREE.Mesh[] = [];

    const place = (k: number) => {
      if (!piece) return;
      const pose = walkPose(type, k, squares);
      piece.position.lerpVectors(a, b, travelEase(type, k));
      piece.position.y = pose.lift;
      // Önce kendi ekseninde dönüş, sonra gidiş yönüne göre eğilme ve yatma.
      q.setFromAxisAngle(side, pose.pitch);
      q.multiply(tmp.setFromAxisAngle(dir, pose.roll));
      q.multiply(tmp.setFromAxisAngle(UP, pose.yaw));
      q.multiply(yaw);
      piece.quaternion.copy(q);
    };

    const walk = track(start, duration, {
      begin: () => {
        piece = host.pieceAt(from);
        host.cue(footstepCue(type));
        if (type === 'b') {
          for (let i = 0; i < TRAIL_COUNT; i++) trail.push(this.addDot(color));
        }
      },
      update: (k) => {
        place(k);
        trail.forEach((dot, i) => {
          const lag = Math.max(0, k - (i + 1) * 0.035);
          const pose = walkPose(type, lag, squares);
          dot.position.lerpVectors(a, b, travelEase(type, lag));
          dot.position.y = pose.lift + 0.75;
          (dot.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - i / TRAIL_COUNT) * Math.sin(Math.PI * k);
        });
      },
      complete: () => {
        const p = piece ?? host.pieceAt(from);
        if (p) {
          p.position.copy(b);
          p.quaternion.copy(yaw);
        }
        for (const dot of trail) this.removeEffect(dot);
        host.movePieceRecord(from, to);
        host.cue('place');
      },
    });

    const settle = track(start + duration, SETTLE_MS, {
      begin: () => {
        // Kale durduğunda yer sarsılır: toz halkası.
        if (type === 'r' || type === 'n') this.spawnRing(b, start + duration);
      },
      update: (k) => {
        const p = piece ?? host.pieceAt(to);
        p?.scale.set(1, settleSquash(type, k), 1);
      },
      complete: () => {
        (piece ?? host.pieceAt(to))?.scale.set(1, 1, 1);
      },
    });
    return [walk, settle];
  }

  /** Alınan taş, saldıran ulaştığında geriye devrilir ve tahtadan kaybolur. */
  private fallTrack(square: Square, attackerFrom: Square, start: number): Track {
    const host = this.host;
    const pos = squareToWorld(square);
    const away = pos.clone().sub(squareToWorld(attackerFrom)).setY(0).normalize();
    const axis = new THREE.Vector3().crossVectors(UP, away).normalize();
    let victim: THREE.Object3D | null = null;
    let from = new THREE.Quaternion();
    const tmp = new THREE.Quaternion();
    return track(start, WALK_TIMINGS.fall, {
      begin: () => {
        // Kaydı hemen sil: saldıran aynı kareye yerleşecek.
        victim = host.detachPiece(square);
        if (victim) from = victim.quaternion.clone();
        host.cue('capture');
      },
      update: (k) => {
        if (!victim) return;
        const e = k * k;
        victim.quaternion.copy(tmp.setFromAxisAngle(axis, (Math.PI / 2) * e)).multiply(from);
        victim.position.copy(pos).addScaledVector(away, 0.35 * e);
        victim.position.y = -0.25 * e;
        const s = 1 - 0.55 * e;
        victim.scale.set(s, s, s);
      },
      complete: () => {
        victim?.removeFromParent();
      },
    });
  }

  private promoteTrack(square: Square, to: PieceType, color: Color, start: number): Track {
    const host = this.host;
    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      host.replacePiece(square, to, color);
      host.cue('promote');
    };
    return track(start, WALK_TIMINGS.promote, {
      begin: () => this.spawnRing(squareToWorld(square), start, 0xfff2b0),
      update: (k) => {
        // Piyon küçülür, yeni taş büyüyerek belirir.
        if (k >= 0.5) swap();
        const s = k < 0.5 ? 1 - k * 1.6 : 0.2 + (k - 0.5) * 1.6;
        host.pieceAt(square)?.scale.set(s, s, s);
      },
      complete: () => {
        swap();
        host.pieceAt(square)?.scale.set(1, 1, 1);
      },
    });
  }

  /** Şah çekilen şah irkilir: geriye yaslanır ve titrer. */
  private flinchTrack(color: Color, threatFrom: Square, start: number): Track {
    const host = this.host;
    let king: { square: Square; object: THREE.Object3D } | null = null;
    let home = new THREE.Vector3();
    let axis = new THREE.Vector3(1, 0, 0);
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, baseYaw(color));
    const tmp = new THREE.Quaternion();
    return track(start, WALK_TIMINGS.flinch, {
      begin: () => {
        king = host.findPiece('k', color);
        if (!king) return;
        home = squareToWorld(king.square);
        const away = home.clone().sub(squareToWorld(threatFrom)).setY(0);
        if (away.lengthSq() > 0) axis = new THREE.Vector3().crossVectors(UP, away.normalize()).normalize();
      },
      update: (k) => {
        if (!king) return;
        const fade = Math.sin(Math.PI * k);
        king.object.quaternion.copy(tmp.setFromAxisAngle(axis, 0.22 * fade)).multiply(yaw);
        king.object.position.copy(home);
        king.object.position.x += 0.05 * Math.sin(k * Math.PI * 10) * fade;
      },
      complete: () => {
        if (!king) return;
        king.object.position.copy(home);
        king.object.quaternion.copy(yaw);
      },
    });
  }

  /** Mat olan şah devrilir ve öyle kalır; yeni konum geldiğinde sahne duruşu sıfırlar. */
  private toppleTrack(color: Color, threatFrom: Square, start: number): Track {
    const host = this.host;
    let king: { square: Square; object: THREE.Object3D } | null = null;
    let axis = new THREE.Vector3(0, 0, 1);
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, baseYaw(color));
    const tmp = new THREE.Quaternion();
    const pose = (k: number) => {
      if (!king) return;
      // Sonda hafifçe seken bir düşüş.
      const bounce = k < 0.8 ? (k / 0.8) ** 2 : 1 - 0.06 * Math.sin(((k - 0.8) / 0.2) * Math.PI);
      king.object.quaternion.copy(tmp.setFromAxisAngle(axis, (Math.PI / 2) * bounce)).multiply(yaw);
      king.object.position.y = 0.2 * Math.min(1, bounce);
    };
    return track(start, WALK_TIMINGS.topple, {
      begin: () => {
        king = host.findPiece('k', color);
        if (!king) return;
        const away = squareToWorld(king.square).sub(squareToWorld(threatFrom)).setY(0);
        if (away.lengthSq() > 0) axis = new THREE.Vector3().crossVectors(UP, away.normalize()).normalize();
      },
      update: pose,
      complete: () => pose(1),
    });
  }

  // ---------- Efektler ----------

  private addDot(color: Color): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({
      color: color === 'w' ? 0xfff0c0 : 0xb48cff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const dot = new THREE.Mesh(this.dotGeo, mat);
    this.effects.add(dot);
    return dot;
  }

  /** Yerde genişleyip sönen halka. Zaman çizelgesine kendi işini ekler. */
  private spawnRing(at: THREE.Vector3, start: number, color = 0xd8c9a8): void {
    const run = this.running;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.copy(at).setY(0.02);
    this.effects.add(ring);
    const t = track(start, WALK_TIMINGS.effect, {
      update: (k) => {
        const s = 1 + 1.6 * k;
        ring.scale.set(s, 1, s);
        mat.opacity = 0.6 * (1 - k);
      },
      complete: () => this.removeEffect(ring),
    });
    t.begun = true;
    // Canlandırma anında bitiriliyorsa (running yok) halka hiç gösterilmez.
    if (run) run.tracks.push(t);
    else this.removeEffect(ring);
  }

  private removeEffect(mesh: THREE.Mesh): void {
    this.effects.remove(mesh);
    (mesh.material as THREE.Material).dispose();
  }

  private clearEffects(): void {
    for (const child of [...this.effects.children]) this.removeEffect(child as THREE.Mesh);
  }
}
