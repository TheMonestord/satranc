import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MoveEvent } from '../../../src/core/types';
import type { MoveAnimator } from '../../../src/scene/animators/types';
import { MOVE_GAP_MS, Scene3D } from '../../../src/scene/view3d/scene3d';
import { ThemeRegistry } from '../../../src/themes/registry';

const ev = (from: string, to: string, color: 'w' | 'b'): MoveEvent => ({
  piece: 'p', color, from, to, special: 'none', san: to, fenAfter: '', result: { kind: 'ongoing', check: false },
});

async function makeScene() {
  const registry = await ThemeRegistry.load('yok/', (async () => ({ ok: false }) as Response) as typeof fetch);
  const themes = registry.resolve({ ortam: 'klasik-oda', masa: 'ahsap', taslar: 'klasik', eller: 'sade' });
  const scene = new Scene3D(themes, 'low');
  const finishers: Array<() => void> = [];
  const animator: MoveAnimator = {
    play: vi.fn(() => new Promise<void>((resolve) => finishers.push(resolve))),
    finishNow: vi.fn(),
    dispose: vi.fn(),
  };
  scene.setAnimator(animator);
  return { scene, animator, finishers };
}

describe('Scene3D hamle sırası', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('ikinci hamle, ilkinin canlandırması bitmeden başlamaz ve arada kısa bir duraklama olur', async () => {
    const { scene, animator, finishers } = await makeScene();
    void scene.applyMove(ev('e2', 'e4', 'w'), []);
    await vi.advanceTimersByTimeAsync(0);
    expect(animator.play).toHaveBeenCalledTimes(1);

    void scene.applyMove(ev('e7', 'e5', 'b'), []);
    await vi.advanceTimersByTimeAsync(5000);
    expect(animator.play).toHaveBeenCalledTimes(1); // ilk el hâlâ taşıyor

    finishers[0]();
    await vi.advanceTimersByTimeAsync(MOVE_GAP_MS - 1);
    expect(animator.play).toHaveBeenCalledTimes(1); // duraklama sürüyor
    await vi.advanceTimersByTimeAsync(1);
    expect(animator.play).toHaveBeenCalledTimes(2);
  });

  test('tek başına gelen hamle beklemeden başlar', async () => {
    const { scene, animator } = await makeScene();
    void scene.applyMove(ev('e2', 'e4', 'w'), []);
    await vi.advanceTimersByTimeAsync(0);
    expect(animator.play).toHaveBeenCalledTimes(1);
  });

  test('setPosition (geri alma) sıradaki hamleyi iptal eder', async () => {
    const { scene, animator, finishers } = await makeScene();
    void scene.applyMove(ev('e2', 'e4', 'w'), []);
    void scene.applyMove(ev('e7', 'e5', 'b'), []);
    await vi.advanceTimersByTimeAsync(0);
    scene.setPosition([]);
    finishers[0]();
    await vi.advanceTimersByTimeAsync(MOVE_GAP_MS * 3);
    expect(animator.play).toHaveBeenCalledTimes(1);
  });
});
