import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import type { Cue } from '../../../src/audio/cues';
import { ChessCore } from '../../../src/core/chessCore';
import type { Color, MoveEvent, PieceType, Square } from '../../../src/core/types';
import type { AnimationClock } from '../../../src/scene/animators/handAnimator';
import type { MoveAnimatorHost } from '../../../src/scene/animators/types';
import { WalkAnimator } from '../../../src/scene/animators/walkAnimator';
import { squareToWorld } from '../../../src/scene/view3d/table';

function fakeClock() {
  let now = 0;
  let queue: Array<() => void> = [];
  const clock: AnimationClock = { now: () => now, frame: (cb) => void queue.push(cb) };
  const advance = (ms: number, step = 16) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + step);
      const run = queue;
      queue = [];
      for (const cb of run) cb();
    }
  };
  return { clock, advance };
}

function fakeHost(core: ChessCore) {
  const scene = new THREE.Scene();
  const pieces = new Map<Square, THREE.Object3D>();
  const cues: Cue[] = [];
  const add = (sq: Square, piece: PieceType, color: Color) => {
    const o = new THREE.Object3D();
    o.userData = { piece, color };
    o.position.copy(squareToWorld(sq));
    o.rotation.y = color === 'w' ? 0 : Math.PI;
    scene.add(o);
    pieces.set(sq, o);
  };
  for (const p of core.pieces()) add(p.square, p.piece, p.color);
  const host: MoveAnimatorHost = {
    scene,
    pieceAt: (sq) => pieces.get(sq) ?? null,
    removePiece: (sq) => {
      pieces.get(sq)?.removeFromParent();
      pieces.delete(sq);
    },
    movePieceRecord: (from, to) => {
      const o = pieces.get(from);
      if (!o) return;
      pieces.delete(from);
      pieces.set(to, o);
    },
    replacePiece: (sq, type, color) => {
      pieces.get(sq)?.removeFromParent();
      pieces.delete(sq);
      add(sq, type, color);
    },
    detachPiece: (sq) => {
      const o = pieces.get(sq) ?? null;
      pieces.delete(sq);
      return o;
    },
    findPiece: (type, color) => {
      for (const [square, object] of pieces) {
        if (object.userData.piece === type && object.userData.color === color) return { square, object };
      }
      return null;
    },
    cue: (c) => void cues.push(c),
    requestRender: () => {},
  };
  return { host, scene, pieces, cues };
}

/** `moves` oynanır; son hamlenin olayı ve o hamleden önceki tahta döner. */
function setup(fen: string | undefined, before: string[], last: string) {
  const core = new ChessCore(fen);
  const mv = (m: string) => core.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: (m[4] as PieceType) || undefined })!;
  for (const m of before) mv(m);
  const h = fakeHost(core);
  const ev: MoveEvent = mv(last);
  const c = fakeClock();
  const animator = new WalkAnimator(h.host, c.clock);
  return { ...h, ...c, ev, animator, core };
}

const upright = (o: THREE.Object3D) => new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion).y;

/** Sahnedeki taşlar (efektler hariç). */
const pieceCount = (scene: THREE.Scene) => scene.children.filter((c) => c.userData.piece).length;

describe('WalkAnimator', () => {
  test('piyon hedefe yürür: yolda yerinden ayrılmış, sonunda tam karede ve dik', async () => {
    const s = setup(undefined, [], 'e2e4');
    const pawn = s.pieces.get('e2')!;
    let done = false;
    void s.animator.play(s.ev, 1).then(() => (done = true));
    s.advance(400);
    expect(done).toBe(false);
    expect(pawn.position.z).toBeLessThan(squareToWorld('e2').z);
    expect(pawn.position.z).toBeGreaterThan(squareToWorld('e4').z);
    s.advance(5000);
    await Promise.resolve();
    expect(done).toBe(true);
    expect(s.pieces.get('e4')).toBe(pawn);
    expect(s.pieces.has('e2')).toBe(false);
    expect(pawn.position.distanceTo(squareToWorld('e4'))).toBeCloseTo(0, 5);
    expect(upright(pawn)).toBeCloseTo(1, 5);
    expect(s.cues).toContain('step');
    expect(s.cues).toContain('place');
  });

  test('at sıçrar: yolun ortasında diğer taşların üzerindedir', () => {
    const s = setup(undefined, [], 'g1f3');
    const knight = s.pieces.get('g1')!;
    void s.animator.play(s.ev, 1);
    let peak = 0;
    for (let i = 0; i < 80; i++) {
      s.advance(16);
      peak = Math.max(peak, knight.position.y);
    }
    expect(peak).toBeGreaterThan(1.8);
    s.advance(3000);
    expect(knight.position.y).toBeCloseTo(0, 5);
    expect(s.cues[0]).toBe('jump');
  });

  test('taş alma: alınan taş sahneden kalkar, saldıran karesine yerleşir', () => {
    const s = setup(undefined, ['e2e4', 'd7d5'], 'e4d5');
    const attacker = s.pieces.get('e4')!;
    const victim = s.pieces.get('d5')!;
    const before = pieceCount(s.scene);
    void s.animator.play(s.ev, 1);
    s.advance(6000);
    expect(s.pieces.get('d5')).toBe(attacker);
    expect(victim.parent).toBeNull();
    expect(pieceCount(s.scene)).toBe(before - 1);
    expect(s.pieces.size).toBe(31);
    expect(s.cues).toContain('capture');
  });

  test('geçerken alma: alınan piyon kendi karesinden kalkar', () => {
    const s = setup(undefined, ['e2e4', 'a7a6', 'e4e5', 'd7d5'], 'e5d6');
    const victim = s.pieces.get('d5')!;
    void s.animator.play(s.ev, 1);
    s.advance(6000);
    expect(victim.parent).toBeNull();
    expect(s.pieces.has('d5')).toBe(false);
    expect(s.pieces.get('d6')!.userData.piece).toBe('p');
  });

  test('rok: önce şah, sonra kale yürür', () => {
    const s = setup('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', [], 'e1g1');
    const rook = s.pieces.get('h1')!;
    void s.animator.play(s.ev, 1);
    s.advance(600);
    expect(rook.position.distanceTo(squareToWorld('h1'))).toBeCloseTo(0, 5); // kale henüz bekliyor
    s.advance(8000);
    expect(s.pieces.get('g1')!.userData.piece).toBe('k');
    expect(s.pieces.get('f1')).toBe(rook);
    expect(rook.position.distanceTo(squareToWorld('f1'))).toBeCloseTo(0, 5);
  });

  test('terfi: piyon yerine seçilen taş gelir', () => {
    const s = setup('8/P7/8/8/8/8/8/k6K w - - 0 1', [], 'a7a8q');
    void s.animator.play(s.ev, 1);
    s.advance(6000);
    expect(s.pieces.get('a8')!.userData.piece).toBe('q');
    expect(s.pieces.get('a8')!.scale.x).toBeCloseTo(1, 5);
    expect(s.cues).toContain('promote');
  });

  test('şah çekilen şah irkilir ve sonra düzelir', () => {
    const s = setup(undefined, ['e2e4', 'f7f6'], 'd1h5');
    const king = s.pieces.get('e8')!;
    void s.animator.play(s.ev, 1);
    let minUpright = 1;
    for (let i = 0; i < 400; i++) {
      s.advance(16);
      minUpright = Math.min(minUpright, upright(king));
    }
    expect(minUpright).toBeLessThan(0.99);
    expect(upright(king)).toBeCloseTo(1, 5);
    expect(king.position.distanceTo(squareToWorld('e8'))).toBeCloseTo(0, 5);
  });

  test('mat olan şah devrilir ve devrik kalır', () => {
    const s = setup(undefined, ['f2f3', 'e7e5', 'g2g4'], 'd8h4');
    const king = s.pieces.get('e1')!;
    void s.animator.play(s.ev, 1);
    s.advance(8000);
    expect(upright(king)).toBeCloseTo(0, 2);
    expect(s.pieces.get('e1')).toBe(king);
  });

  test('finishNow: yarıda kesilince tahta hamlenin sonucunu gösterir, efekt kalmaz', async () => {
    const s = setup(undefined, ['e2e4', 'd7d5'], 'e4d5');
    const attacker = s.pieces.get('e4')!;
    const victim = s.pieces.get('d5')!;
    const before = s.scene.children.length;
    let done = false;
    void s.animator.play(s.ev, 1).then(() => (done = true));
    s.advance(200);
    s.animator.finishNow();
    await Promise.resolve();
    expect(done).toBe(true);
    expect(s.pieces.get('d5')).toBe(attacker);
    expect(attacker.position.distanceTo(squareToWorld('d5'))).toBeCloseTo(0, 5);
    expect(upright(attacker)).toBeCloseTo(1, 5);
    expect(victim.parent).toBeNull();
    expect(s.scene.children.length).toBe(before - 1);
    s.advance(5000); // bekleyen kare çağrıları zararsız olmalı
    expect(s.pieces.get('d5')).toBe(attacker);
  });

  test('hız 3: süre üçe bölünür', async () => {
    const s = setup(undefined, [], 'e2e4');
    let done = false;
    void s.animator.play(s.ev, 3).then(() => (done = true));
    s.advance(700);
    await Promise.resolve();
    expect(done).toBe(true);
  });

  test('süreye dayalıdır: saat tek adımda ilerlese de tamamlanır', async () => {
    const s = setup(undefined, [], 'b1c3');
    let done = false;
    void s.animator.play(s.ev, 1).then(() => (done = true));
    s.advance(10_000, 10_000);
    await Promise.resolve();
    expect(done).toBe(true);
    expect(s.pieces.get('c3')!.userData.piece).toBe('n');
  });
});
