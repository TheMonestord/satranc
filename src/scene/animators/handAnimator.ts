import * as THREE from 'three';
import type { MoveEvent, PieceType, Square } from '../../core/types';
import type { EllerTheme } from '../../themes/types';
import { buildHand, type Hand } from '../view3d/hand';
import { PIECE_HEIGHTS } from '../view3d/pieces';
import { squareToWorld } from '../view3d/table';
import { planHandSteps, type HandStep } from './steps';
import type { MoveAnimator, MoveAnimatorHost } from './types';

export interface AnimationClock {
  now(): number;
  frame(cb: () => void): void;
}

const REAL_CLOCK: AnimationClock = {
  now: () => performance.now(),
  frame: (cb) => {
    requestAnimationFrame(() => cb());
  },
};

/** Normal hızdaki süreler (ms). Bir hamle yaklaşık 2,4 saniye sürer. */
export const HAND_TIMINGS = {
  reach: 600,
  grab: 220,
  carry: 800,
  release: 220,
  retreat: 550,
  removeReach: 450,
  removeGrab: 180,
  removeCarry: 450,
  removeRelease: 180,
  swap: 250,
};
const T = HAND_TIMINGS;
const LIFT = 1.2;
const REST_Y = 2.5;
const REST_Z = 6;
const SIDE_X = 5.5;

interface Phase {
  duration: number;
  enter?(): void;
  update(k: number): void;
}

/** Bir adımın canlandırma evreleri ve canlandırma ne kadar ilerlemiş olursa olsun sonucunu uygulayan `complete`. */
interface Action {
  phases: Phase[];
  complete(): void;
  done: boolean;
}

interface Segment {
  action: Action;
  phase: Phase;
  start: number;
  end: number;
  entered: boolean;
  lastOfAction: boolean;
}

const ease = (k: number) => k * k * (3 - 2 * k);

/** Eller modu: bir el taşı kavrar, kaldırır ve hedef kareye koyar. */
export class HandAnimator implements MoveAnimator {
  private hand: Hand;
  private running: {
    segments: Segment[];
    actions: Action[];
    cursor: number;
    startedAt: number;
    speed: number;
    resolve: () => void;
  } | null = null;

  constructor(
    private host: MoveAnimatorHost,
    eller: EllerTheme,
    private clock: AnimationClock = REAL_CLOCK,
  ) {
    this.hand = buildHand(eller);
  }

  play(ev: MoveEvent, speed: number): Promise<void> {
    this.finishNow();
    return new Promise<void>((resolve) => {
      const side = ev.color === 'w' ? 1 : -1;
      const rest = new THREE.Vector3(squareToWorld(ev.to).x * 0.4, REST_Y, side * REST_Z);
      this.hand.root.position.copy(rest);
      this.hand.root.rotation.y = ev.color === 'w' ? 0 : Math.PI;
      this.hand.setGrip(0);
      this.host.scene.add(this.hand.root);

      const steps = planHandSteps(ev);
      const actions = steps.map((s) => this.buildAction(s, side));
      // El yalnızca son adımdan sonra geri çekilir.
      actions.push(this.retreatAction(rest));

      const segments: Segment[] = [];
      let at = 0;
      for (const action of actions) {
        action.phases.forEach((phase, i) => {
          segments.push({
            action,
            phase,
            start: at,
            end: at + phase.duration,
            entered: false,
            lastOfAction: i === action.phases.length - 1,
          });
          at += phase.duration;
        });
      }
      this.running = { segments, actions, cursor: 0, startedAt: this.clock.now(), speed: Math.max(speed, 0.01), resolve };
      this.clock.frame(() => this.tick());
      this.host.requestRender();
    });
  }

  finishNow(): void {
    const run = this.running;
    if (!run) return;
    this.running = null;
    for (const action of run.actions) {
      if (!action.done) {
        action.done = true;
        action.complete();
      }
    }
    this.host.scene.remove(this.hand.root);
    this.host.requestRender();
    run.resolve();
  }

  dispose(): void {
    this.finishNow();
    this.hand.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
  }

  private tick(): void {
    const run = this.running;
    if (!run) return;
    // İlerleme kare sayısına değil geçen süreye bağlıdır.
    const elapsed = (this.clock.now() - run.startedAt) * run.speed;
    while (run.cursor < run.segments.length) {
      const seg = run.segments[run.cursor];
      if (!seg.entered) {
        seg.entered = true;
        seg.phase.enter?.();
      }
      if (elapsed < seg.end) {
        const k = seg.phase.duration > 0 ? (elapsed - seg.start) / seg.phase.duration : 1;
        seg.phase.update(Math.max(0, k));
        break;
      }
      seg.phase.update(1);
      if (seg.lastOfAction && !seg.action.done) {
        seg.action.done = true;
        seg.action.complete();
      }
      run.cursor++;
    }
    this.host.requestRender();
    if (run.cursor >= run.segments.length) {
      this.finishNow();
      return;
    }
    this.clock.frame(() => this.tick());
  }

  /** Elin, karedeki taşı kavrayacağı nokta. */
  private gripPoint(sq: Square, piece: THREE.Object3D | null): THREE.Vector3 {
    const type = piece?.userData.piece as PieceType | undefined;
    const height = type ? PIECE_HEIGHTS[type] : 1;
    return squareToWorld(sq).setY(height * 0.82);
  }

  private buildAction(step: HandStep, side: number): Action {
    const hand = this.hand;
    const host = this.host;

    if (step.kind === 'swap') {
      return {
        done: false,
        phases: [{ duration: T.swap, update: () => {} }],
        complete: () => host.replacePiece(step.square, step.to, step.color),
      };
    }

    const fromSq = step.kind === 'carry' ? step.from : step.square;
    let piece: THREE.Object3D | null = null;
    let grip = new THREE.Vector3();
    let offset = new THREE.Vector3();
    const reachFrom = new THREE.Vector3();
    /** Taşı ve kavrama noktasını adım başladığında çöz: önceki adımlar tahtayı değiştirmiş olabilir. */
    const resolve = () => {
      piece = host.pieceAt(fromSq);
      grip = this.gripPoint(fromSq, piece);
      offset = grip.clone().sub(squareToWorld(fromSq));
      reachFrom.copy(hand.root.position);
    };
    const reach: Phase = {
      duration: step.kind === 'carry' ? T.reach : T.removeReach,
      enter: resolve,
      update: (k) => hand.root.position.lerpVectors(reachFrom, grip, ease(k)),
    };
    const grab: Phase = {
      duration: step.kind === 'carry' ? T.grab : T.removeGrab,
      update: (k) => hand.setGrip(k),
    };
    const follow = () => piece?.position.copy(hand.root.position).sub(offset);

    if (step.kind === 'carry') {
      const target = squareToWorld(step.to);
      return {
        done: false,
        phases: [
          reach,
          grab,
          {
            duration: T.carry,
            update: (k) => {
              const e = ease(k);
              hand.root.position.lerpVectors(grip, target.clone().add(offset), e);
              hand.root.position.y += LIFT * Math.sin(Math.PI * k);
              follow();
            },
          },
          {
            duration: T.release,
            update: (k) => {
              piece?.position.copy(target);
              hand.setGrip(1 - k);
            },
          },
        ],
        complete: () => {
          const p = piece ?? host.pieceAt(step.from);
          p?.position.copy(target);
          host.movePieceRecord(step.from, step.to);
        },
      };
    }

    // Alınan taş, hamleyi yapanın tarafında tahtanın yanına götürülür.
    const start = squareToWorld(step.square);
    const out = new THREE.Vector3(start.x >= 0 ? SIDE_X : -SIDE_X, 0.9, side * 3);
    return {
      done: false,
      phases: [
        reach,
        grab,
        {
          duration: T.removeCarry,
          update: (k) => {
            hand.root.position.lerpVectors(grip, out, ease(k));
            hand.root.position.y += 0.8 * Math.sin(Math.PI * k);
            follow();
          },
        },
        { duration: T.removeRelease, update: (k) => hand.setGrip(1 - k) },
      ],
      complete: () => host.removePiece(step.square),
    };
  }

  private retreatAction(rest: THREE.Vector3): Action {
    const from = new THREE.Vector3();
    return {
      done: false,
      phases: [
        {
          duration: T.retreat,
          enter: () => from.copy(this.hand.root.position),
          update: (k) => this.hand.root.position.lerpVectors(from, rest, ease(k)),
        },
      ],
      complete: () => {},
    };
  }
}
