import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { HandAnimator, type AnimationClock } from '../../../src/scene/animators/handAnimator';
import type { MoveAnimatorHost } from '../../../src/scene/animators/types';
import { squareToWorld } from '../../../src/scene/view3d/table';
import { Scene3D } from '../../../src/scene/view3d/scene3d';
import { ChessCore } from '../../../src/core/chessCore';
import type { Color, MoveEvent, PieceType, Square } from '../../../src/core/types';
import type { EllerTheme, MasaTheme, OrtamTheme, TaslarTheme } from '../../../src/themes/types';

const eller: EllerTheme = { id: 'sade', tur: 'eller', ad: { tr: 'a', en: 'b' }, baseUrl: '', renk: '#d9a47e' };

/** Elle ilerletilen saat. */
function fakeClock() {
  let now = 0;
  let queue: Array<() => void> = [];
  const clock: AnimationClock = {
    now: () => now,
    frame: (cb) => {
      queue.push(cb);
    },
  };
  /** Zamanı `ms` kadar, `step` ms'lik karelerle ilerletir. */
  const advance = (ms: number, step = 16) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + step);
      const run = queue;
      queue = [];
      for (const cb of run) cb();
    }
  };
  return { clock, advance, pending: () => queue.length };
}

function fakeHost(core: ChessCore) {
  const scene = new THREE.Scene();
  const pieces = new Map<Square, THREE.Object3D>();
  const add = (sq: Square, piece: PieceType, color: Color) => {
    const o = new THREE.Object3D();
    o.userData = { piece, color };
    o.position.copy(squareToWorld(sq));
    scene.add(o);
    pieces.set(sq, o);
  };
  for (const p of core.pieces()) add(p.square, p.piece, p.color);
  const host: MoveAnimatorHost = {
    scene,
    pieceAt: (sq) => pieces.get(sq) ?? null,
    removePiece: (sq) => {
      const o = pieces.get(sq);
      if (o) scene.remove(o);
      pieces.delete(sq);
    },
    movePieceRecord: (from, to) => {
      const o = pieces.get(from);
      if (!o) return;
      pieces.delete(from);
      pieces.set(to, o);
    },
    replacePiece: (sq, type, color) => {
      host.removePiece(sq);
      add(sq, type, color);
    },
    requestRender: () => {},
  };
  return { host, pieces, scene };
}

function play(core: ChessCore, ...moves: string[]): MoveEvent {
  let ev: MoveEvent | null = null;
  for (const m of moves) ev = core.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: (m[4] as PieceType) || undefined });
  return ev!;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const NORMAL_MOVE_MS = 350 + 120 + 450 + 120 + 300;

describe('HandAnimator', () => {
  test('normal hamle bitince taş hedef karededir ve el sahneden kalkar', async () => {
    const core = new ChessCore();
    const { host, pieces, scene } = fakeHost(core);
    const { clock, advance } = fakeClock();
    const anim = new HandAnimator(host, eller, clock);
    const before = scene.children.length;
    let done = false;
    void anim.play(play(core, 'e2e4'), 1).then(() => (done = true));
    expect(scene.children.length).toBe(before + 1);

    advance(NORMAL_MOVE_MS - 50);
    await flush();
    expect(done).toBe(false);

    advance(100);
    await flush();
    expect(done).toBe(true);
    expect(pieces.has('e2')).toBe(false);
    expect(pieces.get('e4')!.position.toArray()).toEqual(squareToWorld('e4').toArray());
    expect(scene.children.length).toBe(before);
  });

  test('taşıma sırasında taş havaya kalkar', () => {
    const core = new ChessCore();
    const { host, pieces } = fakeHost(core);
    const { clock, advance } = fakeClock();
    const anim = new HandAnimator(host, eller, clock);
    const pawn = pieces.get('e2')!;
    void anim.play(play(core, 'e2e4'), 1);
    advance(350 + 120 + 225);
    expect(pawn.position.y).toBeGreaterThan(0.8);
    expect(pawn.position.z).toBeLessThan(squareToWorld('e2').z);
    expect(pawn.position.z).toBeGreaterThan(squareToWorld('e4').z);
  });

  test('taş almada alınan taş sahneden kaldırılır', async () => {
    const core = new ChessCore();
    play(core, 'e2e4', 'd7d5');
    const { host, pieces, scene } = fakeHost(core);
    const captured = pieces.get('d5')!;
    const { clock, advance } = fakeClock();
    const anim = new HandAnimator(host, eller, clock);
    const p = anim.play(play(core, 'e4d5'), 1);
    advance(5000);
    await p;
    expect(scene.children).not.toContain(captured);
    expect(pieces.get('d5')!.userData).toMatchObject({ piece: 'p', color: 'w' });
    expect(pieces.has('e4')).toBe(false);
  });

  test('rokta şah ve kale yer değiştirir', async () => {
    const core = new ChessCore('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const { host, pieces } = fakeHost(core);
    const { clock, advance } = fakeClock();
    const anim = new HandAnimator(host, eller, clock);
    const p = anim.play(play(core, 'e1g1'), 1);
    advance(6000);
    await p;
    expect(pieces.get('g1')!.userData.piece).toBe('k');
    expect(pieces.get('f1')!.userData.piece).toBe('r');
    expect(pieces.has('e1')).toBe(false);
    expect(pieces.has('h1')).toBe(false);
  });

  test('terfide piyon seçilen taşa dönüşür', async () => {
    const core = new ChessCore('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const { host, pieces } = fakeHost(core);
    const { clock, advance } = fakeClock();
    const anim = new HandAnimator(host, eller, clock);
    const p = anim.play(play(core, 'a7a8q'), 1);
    advance(6000);
    await p;
    expect(pieces.get('a8')!.userData).toMatchObject({ piece: 'q', color: 'w' });
  });

  test('hız 3 iken süre üçe bölünür', async () => {
    const core = new ChessCore();
    const { host } = fakeHost(core);
    const { clock, advance } = fakeClock();
    const anim = new HandAnimator(host, eller, clock);
    let done = false;
    void anim.play(play(core, 'e2e4'), 3).then(() => (done = true));
    advance(NORMAL_MOVE_MS / 3 - 40, 8);
    await flush();
    expect(done).toBe(false);
    advance(80, 8);
    await flush();
    expect(done).toBe(true);
  });

  test('süreye dayalıdır: sekme uzun süre gizli kalsa tek karede tamamlanır', async () => {
    const core = new ChessCore();
    const { host, pieces } = fakeHost(core);
    const { clock, advance } = fakeClock();
    const anim = new HandAnimator(host, eller, clock);
    const p = anim.play(play(core, 'e2e4'), 1);
    advance(10_000, 10_000);
    await p;
    expect(pieces.get('e4')!.position.toArray()).toEqual(squareToWorld('e4').toArray());
  });

  test('finishNow: söz çözülür, taş hedefte, el sahnede değil; sonraki hamle normal çalışır', async () => {
    const core = new ChessCore();
    const { host, pieces, scene } = fakeHost(core);
    const { clock, advance } = fakeClock();
    const anim = new HandAnimator(host, eller, clock);
    const before = scene.children.length;

    const first = anim.play(play(core, 'e2e4'), 1);
    advance(500);
    anim.finishNow();
    await first;
    expect(pieces.get('e4')!.position.toArray()).toEqual(squareToWorld('e4').toArray());
    expect(pieces.has('e2')).toBe(false);
    expect(scene.children.length).toBe(before);

    const second = anim.play(play(core, 'e7e5'), 1);
    advance(5000);
    await second;
    expect(pieces.get('e5')!.userData).toMatchObject({ piece: 'p', color: 'b' });
    expect(scene.children.length).toBe(before);
  });

  test('finishNow taş alma ortasında çağrılırsa alınan taş yine kaldırılır', async () => {
    const core = new ChessCore();
    play(core, 'e2e4', 'd7d5');
    const { host, pieces } = fakeHost(core);
    const { clock, advance } = fakeClock();
    const anim = new HandAnimator(host, eller, clock);
    const p = anim.play(play(core, 'e4d5'), 1);
    advance(100);
    anim.finishNow();
    await p;
    expect(pieces.get('d5')!.userData.color).toBe('w');
    expect(pieces.size).toBe(31);
  });

  test('canlandırma yokken finishNow zararsızdır', () => {
    const { host } = fakeHost(new ChessCore());
    const anim = new HandAnimator(host, eller, fakeClock().clock);
    expect(() => anim.finishNow()).not.toThrow();
  });
});

describe('Scene3D + HandAnimator', () => {
  const ortam: OrtamTheme = {
    id: 'o', tur: 'ortam', ad: { tr: 'a', en: 'b' }, baseUrl: '',
    arkaPlan: '#1b1a22', zemin: '#2b2622', isikRengi: '#fff1d6', isikSiddeti: 2.2,
  };
  const masa: MasaTheme = {
    id: 'm', tur: 'masa', ad: { tr: 'a', en: 'b' }, baseUrl: '',
    acikKare: '#e8d2a6', koyuKare: '#8a5a3c', cerceve: '#4a2f1e', masaRengi: '#3a261a',
  };
  const taslar: TaslarTheme = {
    id: 't', tur: 'taslar', ad: { tr: 'a', en: 'b' }, baseUrl: '', beyaz: '#f2e9d8', siyah: '#2a2420', parlaklik: 0.45,
  };

  test('art arda iki hamle: ilki anında tamamlanır, son konum ikinci hamleninkidir', async () => {
    const core = new ChessCore();
    const scene = new Scene3D({ ortam, masa, taslar }, 'low');
    const { clock, advance } = fakeClock();
    scene.setAnimator(new HandAnimator(scene, eller, clock));
    scene.setPosition(core.pieces());

    const ev1 = play(core, 'e2e4');
    const after1 = core.pieces();
    const first = scene.applyMove(ev1, after1);
    advance(300);
    const ev2 = play(core, 'e7e5');
    const second = scene.applyMove(ev2, core.pieces());
    await first;
    expect(scene.pieceAt('e4')?.userData.piece).toBe('p');
    expect(scene.pieceAt('e2')).toBeNull();

    advance(5000);
    await second;
    expect(scene.pieceAt('e5')?.userData).toMatchObject({ piece: 'p', color: 'b' });
    expect(scene.pieceAt('e7')).toBeNull();
    expect(scene.pieceAt('e4')?.position.toArray()).toEqual(squareToWorld('e4').toArray());
  });

  test('canlandırma sürerken setPosition (geri alma) taşı havada bırakmaz', async () => {
    const core = new ChessCore();
    const scene = new Scene3D({ ortam, masa, taslar }, 'low');
    const { clock, advance } = fakeClock();
    scene.setAnimator(new HandAnimator(scene, eller, clock));
    scene.setPosition(core.pieces());
    const start = core.pieces();

    const p = scene.applyMove(play(core, 'e2e4'), core.pieces());
    advance(700);
    scene.setPosition(start);
    await p;
    expect(scene.pieceAt('e2')?.position.toArray()).toEqual(squareToWorld('e2').toArray());
    expect(scene.pieceAt('e4')).toBeNull();
  });

  test('animatör yokken hamle anında gösterilir', async () => {
    const core = new ChessCore();
    const scene = new Scene3D({ ortam, masa, taslar }, 'low');
    scene.setPosition(core.pieces());
    await scene.applyMove(play(core, 'g1f3'), core.pieces());
    expect(scene.pieceAt('f3')?.userData.piece).toBe('n');
  });
});
